import { z } from "zod";
import type { SupabaseClient, User } from "@supabase/supabase-js";

/**
 * Gedeelde beheerlogica: gebruikt door
 * het admin-dashboard én door scripts/maak-tenant.mjs. Zo bestaat de
 * origin-validatie maar op één plek.
 *
 * Bewust zonder `@/`-imports en zonder TypeScript-syntax die Node niet kan
 * strippen (geen enums, geen parameter properties): het script laadt dit
 * bestand rechtstreeks met Node 23.6 of nieuwer.
 *
 * Aanmaken en uitnodigen vragen de Auth Admin API, dus de aanroeper geeft een
 * service-role-client mee. Die mag alleen in server-only code of in een
 * lokaal script bestaan.
 */

/* ------------------------------------------------------------------ *
 * Domeinen (allowed_origins)
 * ------------------------------------------------------------------ */

export const MAX_ORIGINS = 10;

const HOST_PATROON = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
const LOKALE_HOSTS = new Set(["localhost", "127.0.0.1"]);

export interface OriginResultaat {
  ok: boolean;
  origins: string[];
  fouten: string[];
  waarschuwingen: string[];
}

/**
 * Maakt van ingevoerde domeinen schone origins. Regels: https verplicht
 * (http alleen voor localhost bij lokaal testen), geen paden, query of
 * wildcards, maximaal tien. Waarschuwt als alleen www of alleen zonder www
 * is opgegeven: dan werkt de widget op de andere variant niet
 */
export function normaliseerOrigins(
  invoer: string | string[],
  opties: { staLokaalToe: boolean },
): OriginResultaat {
  const regels = (Array.isArray(invoer) ? invoer : invoer.split(/[\s,]+/))
    .map((r) => r.trim())
    .filter((r) => r.length > 0);

  const fouten: string[] = [];
  const origins: string[] = [];

  for (const regel of regels) {
    if (regel.includes("*")) {
      fouten.push(`${regel}: geen wildcards, noem elk domein apart.`);
      continue;
    }
    let url: URL;
    try {
      url = new URL(regel);
    } catch {
      fouten.push(`${regel}: geen geldig adres. Begin met https://`);
      continue;
    }
    const lokaal = LOKALE_HOSTS.has(url.hostname);
    if (url.protocol !== "https:" && !(opties.staLokaalToe && lokaal && url.protocol === "http:")) {
      fouten.push(`${regel}: alleen https:// is toegestaan.`);
      continue;
    }
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/") {
      fouten.push(`${regel}: alleen het domein, zonder pad of parameters.`);
      continue;
    }
    // Het pad mag ook in de invoer niet staan ("https://x.nl/" is goed).
    if (/^[a-z]+:\/\/[^/]+\/./i.test(regel)) {
      fouten.push(`${regel}: alleen het domein, zonder pad of parameters.`);
      continue;
    }
    if (!lokaal && !HOST_PATROON.test(url.hostname)) {
      fouten.push(`${regel}: geen geldig domein.`);
      continue;
    }
    if (!origins.includes(url.origin)) origins.push(url.origin);
  }

  if (origins.length > MAX_ORIGINS) {
    fouten.push(`Maximaal ${MAX_ORIGINS} domeinen.`);
  }

  const waarschuwingen: string[] = [];
  const hosts = new Set(origins.map((o) => new URL(o).hostname));
  for (const host of hosts) {
    if (LOKALE_HOSTS.has(host)) continue;
    const tegenhanger = host.startsWith("www.") ? host.slice(4) : `www.${host}`;
    if (!hosts.has(tegenhanger)) {
      waarschuwingen.push(
        `Alleen ${host} staat erin. Is de site ook bereikbaar via ${tegenhanger}? Voeg die dan ook toe, anders werkt de widget daar niet.`,
      );
    }
  }

  return { ok: fouten.length === 0, origins, fouten, waarschuwingen };
}

/* ------------------------------------------------------------------ *
 * Invoer
 * ------------------------------------------------------------------ */

export const naamSchema = z
  .string()
  .trim()
  .min(1, "Naam ontbreekt.")
  .max(120, "Naam is te lang.")
  .regex(/^[^<>]*$/, "Geen < of > in de naam.");

export const emailSchema = z
  .email("Geen geldig e-mailadres.")
  .max(254)
  .transform((e) => e.toLowerCase());

export const STATUSSEN = ["trial", "active", "inactive"] as const;
export const ROLLEN = ["owner", "member"] as const;

export const nieuweTenantSchema = z.object({
  naam: naamSchema,
  contactEmail: emailSchema,
  eigenaarEmail: emailSchema,
  status: z.enum(["trial", "active"]).default("trial"),
  /** Al genormaliseerd met normaliseerOrigins. */
  origins: z.array(z.string()).max(MAX_ORIGINS),
});
export type NieuweTenant = z.input<typeof nieuweTenantSchema>;

/* ------------------------------------------------------------------ *
 * Acties met de service-role
 * ------------------------------------------------------------------ */

/** Fout met een melding die veilig aan de beheerder getoond kan worden. */
export class BeheerFout extends Error {
  constructor(melding: string) {
    super(melding);
    this.name = "BeheerFout";
  }
}

export interface BeheerContext {
  /** Ingelogde platform-admin, of null als het script het doet. */
  adminId: string | null;
  bron: "dashboard" | "script";
  /** Waar de uitnodigingslink naartoe gaat, bijvoorbeeld https://app.../auth/confirm?next=... */
  uitnodigingRedirect: string;
}

async function zoekGebruikerOpEmail(supabase: SupabaseClient, email: string): Promise<User | null> {
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new BeheerFout("Gebruikers ophalen mislukt.");
    const gevonden = data.users.find((u) => u.email?.toLowerCase() === email);
    if (gevonden) return gevonden;
    if (data.users.length < 1000) return null;
  }
  return null;
}

async function schrijfAudit(
  supabase: SupabaseClient,
  ctx: BeheerContext,
  actie: "tenant_aangemaakt" | "gebruiker_toegevoegd",
  tenantId: string,
): Promise<void> {
  const { error } = await supabase
    .from("admin_audit")
    .insert({ admin_id: ctx.adminId, actie, doel_tenant_id: tenantId, bron: ctx.bron });
  // Zonder auditregel geen stille actie: de aanroeper krijgt een fout.
  if (error) throw new BeheerFout("Auditregel schrijven mislukt.");
}

/**
 * Zoekt of nodigt een gebruiker uit en koppelt hem aan de tenant. Weigert
 * het platform-admin-account: dat mag nooit tenantlid zijn.
 */
async function koppelGebruiker(
  supabase: SupabaseClient,
  tenantId: string,
  email: string,
  rol: (typeof ROLLEN)[number],
  ctx: BeheerContext,
): Promise<{ userId: string; uitgenodigd: boolean }> {
  let gebruiker = await zoekGebruikerOpEmail(supabase, email);
  if (gebruiker?.app_metadata?.platform_admin === true) {
    throw new BeheerFout("Dit is het beheeraccount; dat kan geen lid van een klant zijn.");
  }

  let uitgenodigd = false;
  if (!gebruiker) {
    const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo: ctx.uitnodigingRedirect,
    });
    if (error || !data.user) throw new BeheerFout("Uitnodiging versturen mislukt.");
    gebruiker = data.user;
    uitgenodigd = true;
  }

  const { error } = await supabase
    .from("tenant_users")
    .upsert(
      { tenant_id: tenantId, user_id: gebruiker.id, role: rol },
      { onConflict: "tenant_id,user_id" },
    );
  if (error) {
    if (uitgenodigd) await supabase.auth.admin.deleteUser(gebruiker.id);
    throw new BeheerFout("Gebruiker koppelen mislukt.");
  }
  return { userId: gebruiker.id, uitgenodigd };
}

/**
 * Nieuwe klant: tenant, eigenaar (bestaand account of uitnodiging), koppeling
 * en auditregel. Mislukt een stap na het aanmaken van de tenant, dan wordt
 * die weer verwijderd: geen halve klanten.
 */
export async function maakTenant(
  supabase: SupabaseClient,
  invoer: NieuweTenant,
  ctx: BeheerContext,
): Promise<{ tenantId: string; uitgenodigd: boolean }> {
  const data = nieuweTenantSchema.parse(invoer);
  const origins = normaliseerOrigins(data.origins, { staLokaalToe: false });
  if (!origins.ok) throw new BeheerFout(origins.fouten.join(" "));

  // Vooraf, zodat er voor het beheeraccount nooit een tenant ontstaat.
  const bestaand = await zoekGebruikerOpEmail(supabase, data.eigenaarEmail);
  if (bestaand?.app_metadata?.platform_admin === true) {
    throw new BeheerFout("Dit is het beheeraccount; dat kan geen lid van een klant zijn.");
  }

  const { data: tenant, error } = await supabase
    .from("tenants")
    .insert({
      name: data.naam,
      contact_email: data.contactEmail,
      status: data.status,
      allowed_origins: origins.origins,
    })
    .select("id")
    .single();
  if (error || !tenant) throw new BeheerFout("Klant aanmaken mislukt.");

  try {
    const { uitgenodigd } = await koppelGebruiker(
      supabase,
      tenant.id,
      data.eigenaarEmail,
      "owner",
      ctx,
    );
    await schrijfAudit(supabase, ctx, "tenant_aangemaakt", tenant.id);
    return { tenantId: tenant.id, uitgenodigd };
  } catch (fout) {
    await supabase.from("tenants").delete().eq("id", tenant.id);
    throw fout instanceof BeheerFout ? fout : new BeheerFout("Klant aanmaken mislukt.");
  }
}

export async function voegGebruikerToe(
  supabase: SupabaseClient,
  tenantId: string,
  email: string,
  rol: (typeof ROLLEN)[number],
  ctx: BeheerContext,
): Promise<{ uitgenodigd: boolean }> {
  const schoonEmail = emailSchema.parse(email);
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id")
    .eq("id", tenantId)
    .maybeSingle();
  if (!tenant) throw new BeheerFout("Klant niet gevonden.");

  const { uitgenodigd } = await koppelGebruiker(supabase, tenantId, schoonEmail, rol, ctx);
  await schrijfAudit(supabase, ctx, "gebruiker_toegevoegd", tenantId);
  return { uitgenodigd };
}
