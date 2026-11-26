import Anthropic from "@anthropic-ai/sdk";
import { bouwBerichtVerzoek, leesAntwoord, type BerichtenClient } from "./messages";
import {
  LlmError,
  type LlmProvider,
  type LlmStructuredRequest,
  type LlmStructuredResult,
} from "./types";

/** Model per: goedkoop, sterk Nederlands, betrouwbare structured output. */
const DEFAULT_MODEL = "claude-haiku-4-5";

/**
 * Anthropic-adapter voor de directe API. Alleen voor lokale
 * ontwikkeling met verzonnen testdata: de directe API verwerkt buiten de EU
 *. Productie loopt via de Bedrock-adapter.
 */
export class AnthropicLlmProvider implements LlmProvider {
  readonly name = "anthropic";
  private readonly client: BerichtenClient;

  constructor(
    apiKey: string,
    readonly model: string = DEFAULT_MODEL,
  ) {
    this.client = new Anthropic({ apiKey });
  }

  async completeStructured(request: LlmStructuredRequest): Promise<LlmStructuredResult> {
    let response: Anthropic.Message;
    try {
      response = await this.client.messages.create(bouwBerichtVerzoek(request, this.model));
    } catch (error) {
      // Geen gespreksinhoud of key-materiaal in de fout laten lekken.
      if (error instanceof Anthropic.APIError) {
        const retryable =
          error.status === 429 || (error.status !== undefined && error.status >= 500);
        throw new LlmError(`LLM-aanroep mislukt (status ${error.status ?? "onbekend"})`, retryable);
      }
      throw new LlmError("LLM-aanroep mislukt (netwerk/onbekend)", true);
    }

    return leesAntwoord(response);
  }
}
