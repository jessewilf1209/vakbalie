import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Een klant (tenant) volledig verwijderen: foto's in Storage, alle rijen in
 * de database (via on delete cascade) en de accounts die alleen bij deze
 * klant hoorden. Nodig bij opzegging (AVG art. 17 en 28, de
 * verwerkersovereenkomst).
 *
 * Alleen aan te roepen met de service-role, vanuit
 * scripts/verwijder-tenant.mjs. Bewust geen knop in /admin
 *: onomkeerbaar, dus droogloop en bevestiging.
 *
 * Veiligheidsregels:
 * - De klant moet eerst op "inactief" staan. Dan werkt de widget al niet
 *   meer en is de verwijdering een bewuste tweede stap.
 * - De bevestiging moet exact de klantnaam zijn.
 * - Volgorde: eerst Storage, dan de database, dan de accounts. Faalt
 *   Storage, dan stopt het en bestaat de klant nog; opnieuw draaien ruimt
 *   de rest op. Andersom zouden er foto's achterblijven die niemand meer
 *   kan vinden (de paden staan in de rijen die weg zijn).
 * - Accounts die ook bij een andere klant horen, of het beheeraccount,
 *   blijven staan.
 * - Logs en de auditregel bevatten alleen id's, geen namen of e-mails.
 *
 * Let op: de meetdata (llm_gebruik, gebruik_events) gaat via de cascade ook
 * weg. Exporteer eerst het verbruik als je nog moet factureren.
 */

/**
 * Eigen foutklasse in plaats van BeheerFout: het script laadt dit bestand
 * rechtstreeks met Node, en Node vereist .ts-extensies in relatieve
 * imports (die tsconfig hier niet toestaat). Daarom importeert dit bestand
 * niets uit de eigen code.
 */
export class VerwijderFout extends Error {
  constructor(melding: string) {
    super(melding);
    this.name = "VerwijderFout";
  }
}

export interface VerwijderContext {
  /** Ingelogde platform-admin, of null als het script het doet. */
  adminId: string | null;
  bron: "dashboard" | "script";
}

const BUCKET = "lead-fotos";
const STORAGE_BATCH = 100;

export interface TenantVerwijderPlan {
  tenantId: string;
  naam: string;
  status: string;
  aantalLeads: number;
  aantalGesprekken: number;
  fotoPaden: string[];
  /** Accounts die alleen bij deze klant horen en dus mee verwijderd worden. */
  teVerwijderenGebruikers: string[];
  /** Accounts die blijven (lid van een andere klant of beheeraccount). */
  aantalBlijvendeGebruikers: number;
}

export interface Lidmaatschap {
  user_id: string;
  tenant_id: string;
}

/**
 * Welke leden van deze klant mogen weg? Alleen wie geen andere klant heeft
 * en geen beheeraccount is. Pure functie, apart getest.
 */
export function kiesTeVerwijderenGebruikers(
  tenantId: string,
  lidmaatschappen: Lidmaatschap[],
  beheerAccounts: ReadonlySet<string>,
): { verwijderen: string[]; blijven: string[] } {
  const leden = new Set(
    lidmaatschappen.filter((l) => l.tenant_id === tenantId).map((l) => l.user_id),
  );
  const verwijderen: string[] = [];
  const blijven: string[] = [];
  for (const gebruiker of leden) {
    const elders = lidmaatschappen.some((l) => l.user_id === gebruiker && l.tenant_id !== tenantId);
    if (elders || beheerAccounts.has(gebruiker)) blijven.push(gebruiker);
    else verwijderen.push(gebruiker);
  }
  return { verwijderen, blijven };
}

/** Alle objecten onder `<tenantId>/` in de bucket, ook zonder rij in de database. */
async function lijstStorage(supabase: SupabaseClient, tenantId: string): Promise<string[]> {
  const paden: string[] = [];
  const mappen = await supabase.storage.from(BUCKET).list(tenantId, { limit: 1000 });
  if (mappen.error) throw new VerwijderFout("Foto's opvragen mislukt.");
  for (const item of mappen.data ?? []) {
    // Een map (gesprek-id) heeft geen id; een los bestand wel.
    if (item.id) {
      paden.push(`${tenantId}/${item.name}`);
      continue;
    }
    for (let offset = 0; ; offset += 1000) {
      const inhoud = await supabase.storage
        .from(BUCKET)
        .list(`${tenantId}/${item.name}`, { limit: 1000, offset });
      if (inhoud.error) throw new VerwijderFout("Foto's opvragen mislukt.");
      const bestanden = (inhoud.data ?? []).filter((b) => b.id);
      paden.push(...bestanden.map((b) => `${tenantId}/${item.name}/${b.name}`));
      if ((inhoud.data ?? []).length < 1000) break;
    }
  }
  return paden;
}

/** Droogloop: wat zou er verdwijnen? Verandert niets. */
export async function planTenantVerwijdering(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<TenantVerwijderPlan> {
  const { data: tenant, error } = await supabase
    .from("tenants")
    .select("id, name, status")
    .eq("id", tenantId)
    .maybeSingle();
  if (error) throw new VerwijderFout("Klant ophalen mislukt.");
  if (!tenant) throw new VerwijderFout("Klant niet gevonden.");

  const telling = async (tabel: "leads" | "conversations") => {
    const { count, error: e } = await supabase
      .from(tabel)
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId);
    if (e) throw new VerwijderFout("Tellen mislukt.");
    return count ?? 0;
  };

  const [aantalLeads, aantalGesprekken] = await Promise.all([
    telling("leads"),
    telling("conversations"),
  ]);

  // Paden uit de database én uit Storage zelf: zo blijven ook foto's van
  // afgebroken gesprekken niet achter.
  const uitDatabase: string[] = [];
  for (const tabel of ["conversations", "leads"] as const) {
    const { data: rijen, error: padFout } = await supabase
      .from(tabel)
      .select("foto_paden")
      .eq("tenant_id", tenantId);
    if (padFout) throw new VerwijderFout("Foto's opvragen mislukt.");
    uitDatabase.push(...(rijen ?? []).flatMap((r) => (r.foto_paden as string[] | null) ?? []));
  }
  const uitStorage = await lijstStorage(supabase, tenantId);
  const fotoPaden = [...new Set([...uitDatabase, ...uitStorage])].filter((p) =>
    p.startsWith(`${tenantId}/`),
  );

  const { data: leden, error: ledenFout } = await supabase
    .from("tenant_users")
    .select("user_id, tenant_id")
    .eq("tenant_id", tenantId);
  if (ledenFout) throw new VerwijderFout("Gebruikers ophalen mislukt.");
  const ledenIds = (leden ?? []).map((l) => l.user_id as string);

  let alleLidmaatschappen: Lidmaatschap[] = [];
  const beheerAccounts = new Set<string>();
  if (ledenIds.length > 0) {
    const { data: elders, error: eldersFout } = await supabase
      .from("tenant_users")
      .select("user_id, tenant_id")
      .in("user_id", ledenIds);
    if (eldersFout) throw new VerwijderFout("Gebruikers ophalen mislukt.");
    alleLidmaatschappen = (elders ?? []) as Lidmaatschap[];
    for (const id of ledenIds) {
      const { data } = await supabase.auth.admin.getUserById(id);
      if (data.user?.app_metadata?.platform_admin === true) beheerAccounts.add(id);
    }
  }
  const { verwijderen, blijven } = kiesTeVerwijderenGebruikers(
    tenantId,
    alleLidmaatschappen,
    beheerAccounts,
  );

  return {
    tenantId,
    naam: tenant.name as string,
    status: tenant.status as string,
    aantalLeads,
    aantalGesprekken,
    fotoPaden,
    teVerwijderenGebruikers: verwijderen,
    aantalBlijvendeGebruikers: blijven.length,
  };
}

/** Voert de verwijdering uit. Gooit VerwijderFout met een melding zonder interne details. */
export async function verwijderTenant(
  supabase: SupabaseClient,
  tenantId: string,
  bevestiging: string,
  ctx: VerwijderContext,
): Promise<TenantVerwijderPlan> {
  const plan = await planTenantVerwijdering(supabase, tenantId);

  if (plan.status !== "inactive") {
    throw new VerwijderFout(
      "Zet de klant eerst op inactief. Dan stopt de widget en is dit een bewuste tweede stap.",
    );
  }
  if (bevestiging !== plan.naam) {
    throw new VerwijderFout("De bevestiging moet exact de klantnaam zijn.");
  }

  for (let i = 0; i < plan.fotoPaden.length; i += STORAGE_BATCH) {
    const { error } = await supabase.storage
      .from(BUCKET)
      .remove(plan.fotoPaden.slice(i, i + STORAGE_BATCH));
    if (error) {
      console.error("tenant-verwijdering: foto's verwijderen mislukt", { tenantId });
      throw new VerwijderFout(
        "Foto's verwijderen mislukt. Er is niets anders verwijderd; probeer het opnieuw.",
      );
    }
  }

  const { error: tenantFout } = await supabase.from("tenants").delete().eq("id", tenantId);
  if (tenantFout) {
    console.error("tenant-verwijdering: database mislukt", { tenantId, code: tenantFout.code });
    throw new VerwijderFout(
      "Klant verwijderen mislukt. De foto's zijn al weg; probeer het opnieuw.",
    );
  }

  const mislukteAccounts: string[] = [];
  for (const gebruiker of plan.teVerwijderenGebruikers) {
    const { error } = await supabase.auth.admin.deleteUser(gebruiker);
    if (error) mislukteAccounts.push(gebruiker);
  }

  const { error: auditFout } = await supabase.from("admin_audit").insert({
    admin_id: ctx.adminId,
    actie: "tenant_verwijderd",
    doel_tenant_id: tenantId,
    bron: ctx.bron,
  });

  if (mislukteAccounts.length > 0) {
    console.error("tenant-verwijdering: accounts niet verwijderd", { tenantId, mislukteAccounts });
    throw new VerwijderFout(
      `Klant verwijderd, maar ${mislukteAccounts.length} account(s) niet. Verwijder die in Supabase Auth.`,
    );
  }
  if (auditFout) {
    throw new VerwijderFout("Klant verwijderd, maar de auditregel kon niet worden geschreven.");
  }
  return plan;
}
