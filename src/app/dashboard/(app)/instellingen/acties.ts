"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSupabaseServer } from "@/lib/supabase/server";
import { checkRateLimits, RATE_LIMITS } from "@/lib/api/rate-limit";
import { getEmailProvider } from "@/lib/email";
import { escapeHtml, veiligOnderwerp } from "@/lib/email/nieuwe-lead-template";

/**
 * Instellingen-actie. Autorisatie ligt in de database:
 * de RLS-policy beperkt tot owners van de eigen tenant, kolom-grants
 * beperken tot precies deze vier kolommen (migration 20260612000001).
 * Zod valideert de inhoud vóór de update; de DB-checks (hex, maxlengte,
 * http-url) vangen wat hier ooit doorheen zou glippen.
 */

const leegNaarNull = (waarde: FormDataEntryValue | null) => {
  const tekst = typeof waarde === "string" ? waarde.trim() : "";
  return tekst === "" ? null : tekst;
};

const instellingenSchema = z.object({
  // z.guid() en niet z.uuid(): Postgres accepteert elke 8-4-4-4-12-hexvorm,
  // z.uuid() eist een RFC-versienibble en weigerde zo de seed-tenants
  // (00000000-0000-0000-0000-000000000001). Autorisatie komt uit RLS.
  tenantId: z.guid(),
  widgetKleur: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  welkomsttekst: z.string().max(300).nullable(),
  notificationEmail: z.email().max(254).nullable(),
  privacyUrl: z
    .url()
    .max(500)
    .regex(/^https?:\/\//)
    .nullable(),
});

export async function instellingenOpslaanActie(formData: FormData): Promise<void> {
  const parsed = instellingenSchema.safeParse({
    tenantId: formData.get("tenantId"),
    widgetKleur: formData.get("widgetKleur"),
    welkomsttekst: leegNaarNull(formData.get("welkomsttekst")),
    notificationEmail: leegNaarNull(formData.get("notificationEmail")),
    privacyUrl: leegNaarNull(formData.get("privacyUrl")),
  });
  if (!parsed.success) redirect("/dashboard/instellingen?fout=1");

  const supabase = await getSupabaseServer();
  const { error } = await supabase
    .from("tenants")
    .update({
      widget_kleur: parsed.data.widgetKleur,
      welkomsttekst: parsed.data.welkomsttekst,
      notification_email: parsed.data.notificationEmail,
      privacy_url: parsed.data.privacyUrl,
    })
    .eq("id", parsed.data.tenantId);
  if (error) redirect("/dashboard/instellingen?fout=1");

  revalidatePath("/dashboard/instellingen");
  redirect("/dashboard/instellingen?opgeslagen=1");
}

export async function verstuurTestMailActie(formData: FormData): Promise<void> {
  const tenantId = formData.get("tenantId");
  // z.guid(), net als instellingenSchema: z.uuid() weigert de seed-tenants.
  if (!z.guid().safeParse(tenantId).success) redirect("/dashboard/instellingen?testmail=fout");

  const supabase = await getSupabaseServer();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("name, contact_email, notification_email")
    .eq("id", tenantId as string)
    .maybeSingle();
  if (!tenant) redirect("/dashboard/instellingen?testmail=fout");

  // notification_email is door de owner zelf in te stellen, dus zonder grens
  // is dit een knop die onbeperkt mail naar een vrij te kiezen adres stuurt.
  const toegestaan = await checkRateLimits([
    {
      sleutel: `testmail:tenant:${tenantId as string}`,
      limiet: RATE_LIMITS.testmailsPerTenantPerUur,
      vensterSeconden: 3600,
    },
  ]);
  if (!toegestaan) redirect("/dashboard/instellingen?testmail=fout");

  const aan = process.env.EMAIL_CATCH_ALL ?? tenant.notification_email ?? tenant.contact_email;
  const resultaat = await getEmailProvider().verstuur({
    aan,
    onderwerp: veiligOnderwerp(`Testmail — ${tenant.name}`),
    html: `<p>Dit is een testmail van het <strong>${escapeHtml(tenant.name)}</strong> dashboard. De e-mailnotificaties werken correct.</p>`,
    tekst: `Dit is een testmail van het ${tenant.name} dashboard. De e-mailnotificaties werken correct.`,
  });

  if (!resultaat.ok) redirect("/dashboard/instellingen?testmail=fout");
  redirect("/dashboard/instellingen?testmail=ok");
}
