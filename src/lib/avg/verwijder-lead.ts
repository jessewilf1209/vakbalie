import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Volledige verwijdering van een lead (AVG): foto's in
 * Storage, het gesprek (messages cascaden mee) en de lead-rij zelf.
 *
 * Bewust client-agnostisch: de verwijderknop in het dashboard geeft de
 * anon-client mee (RLS + storage-policies begrenzen tot de eigen tenant),
 * de bewaartermijn-cron de service-role. Logging bevat uitsluitend id's,
 * nooit namen of e-mailadressen (stap 7.3).
 *
 * Volgorde is belangrijk: eerst foto's, dan gesprek, dan lead. Faalt een
 * stap, dan stoppen we: de lead blijft bestaan en een retry kan het
 * restant alsnog opruimen (geen half-verwijderde, onvindbare data).
 */

const FOTO_BUCKET = "lead-fotos";

/**
 * Verwijdert de geregistreerde foto's plus alles in de map van het gesprek
 * (`<tenant>/<gesprek>/`). De map vangt een foto waarvan het pad verloren
 * ging bij twee gelijktijdige uploads (saveFoto schrijft de lijst als geheel).
 */
async function verwijderFotos(
  supabase: SupabaseClient,
  tenantId: string,
  conversationId: string | null,
  geregistreerd: string[],
): Promise<boolean> {
  const paden = new Set(geregistreerd);
  if (conversationId) {
    const map = `${tenantId}/${conversationId}`;
    const { data, error } = await supabase.storage.from(FOTO_BUCKET).list(map, { limit: 100 });
    if (error) return false;
    for (const bestand of data ?? []) paden.add(`${map}/${bestand.name}`);
  }
  if (paden.size === 0) return true;

  const { error } = await supabase.storage.from(FOTO_BUCKET).remove([...paden]);
  return !error;
}

export interface VerwijderbareLead {
  id: string;
  tenant_id: string;
  conversation_id: string | null;
  foto_paden: string[] | null;
}

export async function verwijderLeadVolledig(
  supabase: SupabaseClient,
  lead: VerwijderbareLead,
): Promise<boolean> {
  if (
    !(await verwijderFotos(supabase, lead.tenant_id, lead.conversation_id, lead.foto_paden ?? []))
  ) {
    console.error("avg-verwijdering: foto's verwijderen mislukt", { leadId: lead.id });
    return false;
  }

  if (lead.conversation_id) {
    const { error } = await supabase.from("conversations").delete().eq("id", lead.conversation_id);
    if (error) {
      console.error("avg-verwijdering: gesprek verwijderen mislukt", { leadId: lead.id });
      return false;
    }
  }

  const { error } = await supabase.from("leads").delete().eq("id", lead.id);
  if (error) {
    console.error("avg-verwijdering: lead verwijderen mislukt", { leadId: lead.id });
    return false;
  }

  return true;
}

/**
 * Verwijdert een gesprek zonder lead (afgebroken intake) inclusief foto's.
 * Alleen gebruikt door de bewaartermijn-cron; in het dashboard bestaan
 * lead-loze gesprekken niet als entiteit.
 */
export interface VerwijderbaarGesprek {
  id: string;
  tenant_id: string;
  foto_paden: string[] | null;
}

export async function verwijderGesprekVolledig(
  supabase: SupabaseClient,
  gesprek: VerwijderbaarGesprek,
): Promise<boolean> {
  if (!(await verwijderFotos(supabase, gesprek.tenant_id, gesprek.id, gesprek.foto_paden ?? []))) {
    console.error("avg-verwijdering: gespreksfoto's verwijderen mislukt", {
      conversationId: gesprek.id,
    });
    return false;
  }

  const { error } = await supabase.from("conversations").delete().eq("id", gesprek.id);
  if (error) {
    console.error("avg-verwijdering: gesprek verwijderen mislukt", { conversationId: gesprek.id });
    return false;
  }

  return true;
}
