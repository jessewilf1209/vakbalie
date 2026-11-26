import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { LlmBron } from "@/lib/llm/types";

/**
 * Meetlaag voor verbruik per klant.
 *
 * Alleen getallen en vaste codes: nooit een prompt, antwoord, naam, e-mail,
 * IP of bestandsnaam. De tabellen hebben daar ook geen kolom voor.
 *
 * Meten raakt de gebruiker nooit (fail-open): elke fout wordt gelogd zonder
 * inhoud en ingeslikt. Dat wijkt bewust af van de dagrem, die fail-closed is:
 * de rem beschermt geld, de meting is administratie.
 */

/** Moet gelijk blijven aan de check-constraint op `gebruik_events.soort`. */
export const EVENT_SOORTEN = [
  "gesprek_gestart",
  "lead_aangemaakt",
  "foto_geupload",
  "afgerond_op_budget",
  "rate_limit_geweigerd",
  "dagrem_geweigerd",
  "notificatiemail_verstuurd",
  "opvolgmail_verstuurd",
] as const;
export type EventSoort = (typeof EVENT_SOORTEN)[number];

export interface LlmGebruikRij {
  tenantId: string;
  conversationId?: string;
  bron: LlmBron;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheSchrijfTokens: number;
  cacheLeesTokens: number;
  /** Tienduizendsten van een dollar, dezelfde waarde als de dagrem optelt. */
  kostenEenheden: number;
}

/** Schrijft één rij in `llm_gebruik`. Gooit nooit. */
export async function registreerLlmGebruik(rij: LlmGebruikRij): Promise<void> {
  try {
    const { error } = await getSupabaseAdmin()
      .from("llm_gebruik")
      .insert({
        tenant_id: rij.tenantId,
        conversation_id: rij.conversationId ?? null,
        bron: rij.bron,
        provider: rij.provider,
        model: rij.model,
        input_tokens: rij.inputTokens,
        output_tokens: rij.outputTokens,
        cache_schrijf_tokens: rij.cacheSchrijfTokens,
        cache_lees_tokens: rij.cacheLeesTokens,
        kosten_eenheden: rij.kostenEenheden,
      });
    if (error) throw new Error(`insert mislukt (${error.code ?? "onbekend"})`);
  } catch (fout) {
    console.error("meting: llm-gebruik niet vastgelegd", {
      bron: rij.bron,
      melding: fout instanceof Error ? fout.message : "onbekend",
    });
  }
}

/** Legt één gebeurtenis vast in `gebruik_events`. Gooit nooit. */
export async function registreerEvent(tenantId: string, soort: EventSoort): Promise<void> {
  try {
    const { error } = await getSupabaseAdmin()
      .from("gebruik_events")
      .insert({ tenant_id: tenantId, soort });
    if (error) throw new Error(`insert mislukt (${error.code ?? "onbekend"})`);
  } catch (fout) {
    console.error("meting: event niet vastgelegd", {
      soort,
      melding: fout instanceof Error ? fout.message : "onbekend",
    });
  }
}
