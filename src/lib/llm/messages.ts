import type Anthropic from "@anthropic-ai/sdk";
import { LlmError, type LlmStructuredRequest, type LlmStructuredResult } from "./types";

/**
 * Gedeelde Messages-API-logica voor de Anthropic- en de Bedrock-adapter.
 * Beide spreken hetzelfde protocol; door het verzoek en het uitlezen hier te
 * houden, kan de afgedwongen gestructureerde output (de injectiebescherming)
 * niet tussen de twee adapters uit elkaar gaan lopen.
 */

/** Het deel van de SDK-client dat de adapters gebruiken; in tests na te bootsen. */
export interface BerichtenClient {
  messages: {
    create(verzoek: Anthropic.MessageCreateParamsNonStreaming): PromiseLike<Anthropic.Message>;
  };
}

/**
 * Bouwt het verzoek. Gestructureerde output wordt afgedwongen via tool-use
 * met `tool_choice`: het model kán alleen JSON volgens het schema teruggeven.
 * De system prompt krijgt cache_control; onder het cacheminimum van
 * het model doet dat niets, maar het kost ook niets.
 */
export function bouwBerichtVerzoek(
  request: LlmStructuredRequest,
  model: string,
): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model,
    max_tokens: request.maxTokens,
    system: [
      {
        type: "text",
        text: request.system,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: request.messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
    tools: [
      {
        name: request.schemaName,
        description: "Geef je volledige antwoord uitsluitend via deze tool, conform het schema.",
        input_schema: request.schema as Anthropic.Tool.InputSchema,
      },
    ],
    tool_choice: { type: "tool", name: request.schemaName },
  };
}

/**
 * Haalt de gestructureerde output uit het antwoord. De `data` blijft
 * ongevalideerd; de aanroeper valideert met Zod (zie types.ts).
 */
export function leesAntwoord(response: Anthropic.Message): LlmStructuredResult {
  // Nieuwere modellen kunnen een verzoek weigeren met een gewoon 200-antwoord.
  if (response.stop_reason === "refusal") {
    throw new LlmError("LLM weigerde het verzoek", false);
  }
  // Afgekapt op max_tokens: de tool-input is dan onvolledige JSON.
  if (response.stop_reason === "max_tokens") {
    throw new LlmError("LLM-antwoord afgekapt op max_tokens", false);
  }

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
  );
  if (!toolUse) {
    throw new LlmError("LLM gaf geen gestructureerde output terug", true);
  }

  return {
    data: toolUse.input,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      // Apart gemeten en geprijsd; null als er niets gecachet is.
      cacheSchrijfTokens: response.usage.cache_creation_input_tokens ?? 0,
      cacheLeesTokens: response.usage.cache_read_input_tokens ?? 0,
    },
  };
}
