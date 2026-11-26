"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { LEAD_STATUSSEN } from "../presentatie";
import { verwijderLeadVolledig } from "@/lib/avg/verwijder-lead";
import { checkRateLimits, RATE_LIMITS } from "@/lib/api/rate-limit";
import { getEmailProvider } from "@/lib/email";
import { bouwOpvolgmail } from "@/lib/email/opvolgmail-template";
import { getLlmProvider, LlmBudgetError } from "@/lib/llm";
import { registreerEvent } from "@/lib/meting";
import {
  genereerBelscript,
  genereerOpvolgmail,
  MAX_INSTRUCTIE_TEKENS,
  opvolgmailSchema,
  type OpvolgLead,
  type OpvolgResultaat,
  type OpvolgVoorstel,
} from "@/lib/opvolgen/generatie";
import { opvolgMockResponder } from "@/lib/opvolgen/mock-responder";
import { getSupabaseServer } from "@/lib/supabase/server";

/**
 * Lead-acties. Autorisatie komt uit RLS: de
 * anon-client kan alleen leads van de eigen tenant raken — een vreemd
 * lead-id muteert stilletjes nul rijen.
 */

const statusSchema = z.object({
  leadId: z.uuid(),
  status: z.enum(LEAD_STATUSSEN),
});

export async function wijzigStatusActie(formData: FormData): Promise<void> {
  const parsed = statusSchema.safeParse({
    leadId: formData.get("leadId"),
    status: formData.get("status"),
  });
  if (!parsed.success) return;

  const supabase = await getSupabaseServer();
  await supabase.from("leads").update({ status: parsed.data.status }).eq("id", parsed.data.leadId);

  revalidatePath(`/dashboard/leads/${parsed.data.leadId}`);
  revalidatePath("/dashboard/leads");
  revalidatePath("/dashboard");
  redirect(`/dashboard/leads/${parsed.data.leadId}?opgeslagen=1`);
}

/**
 * Hard delete van een lead (AVG-verwijderverzoek, stap 7): foto's, gesprek
 * en lead-rij. Draait op de anon-client — RLS en de storage-policies
 * begrenzen tot de eigen tenant; een vreemd lead-id vindt hier niets.
 */
export async function verwijderLeadActie(formData: FormData): Promise<void> {
  const parsed = z.uuid().safeParse(formData.get("leadId"));
  if (!parsed.success) redirect("/dashboard/leads");

  const supabase = await getSupabaseServer();
  const { data: lead } = await supabase
    .from("leads")
    .select("id, tenant_id, conversation_id, foto_paden")
    .eq("id", parsed.data)
    .maybeSingle();
  if (!lead) redirect("/dashboard/leads");

  const gelukt = await verwijderLeadVolledig(supabase, lead);
  if (!gelukt) redirect(`/dashboard/leads/${parsed.data}/verwijderen?fout=1`);

  revalidatePath("/dashboard/leads");
  revalidatePath("/dashboard");
  redirect("/dashboard/leads?verwijderd=1");
}

/* ------------------------------------------------------------------ *
 * AI-opvolging
 * ------------------------------------------------------------------ */

const LEAD_VELDEN =
  "id, tenant_id, status, contact_name, contact_email, plaats, project_type, project_description, budget_indicatie, timing";

const genereerSchema = z.object({
  leadId: z.uuid(),
  instructie: z.string().max(MAX_INSTRUCTIE_TEKENS).optional(),
});

const verstuurSchema = opvolgmailSchema.extend({ leadId: z.uuid() });

/**
 * Gemeenschappelijke ophaal- en autorisatiestap. Autorisatie komt volledig
 * uit RLS: een lead van een andere tenant levert hier nul rijen op, dus
 * "niet gevonden" — er staat bewust nergens een handmatige tenant-check.
 */
async function laadLeadMetTenant(leadId: string) {
  const supabase = await getSupabaseServer();
  const { data: lead } = await supabase
    .from("leads")
    .select(LEAD_VELDEN)
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return null;

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, name, contact_email, notification_email")
    .eq("id", lead.tenant_id)
    .maybeSingle();
  if (!tenant) return null;

  return { supabase, lead, tenant };
}

function leadVoorPrompt(lead: { [k: string]: unknown }): OpvolgLead {
  return {
    contactNaam: (lead.contact_name as string) ?? undefined,
    plaats: (lead.plaats as string) ?? undefined,
    projectType: (lead.project_type as string) ?? undefined,
    wensen: (lead.project_description as string) ?? undefined,
    budgetIndicatie: (lead.budget_indicatie as OpvolgLead["budgetIndicatie"]) ?? undefined,
    timing: (lead.timing as OpvolgLead["timing"]) ?? undefined,
  };
}

/**
 * Genereert een conceptmail (aanvrager heeft een e-mailadres) of een
 * belscript (alleen telefonisch bereikbaar). Schrijft niets naar de
 * database: een verworpen concept laat geen sporen na (dataminimalisatie).
 */
export async function genereerOpvolgActie(
  invoer: z.infer<typeof genereerSchema>,
): Promise<OpvolgResultaat<OpvolgVoorstel>> {
  const parsed = genereerSchema.safeParse(invoer);
  if (!parsed.success) return { ok: false, fout: "Ongeldige invoer." };

  const context = await laadLeadMetTenant(parsed.data.leadId);
  if (!context) return { ok: false, fout: "Aanvraag niet gevonden." };
  const { lead, tenant } = context;

  // Kostenrem: fail-closed, net als de widget-routes.
  const toegestaan = await checkRateLimits([
    {
      sleutel: `opvolg:tenant:${tenant.id}`,
      limiet: RATE_LIMITS.opvolgGeneratiesPerTenantPerUur,
      vensterSeconden: 3600,
    },
  ]);
  if (!toegestaan) {
    return { ok: false, fout: "Even wachten: het uurlimiet voor voorstellen is bereikt." };
  }

  const llm = getLlmProvider(opvolgMockResponder);

  const input = {
    bedrijfsnaam: tenant.name,
    lead: leadVoorPrompt(lead),
    instructieVakman: parsed.data.instructie,
  };

  try {
    if (lead.contact_email) {
      const mail = await genereerOpvolgmail(input, llm, tenant.id);
      return { ok: true, waarde: { soort: "mail", ...mail } };
    }
    const script = await genereerBelscript(input, llm, tenant.id);
    return { ok: true, waarde: { soort: "belscript", ...script } };
  } catch (fout) {
    // Nooit modeloutput of persoonsgegevens loggen (alleen id's/codes).
    console.error("opvolgvoorstel mislukt", {
      leadId: parsed.data.leadId,
      melding: fout instanceof Error ? fout.name : "onbekend",
    });
    if (fout instanceof LlmBudgetError) {
      await registreerEvent(tenant.id, "dagrem_geweigerd");
      return {
        ok: false,
        fout: "Het dagbudget voor AI-voorstellen is bereikt. Probeer het morgen opnieuw.",
      };
    }
    return { ok: false, fout: "Het voorstel kon niet worden gemaakt. Probeer het opnieuw." };
  }
}

/**
 * Verstuurt de (mogelijk door de vakman bewerkte) mail. Dit is het enige
 * pad waarlangs een concept de deur uitgaat: er bestaat geen automatische
 * verzending, ook niet als optie.
 */
export async function verstuurOpvolgmailActie(
  invoer: z.infer<typeof verstuurSchema>,
): Promise<OpvolgResultaat<{ statusGewijzigd: boolean }>> {
  const parsed = verstuurSchema.safeParse(invoer);
  if (!parsed.success) return { ok: false, fout: "Onderwerp of tekst ontbreekt of is te lang." };

  const context = await laadLeadMetTenant(parsed.data.leadId);
  if (!context) return { ok: false, fout: "Aanvraag niet gevonden." };
  const { supabase, lead, tenant } = context;

  if (!lead.contact_email) {
    return { ok: false, fout: "Deze aanvrager heeft geen e-mailadres achtergelaten." };
  }

  // Verzendrem: elke mail gaat via ons domein naar een derde (fail-closed).
  const verzendenToegestaan = await checkRateLimits([
    {
      sleutel: `opvolgmail:tenant:${tenant.id}`,
      limiet: RATE_LIMITS.opvolgmailsPerTenantPerUur,
      vensterSeconden: 3600,
    },
  ]);
  if (!verzendenToegestaan) {
    return {
      ok: false,
      fout: "Je hebt het maximum aantal mails voor dit uur bereikt. Probeer het later opnieuw.",
    };
  }

  // Antwoorden moeten bij de hovenier belanden, niet bij het platform.
  const replyTo = tenant.notification_email ?? tenant.contact_email;
  if (!replyTo) {
    return {
      ok: false,
      fout: "Stel eerst een notificatie-adres in bij Instellingen; anders kan niemand antwoorden.",
    };
  }

  // Catch-all in dev: nooit echte aanvragers mailen zonder geverifieerd domein.
  const aan = process.env.EMAIL_CATCH_ALL ?? lead.contact_email;

  const bericht = bouwOpvolgmail({
    aan,
    bedrijfsnaam: tenant.name,
    onderwerp: parsed.data.onderwerp,
    tekst: parsed.data.tekst,
    replyTo,
  });

  const resultaat = await getEmailProvider().verstuur(bericht);
  if (!resultaat.ok) {
    console.error("opvolgmail versturen mislukt", {
      leadId: parsed.data.leadId,
      reden: resultaat.reden ?? "onbekend",
    });
    // Onderscheid maakt uit voor wat de vakman moet doen: nog eens klikken,
    // of ons bellen omdat er iets structureel misstaat.
    return {
      ok: false,
      fout:
        resultaat.reden === "netwerk"
          ? "Geen verbinding met de mailservice. Controleer je internetverbinding en probeer het zo opnieuw."
          : "De mailservice weigerde het bericht. Je concept staat er nog; neem contact op als dit blijft gebeuren.",
    };
  }

  await registreerEvent(lead.tenant_id, "opvolgmail_verstuurd");

  const { data: gebruiker } = await supabase.auth.getUser();

  // Historie pas ná succesvolle verzending: de tabel beschrijft wat er
  // echt is verstuurd, niet wat we van plan waren.
  const { error: opslagFout } = await supabase.from("lead_opvolgmails").insert({
    tenant_id: lead.tenant_id,
    lead_id: lead.id,
    verzonden_door: gebruiker.user?.id ?? null,
    onderwerp: bericht.onderwerp,
    tekst: parsed.data.tekst,
  });
  if (opslagFout) {
    // De mail is al weg; dit stilzwijgend laten vallen zou de historie
    // laten liegen, maar een fout tonen suggereert dat er niets is gebeurd.
    console.error("opvolgmail-historie opslaan mislukt", { leadId: parsed.data.leadId });
  }

  // Alleen vanaf "Nieuw": een gewonnen of verloren lead nooit terugzetten.
  let statusGewijzigd = false;
  if (lead.status === "new") {
    const { error } = await supabase
      .from("leads")
      .update({ status: "contacted" })
      .eq("id", lead.id);
    statusGewijzigd = !error;
  }

  revalidatePath(`/dashboard/leads/${lead.id}`);
  revalidatePath("/dashboard/leads");
  revalidatePath("/dashboard");
  return { ok: true, waarde: { statusGewijzigd } };
}
