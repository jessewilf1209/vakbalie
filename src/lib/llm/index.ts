import { AwsConfigFout, getAwsConfig, getAwsCredentialProvider } from "@/lib/config/aws";
import { isProductie, LLM_PROVIDERS, nietEuLlmToegestaan } from "@/lib/config/env";
import { AnthropicLlmProvider } from "./anthropic";
import { BedrockLlmProvider } from "./bedrock";
import { DagBudgetProvider, leesDagBudgetConfig } from "./budget";
import { MockLlmProvider, type MockResponder } from "./mock";
import { LlmError, type LlmProvider } from "./types";

export type {
  LlmBron,
  LlmContext,
  LlmMessage,
  LlmProvider,
  LlmStructuredRequest,
  LlmStructuredResult,
  LlmUsage,
} from "./types";
export { LlmBudgetError, LlmError } from "./types";
export { MockLlmProvider, type MockResponder } from "./mock";

type LlmProviderNaam = (typeof LLM_PROVIDERS)[number];

/** De enige provider die gespreksinhoud binnen de EU houdt. */
const EU_PROVIDER: LlmProviderNaam = "bedrock";

let cached: LlmProvider | null = null;

function gekozenProvider(): LlmProviderNaam {
  const waarde = process.env.LLM_PROVIDER?.trim() || "mock";
  if (!(LLM_PROVIDERS as readonly string[]).includes(waarde)) {
    throw new LlmError(`LLM_PROVIDER moet een van ${LLM_PROVIDERS.join(", ")} zijn`, false);
  }
  return waarde as LlmProviderNaam;
}

function maakBedrockProvider(): LlmProvider {
  try {
    const config = getAwsConfig();
    return new BedrockLlmProvider({
      regio: config.regio,
      modelId: config.bedrockModelId,
      credentialProvider: getAwsCredentialProvider(),
    });
  } catch (fout) {
    // AwsConfigFout noemt alleen variabelenamen, dus veilig om door te geven.
    if (fout instanceof AwsConfigFout) throw new LlmError(fout.message, false);
    throw fout;
  }
}

/**
 * Geeft de actieve LLM-provider. De keuze is expliciet via `LLM_PROVIDER`:
 * - leeg of `mock` → mock, zodat lokaal en in CI zonder kosten gebouwd wordt;
 * - `bedrock` → Claude via een EU-inferentieprofiel (de productiewaarde);
 * - `anthropic` → directe API, alleen lokaal met verzonnen testdata.
 *
 * Bewust niet meer afgeleid van "is er een key": één vergeten
 * `ANTHROPIC_API_KEY` in Vercel zou gespreksinhoud dan ongemerkt naar de VS
 * sturen.
 *
 * Residentie-slot: in productie is alleen `bedrock` toegestaan. Elke andere
 * waarde geeft een fout bij de eerste aanroep; liever een kapotte widget dan
 * stille doorgifte. De enige uitweg is `ALLOW_NON_EU_LLM=true`. Gebruik alleen bewust.
 *
 * Elke echte provider zit achter de platformbrede dagrem op AI-kosten
 * (`DagBudgetProvider`). De mock niet: die kost niets, en anders zou CI
 * database-aanroepen doen.
 *
 * De mock wordt niet gecachet: elke aanroeper geeft zijn eigen responder mee.
 *
 * Alleen server-side aanroepen; keys bestaan nooit client-side.
 */
export function getLlmProvider(mockResponder?: MockResponder): LlmProvider {
  const keuze = gekozenProvider();

  if (isProductie() && keuze !== EU_PROVIDER && !nietEuLlmToegestaan()) {
    throw new LlmError(
      `LLM_PROVIDER moet in productie ${EU_PROVIDER} zijn (EU-residentie)`,
      false,
    );
  }

  if (keuze === "mock") return new MockLlmProvider(mockResponder);
  if (cached) return cached;

  // Eerst de budgetconfiguratie: bij een ongeldige waarde start er niets.
  const budget = leesDagBudgetConfig();
  cached = new DagBudgetProvider(maakEchteProvider(keuze), budget);
  return cached;
}

/** Bouwt de echte adapter, zonder dagrem eromheen. */
function maakEchteProvider(keuze: Exclude<LlmProviderNaam, "mock">): LlmProvider {
  if (keuze === "bedrock") return maakBedrockProvider();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new LlmError("ANTHROPIC_API_KEY ontbreekt, vereist bij LLM_PROVIDER=anthropic", false);
  }
  return new AnthropicLlmProvider(apiKey);
}

/**
 * Alleen voor de rooktests tegen een echt model (`pnpm rooktest:llm`): de
 * gekozen adapter ZONDER dagrem, zodat een test niets in de database schrijft
 * en geen lokale Supabase nodig heeft. Weigert in productie en bij de mock.
 */
export function getProviderVoorRooktest(): LlmProvider {
  if (isProductie()) {
    throw new LlmError("rooktests draaien nooit in productie", false);
  }
  const keuze = gekozenProvider();
  if (keuze === "mock") {
    throw new LlmError(
      "LLM_PROVIDER staat op mock; zet bedrock (met AWS_PROFILE) of anthropic (met ANTHROPIC_API_KEY)",
      false,
    );
  }
  return maakEchteProvider(keuze);
}

/** Alleen voor tests: reset de gecachte provider. */
export function resetLlmProviderForTests(): void {
  cached = null;
}
