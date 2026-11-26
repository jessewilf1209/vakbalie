"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { vereisAdminActie } from "@/lib/admin/toegang";
import {
  BeheerFout,
  emailSchema,
  maakTenant,
  naamSchema,
  normaliseerOrigins,
  ROLLEN,
  STATUSSEN,
  voegGebruikerToe,
  type BeheerContext,
} from "@/lib/beheer/tenantbeheer";
import { isProductie } from "@/lib/config/env";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Beheeracties in /admin. Elke actie
 * begint met de guard: server actions zijn los aan te roepen, de layout
 * alleen beschermt ze niet.
 *
 * Bijwerken loopt via databasefuncties met de admin-sessie (die controleren
 * zelf op admin en schrijven de auditregel). Alleen aanmaken en uitnodigen
 * gebruiken de service-role, omdat de Auth Admin API dat vereist.
 */

export type BeheerStaat =
  | { status: "leeg" }
  | { status: "ok"; melding: string; waarschuwingen?: string[] }
  | { status: "fout"; meldingen: string[] };

const fout = (...meldingen: string[]): BeheerStaat => ({ status: "fout", meldingen });
const GEEN_TOEGANG = fout("Geen toegang. Log opnieuw in.");

const idSchema = z.guid();

const leegNaarNull = (waarde: FormDataEntryValue | null) => {
  const tekst = typeof waarde === "string" ? waarde.trim() : "";
  return tekst === "" ? null : tekst;
};

function context(adminId: string): BeheerContext {
  const basis = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return {
    adminId,
    bron: "dashboard",
    uitnodigingRedirect: `${basis}/auth/confirm?next=/dashboard/wachtwoord-instellen`,
  };
}

/** Database-fout naar een melding zonder interne details. */
function dbFout(code: string | undefined): BeheerStaat {
  if (code === "42501") return GEEN_TOEGANG;
  if (code === "P0002") return fout("Klant niet gevonden.");
  if (code === "22023" || code === "23514") return fout("De database weigerde deze waarde.");
  return fout("Opslaan mislukt. Probeer het opnieuw.");
}

/* ------------------------------------------------------------------ */

export async function statusActie(_: BeheerStaat, formData: FormData): Promise<BeheerStaat> {
  let ctx;
  try {
    ctx = await vereisAdminActie();
  } catch {
    return GEEN_TOEGANG;
  }
  const id = idSchema.safeParse(formData.get("tenantId"));
  const status = z.enum(STATUSSEN).safeParse(formData.get("status"));
  if (!id.success || !status.success) return fout("Ongeldige invoer.");

  const { error } = await ctx.supabase.rpc("admin_tenant_status_zetten", {
    p_tenant_id: id.data,
    p_status: status.data,
  });
  if (error) return dbFout(error.code);
  revalidatePath(`/admin/klanten/${id.data}`);
  return {
    status: "ok",
    melding:
      status.data === "inactive"
        ? "Klant staat op inactief: de widget is direct gestopt."
        : "Status opgeslagen.",
  };
}

export async function domeinenActie(_: BeheerStaat, formData: FormData): Promise<BeheerStaat> {
  let ctx;
  try {
    ctx = await vereisAdminActie();
  } catch {
    return GEEN_TOEGANG;
  }
  const id = idSchema.safeParse(formData.get("tenantId"));
  if (!id.success) return fout("Ongeldige invoer.");

  const invoer = String(formData.get("domeinen") ?? "").slice(0, 4000);
  const origins = normaliseerOrigins(invoer, { staLokaalToe: !isProductie() });
  if (!origins.ok) return fout(...origins.fouten);

  const { error } = await ctx.supabase.rpc("admin_tenant_domeinen_zetten", {
    p_tenant_id: id.data,
    p_origins: origins.origins,
  });
  if (error) return dbFout(error.code);
  revalidatePath(`/admin/klanten/${id.data}`);
  return { status: "ok", melding: "Domeinen opgeslagen.", waarschuwingen: origins.waarschuwingen };
}

const instellingenSchema = z.object({
  tenantId: idSchema,
  naam: naamSchema,
  contactEmail: emailSchema,
  notificationEmail: emailSchema.nullable(),
  widgetKleur: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Kleur moet een hexcode zijn, zoals #1f6f43."),
  welkomsttekst: z.string().max(300, "Welkomsttekst is te lang (max. 300).").nullable(),
  privacyUrl: z
    .url("Geen geldige privacy-URL.")
    .max(500)
    .regex(/^https?:\/\//, "Privacy-URL moet met http(s):// beginnen.")
    .nullable(),
});

export async function instellingenActie(_: BeheerStaat, formData: FormData): Promise<BeheerStaat> {
  let ctx;
  try {
    ctx = await vereisAdminActie();
  } catch {
    return GEEN_TOEGANG;
  }
  const parsed = instellingenSchema.safeParse({
    tenantId: formData.get("tenantId"),
    naam: formData.get("naam"),
    contactEmail: formData.get("contactEmail"),
    notificationEmail: leegNaarNull(formData.get("notificationEmail")),
    widgetKleur: formData.get("widgetKleur"),
    welkomsttekst: leegNaarNull(formData.get("welkomsttekst")),
    privacyUrl: leegNaarNull(formData.get("privacyUrl")),
  });
  if (!parsed.success) return fout(...parsed.error.issues.map((i) => i.message));

  const d = parsed.data;
  const { error } = await ctx.supabase.rpc("admin_tenant_instellingen_zetten", {
    p_tenant_id: d.tenantId,
    p_naam: d.naam,
    p_contact_email: d.contactEmail,
    p_notification_email: d.notificationEmail,
    p_widget_kleur: d.widgetKleur,
    p_welkomsttekst: d.welkomsttekst,
    p_privacy_url: d.privacyUrl,
  });
  if (error) return dbFout(error.code);
  revalidatePath(`/admin/klanten/${d.tenantId}`);
  return { status: "ok", melding: "Instellingen opgeslagen." };
}

export async function gebruikerToevoegenActie(
  _: BeheerStaat,
  formData: FormData,
): Promise<BeheerStaat> {
  let ctx;
  try {
    ctx = await vereisAdminActie();
  } catch {
    return GEEN_TOEGANG;
  }
  const id = idSchema.safeParse(formData.get("tenantId"));
  const email = emailSchema.safeParse(formData.get("email"));
  const rol = z.enum(ROLLEN).safeParse(formData.get("rol"));
  if (!id.success || !email.success || !rol.success) return fout("Vul een geldig e-mailadres in.");

  try {
    const r = await voegGebruikerToe(
      getSupabaseAdmin(),
      id.data,
      email.data,
      rol.data,
      context(ctx.adminId),
    );
    revalidatePath(`/admin/klanten/${id.data}`);
    return {
      status: "ok",
      melding: r.uitgenodigd ? "Uitnodiging verstuurd." : "Bestaand account gekoppeld.",
    };
  } catch (e) {
    return fout(e instanceof BeheerFout ? e.message : "Toevoegen mislukt.");
  }
}

export async function nieuweKlantActie(_: BeheerStaat, formData: FormData): Promise<BeheerStaat> {
  let ctx;
  try {
    ctx = await vereisAdminActie();
  } catch {
    return GEEN_TOEGANG;
  }

  const origins = normaliseerOrigins(String(formData.get("domeinen") ?? "").slice(0, 4000), {
    staLokaalToe: false,
  });
  if (!origins.ok) return fout(...origins.fouten);

  let tenantId: string;
  try {
    const r = await maakTenant(
      getSupabaseAdmin(),
      {
        naam: String(formData.get("naam") ?? ""),
        contactEmail: String(formData.get("contactEmail") ?? ""),
        eigenaarEmail: String(formData.get("eigenaarEmail") ?? ""),
        status: formData.get("status") === "active" ? "active" : "trial",
        origins: origins.origins,
      },
      context(ctx.adminId),
    );
    tenantId = r.tenantId;
  } catch (e) {
    if (e instanceof z.ZodError) return fout(...e.issues.map((i) => i.message));
    return fout(e instanceof BeheerFout ? e.message : "Aanmaken mislukt.");
  }
  revalidatePath("/admin/klanten");
  redirect(`/admin/klanten/${tenantId}?nieuw=1`);
}
