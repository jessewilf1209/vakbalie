import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { intakeStateSchema } from "@/lib/intake/schema";
import { nieuweIntakeState, type IntakeState } from "@/lib/intake/types";
import type { Leadscore } from "@/lib/leadscore";
import type { LlmMessage } from "@/lib/llm";

/**
 * Opslaglaag voor widget-gesprekken. Alle schrijfacties
 * lopen via de service-role; de browser praat uitsluitend met onze
 * API-routes. Geen IP's of user agents in de database (stap 6.3) — rate
 * limiting krijgt straks een eigen, kortlevende laag (stap 8).
 */

/** Aantal berichten dat als LLM-context wordt meegegeven (kosten!). */
const MAX_GESCHIEDENIS = 20;

export interface ConversationRecord {
  id: string;
  tenantId: string;
  status: "active" | "completed" | "abandoned";
  leadId: string | null;
  state: IntakeState;
  fotoPaden: string[];
}

/**
 * Haalt het gesprek op of maakt het aan. Het conversation-id ís het
 * sessie-id uit het signed token — de client kan dus nooit een ander
 * gesprek kiezen dan waar zijn token voor is afgegeven.
 */
export async function getOrCreateConversation(
  sessionId: string,
  tenantId: string,
): Promise<ConversationRecord> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("conversations")
    .select("id, tenant_id, status, lead_id, intake_state, foto_paden")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw new Error("Gesprek ophalen mislukt");

  if (data) {
    // Token-claims zijn leidend: het gesprek moet bij déze tenant horen.
    if (data.tenant_id !== tenantId) throw new Error("Gesprek hoort niet bij deze tenant");
    const geparsed = intakeStateSchema.safeParse(data.intake_state);
    return {
      id: data.id,
      tenantId: data.tenant_id,
      status: data.status,
      leadId: data.lead_id,
      state: geparsed.success ? geparsed.data : nieuweIntakeState(),
      fotoPaden: data.foto_paden ?? [],
    };
  }

  const { error: insertError } = await supabase.from("conversations").insert({
    id: sessionId,
    tenant_id: tenantId,
    status: "active",
    intake_state: nieuweIntakeState(),
  });
  if (insertError && insertError.code !== "23505") {
    throw new Error("Gesprek aanmaken mislukt");
  }
  // 23505 (unique violation) = race met parallel request; opnieuw ophalen.
  if (insertError) return getOrCreateConversation(sessionId, tenantId);

  return {
    id: sessionId,
    tenantId,
    status: "active",
    leadId: null,
    state: nieuweIntakeState(),
    fotoPaden: [],
  };
}

const FOTO_BUCKET = "lead-fotos";

/**
 * Slaat een (al gevalideerde en EXIF-gestripte) foto op en registreert het
 * pad bij het gesprek. Bestandsnaam is een random UUID — nooit de naam van
 * de bezoeker (stap 7.2).
 *
 * shortcut: de lijst wordt als geheel teruggeschreven, dus bij twee
 * gelijktijdige uploads raakt één pad uit de lijst (de widget uploadt er één
 * tegelijk; alleen losse API-aanroepen halen dit). Het bestand blijft niet
 * hangen: verwijderen ruimt de hele map van het gesprek op. Upgrade naar een
 * atomaire array_append in de database als het in de lead zichtbaar moet zijn.
 */
export async function saveFoto(
  conversation: ConversationRecord,
  data: Buffer,
  contentType: string,
  extensie: string,
): Promise<{ pad: string; aantal: number }> {
  const supabase = getSupabaseAdmin();
  const pad = `${conversation.tenantId}/${conversation.id}/${crypto.randomUUID()}.${extensie}`;

  const { error: uploadError } = await supabase.storage
    .from(FOTO_BUCKET)
    .upload(pad, data, { contentType, upsert: false });
  if (uploadError) throw new Error("Foto opslaan mislukt");

  const nieuwePaden = [...conversation.fotoPaden, pad];
  const { error: updateError } = await supabase
    .from("conversations")
    .update({ foto_paden: nieuwePaden })
    .eq("id", conversation.id);
  if (updateError) throw new Error("Foto registreren mislukt");

  return { pad, aantal: nieuwePaden.length };
}

/** Laatste berichten als LLM-context, oudste eerst. */
export async function loadGeschiedenis(conversationId: string): Promise<LlmMessage[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: false })
    .limit(MAX_GESCHIEDENIS);
  if (error) throw new Error("Geschiedenis laden mislukt");

  return (data ?? [])
    .reverse()
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
}

/**
 * Schrijft één beurt weg: beide berichten + bijgewerkte staat. Zet bewust
 * nooit de status: afronden doet `finalizeLead` (of, bij de demo,
 * `markeerGesprekAfgerond`), zodat een gesprek nooit "afgerond" is zonder lead.
 */
export async function saveBeurt(
  conversationId: string,
  bezoekersBericht: string,
  antwoord: string,
  state: IntakeState,
): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { error: msgError } = await supabase.from("messages").insert([
    { conversation_id: conversationId, role: "user", content: bezoekersBericht },
    { conversation_id: conversationId, role: "assistant", content: antwoord },
  ]);
  if (msgError) throw new Error("Berichten opslaan mislukt");

  const { error: convError } = await supabase
    .from("conversations")
    .update({ intake_state: state })
    .eq("id", conversationId);
  if (convError) throw new Error("Gespreksstaat opslaan mislukt");
}

/**
 * Rondt een gesprek af zonder lead. Alleen voor de publieke demo, waar een
 * afgeronde intake nooit tot een lead of mail leidt.
 */
export async function markeerGesprekAfgerond(conversationId: string): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("conversations")
    .update({ status: "completed" })
    .eq("id", conversationId);
  if (error) throw new Error("Gesprek afronden mislukt");
}

/**
 * Maakt de lead aan bij een afgeronde intake. Idempotent: de unieke
 * conversation_id-constraint maakt een tweede lead voor hetzelfde gesprek
 * onmogelijk, ook bij races — dan koppelen we de bestaande.
 *
 * `nieuw` is alleen true voor de aanroep die de lead écht aanmaakte, zodat
 * de meting elke lead precies één keer telt.
 */
export async function finalizeLead(
  conversation: ConversationRecord,
  state: IntakeState,
  score: Leadscore,
): Promise<{ id: string; nieuw: boolean } | null> {
  const supabase = getSupabaseAdmin();
  if (conversation.leadId) return { id: conversation.leadId, nieuw: false };

  const v = state.velden;
  const { data, error } = await supabase
    .from("leads")
    .insert({
      tenant_id: conversation.tenantId,
      conversation_id: conversation.id,
      contact_name: v.contactNaam ?? null,
      contact_email: v.contactEmail ?? null,
      contact_phone: v.contactTelefoon ?? null,
      project_description: v.wensen ?? null,
      plaats: v.plaats ?? null,
      project_type: v.projectType ?? null,
      tuin_grootte: v.tuinGrootte ?? null,
      budget_indicatie: v.budgetIndicatie ?? null,
      timing: v.timing ?? null,
      lead_score: score.score,
      score_redenen: score.redenen,
      consent_at: state.consent.tijdstip ?? null,
      foto_paden: conversation.fotoPaden,
      status: "new",
    })
    .select("id")
    .single();

  let lead: { id: string; nieuw: boolean };
  if (error) {
    if (error.code !== "23505") throw new Error("Lead opslaan mislukt");
    // Race of eerdere, half gelukte poging: lead bestaat al — die ophalen.
    const { data: bestaand } = await supabase
      .from("leads")
      .select("id")
      .eq("conversation_id", conversation.id)
      .maybeSingle();
    if (!bestaand) return null;
    lead = { id: bestaand.id, nieuw: false };
  } else {
    lead = { id: data.id, nieuw: true };
  }

  // In beide paden koppelen en fouten niet inslikken: een gesprek zonder
  // lead_id ruimt de bewaartermijn-job na 30 dagen op, mét de foto's van de lead.
  const { error: koppelFout } = await supabase
    .from("conversations")
    .update({ lead_id: lead.id, status: "completed" })
    .eq("id", conversation.id);
  if (koppelFout) throw new Error("Lead koppelen mislukt");
  return lead;
}
