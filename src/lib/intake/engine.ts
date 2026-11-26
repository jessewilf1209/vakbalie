import type { LlmContext, LlmMessage, LlmProvider } from "@/lib/llm";
import { LlmBudgetError } from "@/lib/llm/types";
import { bouwIntakeSystemPrompt } from "@/lib/prompts/intake-prompt";
import { INTAKE_LIMIETEN, tokenBudgetOverschreden } from "./limits";
import type { BrancheProfiel } from "./profiel";
import { intakeResponseJsonSchema, intakeResponseSchema, sanitizeVelden } from "./schema";
import type { IntakeState, IntakeTurnResult } from "./types";

/**
 * Verwerkt één gespreksbeurt.
 *
 * Stappenvolgorde per beurt:
 *  1. Limietchecks (berichten + tokenbudget) — vóór de LLM-call.
 *  2. LLM-aanroep met afgedwongen gestructureerde output.
 *  3. Zod-validatie; bij afwijking één retry, daarna fallback zonder
 *     veldextractie (de beurt faalt nooit hard richting bezoeker).
 *  4. Veld-sanitisatie (echte e-mail/telefoon-validators) en merge in state.
 *  5. Server-side completion-check — het LLM-signaal alleen is niet genoeg.
 */

const AFRONDING_BIJ_LIMIET =
  "Bedankt voor je tijd! Ik heb genoeg informatie om je aanvraag door te geven. " +
  "Het bedrijf neemt zo snel mogelijk contact met je op.";

const FALLBACK_ANTWOORD = "Sorry, dat ging even mis aan mijn kant. Kun je dat nog een keer zeggen?";

/** Control-tekens verwijderen; \n, \r en \t blijven staan. */
function stripControlTekens(tekst: string): string {
  let resultaat = "";
  for (const teken of tekst) {
    const code = teken.codePointAt(0) ?? 0;
    const isToegestaneWitruimte = code === 9 || code === 10 || code === 13;
    if (isToegestaneWitruimte || (code >= 32 && code !== 127)) {
      resultaat += teken;
    }
  }
  return resultaat;
}

export interface IntakeTurnInput {
  profiel: BrancheProfiel;
  state: IntakeState;
  /** Eerdere berichten (oudste eerst), exclusief het nieuwe bericht. */
  geschiedenis: LlmMessage[];
  bezoekersBericht: string;
  llm: LlmProvider;
  /** Tenant en gesprek, voor de meting per klant. */
  context: { tenantId: string; conversationId: string };
  /** Lager plafond voor het aantal bezoekersberichten (demo); nooit hoger dan de platformgrens. */
  maxBerichten?: number;
}

export function isIntakeCompleet(profiel: BrancheProfiel, state: IntakeState): boolean {
  const verplichtBekend = profiel.velden
    .filter((v) => v.verplicht)
    .every((v) => state.velden[v.veld] !== undefined);
  return verplichtBekend && state.consent.gegeven;
}

export async function verwerkIntakeBeurt(input: IntakeTurnInput): Promise<IntakeTurnResult> {
  const { profiel, llm, geschiedenis } = input;

  // Bezoekersinput normaliseren: control-tekens eruit, lengte aftoppen.
  const bericht = stripControlTekens(input.bezoekersBericht)
    .trim()
    .slice(0, INTAKE_LIMIETEN.maxBerichtLengte);

  if (bericht.length === 0) {
    return {
      antwoord: "Ik heb geen bericht ontvangen — wat wil je vragen?",
      state: input.state,
      status: "actief",
    };
  }

  const state: IntakeState = {
    ...input.state,
    velden: { ...input.state.velden },
    consent: { ...input.state.consent },
    tokens: { ...input.state.tokens },
    aantalBerichten: input.state.aantalBerichten + 1,
  };

  // Laag 2 van: limieten checken vóórdat er kosten worden gemaakt.
  const maxBerichten = Math.min(
    input.maxBerichten ?? INTAKE_LIMIETEN.maxBerichtenPerGesprek,
    INTAKE_LIMIETEN.maxBerichtenPerGesprek,
  );
  if (state.aantalBerichten > maxBerichten || tokenBudgetOverschreden(state.tokens)) {
    state.afgerond = isIntakeCompleet(profiel, state);
    return {
      antwoord: AFRONDING_BIJ_LIMIET,
      state,
      status: "limiet_bereikt",
      limietReden: "gespreksbudget",
    };
  }

  const context: LlmContext = { ...input.context, bron: "intake" };
  const request = {
    context,
    system: bouwIntakeSystemPrompt(profiel, state),
    messages: [...geschiedenis, { role: "user" as const, content: bericht }],
    schemaName: "intake_beurt",
    schema: intakeResponseJsonSchema(),
    maxTokens: INTAKE_LIMIETEN.maxTokensPerAntwoord,
  };

  // Eén retry bij ongeldige output (stap 5.2), daarna fallback.
  let antwoord = FALLBACK_ANTWOORD;
  for (let poging = 0; poging < 2; poging++) {
    let resultaat;
    try {
      resultaat = await llm.completeStructured(request);
    } catch (fout) {
      // Platformbreed dagbudget bereikt: net zo vriendelijk afronden als bij
      // het tokenbudget per gesprek, met de gegevens die er al zijn.
      if (fout instanceof LlmBudgetError) {
        state.afgerond = isIntakeCompleet(profiel, state);
        return {
          antwoord: AFRONDING_BIJ_LIMIET,
          state,
          status: "limiet_bereikt",
          limietReden: "dagrem",
        };
      }
      continue; // LLM-fout: nog één poging, anders fallback-antwoord.
    }

    state.tokens.input += resultaat.usage.inputTokens;
    state.tokens.output += resultaat.usage.outputTokens;

    const parsed = intakeResponseSchema.safeParse(resultaat.data);
    if (!parsed.success) continue;

    antwoord = parsed.data.antwoord;

    if (parsed.data.consentGegeven === true) {
      state.consent = { gegeven: true, tijdstip: new Date().toISOString() };
    }

    if (parsed.data.velden) {
      const schoon = sanitizeVelden(parsed.data.velden);
      // AVG: contactgegevens alleen vasthouden mét toestemming.
      if (!state.consent.gegeven) {
        delete schoon.contactNaam;
        delete schoon.contactEmail;
        delete schoon.contactTelefoon;
      }
      Object.assign(state.velden, schoon);
    }
    break;
  }

  // Completion is een server-side beslissing; het LLM-vinkje is een hint.
  state.afgerond = isIntakeCompleet(profiel, state);

  return {
    antwoord,
    state,
    status: state.afgerond ? "afgerond" : "actief",
  };
}
