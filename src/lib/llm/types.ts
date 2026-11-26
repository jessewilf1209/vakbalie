/**
 * Kanaal-onafhankelijke LLM-abstractie.
 *
 * Alle LLM-aanroepen in de codebase lopen via dit interface; de rest van de
 * applicatie weet niet welke provider eronder zit. Wisselen van provider is
 * daarmee een implementatiedetail.
 *
 * Kernregel: de `data` in het resultaat is ONGEVALIDEERD.
 * De aanroeper valideert altijd met Zod voordat er iets mee gebeurt.
 */

export interface LlmMessage {
  role: "user" | "assistant";
  content: string;
}

/** Waarvoor een aanroep dient; wordt de kolom `bron` in `llm_gebruik`. */
export const LLM_BRONNEN = ["intake", "opvolgmail", "belscript"] as const;
export type LlmBron = (typeof LLM_BRONNEN)[number];

/**
 * Voor wie en waarvoor een aanroep is. Alleen voor de meting in de
 * dagrem; de adapters sturen dit nooit naar het model.
 */
export interface LlmContext {
  tenantId: string;
  bron: LlmBron;
  /** Alleen bij de intake; leeg bij opvolgmail en belscript. */
  conversationId?: string;
}

export interface LlmStructuredRequest {
  /**
   * Verplicht, zodat TypeScript elke aanroepplek dwingt het mee te geven en
   * er geen aanroep ongemeten blijft.
   */
  context: LlmContext;
  /** System prompt (gedragsregels + brancheprofiel). */
  system: string;
  /** Gespreksgeschiedenis, oudste eerst. */
  messages: LlmMessage[];
  /** Naam van het output-schema (voor tool-use afdwinging). */
  schemaName: string;
  /** JSON Schema waaraan de gestructureerde output moet voldoen. */
  schema: Record<string, unknown>;
  /** Hard plafond per antwoord. */
  maxTokens: number;
}

export interface LlmUsage {
  /** Niet-gecachete inputtokens (zo telt de Messages-API ze). */
  inputTokens: number;
  outputTokens: number;
  /** In de promptcache geschreven tokens; eigen tarief. */
  cacheSchrijfTokens?: number;
  /** Uit de promptcache gelezen tokens; eigen tarief. */
  cacheLeesTokens?: number;
}

export interface LlmStructuredResult {
  /**
   * Gestructureerde output van het model. Bewust `unknown`: de aanroeper
   * MOET dit eerst tegen een Zod-schema valideren (OWASP LLM Top 10).
   */
  data: unknown;
  usage: LlmUsage;
}

export interface LlmProvider {
  /** Providernaam voor logging en kostenmonitoring (nooit persoonsgegevens loggen). */
  readonly name: string;
  /** Model-ID uit de configuratie; komt in `llm_gebruik.model`. */
  readonly model: string;
  completeStructured(request: LlmStructuredRequest): Promise<LlmStructuredResult>;
}

/** Fout uit de LLM-laag; bevat nooit gespreksinhoud of API-keys. */
export class LlmError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "LlmError";
  }
}

/**
 * Het platformbrede dagbudget voor AI-kosten is bereikt. Een eigen
 * type, zodat aanroepers netjes kunnen afronden in plaats van een technische
 * fout te tonen. Opnieuw proberen heeft vandaag geen zin.
 */
export class LlmBudgetError extends LlmError {
  constructor() {
    super("dagbudget voor AI-kosten bereikt", false);
    this.name = "LlmBudgetError";
  }
}
