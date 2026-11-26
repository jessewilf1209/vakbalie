import "server-only";
import { bouwSamenvatting } from "@/lib/intake/samenvatting";
import type { IntakeVelden } from "@/lib/intake/types";
import { categorieVanScore } from "@/lib/leadscore";
import { registreerEvent } from "@/lib/meting";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getEmailProvider } from "./index";
import { bouwNieuweLeadMail } from "./nieuwe-lead-template";

/**
 * Notificatiemail bij een nieuwe lead.
 *
 * - Idempotent: claimt eerst `notified_at` (update ... where notified_at
 *   is null); een race of retry kan nooit twee mails opleveren.
 * - Mail-falen breekt de leadflow nooit: de lead is al veilig opgeslagen.
 *   Bij falen wordt de claim teruggedraaid zodat een retry mogelijk blijft.
 * - In dev (catch-all, stap 1.4) gaat álles naar EMAIL_CATCH_ALL.
 */
export async function verstuurLeadNotificatie(leadId: string): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();

    // Claim vóór verzending (idempotentie).
    const { data: lead, error } = await supabase
      .from("leads")
      .update({ notified_at: new Date().toISOString() })
      .eq("id", leadId)
      .is("notified_at", null)
      .select(
        "id, tenant_id, contact_name, contact_email, contact_phone, project_description, plaats, project_type, tuin_grootte, budget_indicatie, timing, lead_score, score_redenen, foto_paden",
      )
      .maybeSingle();
    if (error || !lead) return; // al geclaimd of niet gevonden

    const { data: tenant } = await supabase
      .from("tenants")
      .select("name, contact_email, notification_email, widget_key")
      .eq("id", lead.tenant_id)
      .maybeSingle();
    if (!tenant) return;

    // Demo-tenant krijgt nooit een echte mail — voorkomt inbox-spam bij elke bezoeker
    // die de publieke /demo-pagina uitprobeert.
    const demoKey = process.env.NEXT_PUBLIC_DEMO_TENANT_KEY;
    if (demoKey && tenant.widget_key === demoKey) return;

    // Catch-all in dev: nooit mailen naar echte adressen zonder domein.
    const aan = process.env.EMAIL_CATCH_ALL ?? tenant.notification_email ?? tenant.contact_email;

    const velden: IntakeVelden = {
      plaats: lead.plaats ?? undefined,
      projectType: lead.project_type ?? undefined,
      wensen: lead.project_description ?? undefined,
      tuinGrootte: lead.tuin_grootte ?? undefined,
      budgetIndicatie: lead.budget_indicatie ?? undefined,
      timing: lead.timing ?? undefined,
      contactNaam: lead.contact_name ?? undefined,
      contactEmail: lead.contact_email ?? undefined,
      contactTelefoon: lead.contact_phone ?? undefined,
    };

    const score = lead.lead_score ?? 0;
    const categorie = categorieVanScore(score);

    const basisUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
    const mail = bouwNieuweLeadMail({
      bedrijfsnaam: tenant.name,
      plaats: lead.plaats,
      projectType: lead.project_type,
      samenvatting: bouwSamenvatting(velden, (lead.foto_paden ?? []).length),
      score: { categorie, redenen: lead.score_redenen ?? [] },
      dashboardUrl: `${basisUrl}/dashboard/leads/${lead.id}`,
    });

    const resultaat = await getEmailProvider().verstuur({ aan, ...mail });

    if (resultaat.ok) {
      // Voor de mailkosten per klant; geen ontvanger of inhoud.
      await registreerEvent(lead.tenant_id, "notificatiemail_verstuurd");
    } else {
      // Claim terugdraaien zodat een retry de mail alsnog kan sturen.
      await supabase.from("leads").update({ notified_at: null }).eq("id", leadId);
      console.error("lead-notificatie mislukt", { leadId });
    }
  } catch (fout) {
    // Nooit doorgooien: de leadflow mag hier niet op breken (stap 2.4).
    console.error("lead-notificatie fout", {
      leadId,
      melding: fout instanceof Error ? fout.message : "onbekend",
    });
  }
}
