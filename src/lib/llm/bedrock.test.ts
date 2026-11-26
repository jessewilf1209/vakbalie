import Anthropic from "@anthropic-ai/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BedrockLlmProvider } from "./bedrock";
import type { BerichtenClient } from "./messages";
import { LlmError, type LlmStructuredRequest } from "./types";

const MODEL_ID = "eu.anthropic.claude-haiku-5-5";

const request: LlmStructuredRequest = {
  context: { tenantId: "00000000-0000-0000-0000-000000000001", bron: "intake" },
  system: "Je bent een intake-assistent.",
  messages: [
    { role: "user", content: "Ik wil mijn tuin laten aanleggen." },
    { role: "assistant", content: "Wat leuk! In welke plaats woont u?" },
    { role: "user", content: "In Epe." },
  ],
  schemaName: "intake_response",
  schema: { type: "object", properties: { reply: { type: "string" } } },
  maxTokens: 512,
};

function antwoord(overschrijf: Partial<Anthropic.Message> = {}): Anthropic.Message {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: MODEL_ID,
    stop_reason: "tool_use",
    stop_sequence: null,
    content: [
      { type: "tool_use", id: "toolu_test", name: "intake_response", input: { reply: "Dank u." } },
    ],
    usage: { input_tokens: 321, output_tokens: 45 },
    ...overschrijf,
  } as Anthropic.Message;
}

function maakProvider(create: BerichtenClient["messages"]["create"]) {
  return new BedrockLlmProvider(
    { regio: "eu-north-1", modelId: MODEL_ID },
    { messages: { create } },
  );
}

function apiFout(status: number, fouttype?: string) {
  const headers = new Headers(fouttype ? { "x-amzn-errortype": `${fouttype}:http://aws/` } : {});
  return Anthropic.APIError.generate(status, { message: "geheime details" }, "fout", headers);
}

async function foutVan(fout: unknown): Promise<LlmError> {
  const provider = maakProvider(async () => {
    throw fout;
  });
  const resultaat = await provider.completeStructured(request).catch((e: unknown) => e);
  expect(resultaat).toBeInstanceOf(LlmError);
  return resultaat as LlmError;
}

describe("BedrockLlmProvider: het verzoek", () => {
  it("stuurt het model-ID uit de configuratie en dwingt de tool af", async () => {
    const create = vi.fn(async () => antwoord());
    await maakProvider(create).completeStructured(request);

    expect(create).toHaveBeenCalledExactlyOnceWith({
      model: MODEL_ID,
      max_tokens: 512,
      system: [
        {
          type: "text",
          text: "Je bent een intake-assistent.",
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: request.messages,
      tools: [
        {
          name: "intake_response",
          description: expect.any(String),
          input_schema: request.schema,
        },
      ],
      tool_choice: { type: "tool", name: "intake_response" },
    });
  });

  it("geeft de tool-input en de usage door", async () => {
    const resultaat = await maakProvider(async () => antwoord()).completeStructured(request);
    expect(resultaat.data).toEqual({ reply: "Dank u." });
    expect(resultaat.usage).toEqual({
      inputTokens: 321,
      outputTokens: 45,
      cacheSchrijfTokens: 0,
      cacheLeesTokens: 0,
    });
  });

  it("geeft cachetokens apart door, zodat ze een eigen tarief krijgen", async () => {
    const resultaat = await maakProvider(async () =>
      antwoord({
        usage: {
          input_tokens: 10,
          output_tokens: 45,
          cache_creation_input_tokens: 1_200,
          cache_read_input_tokens: 3_400,
        } as Anthropic.Usage,
      }),
    ).completeStructured(request);
    expect(resultaat.usage).toMatchObject({ cacheSchrijfTokens: 1_200, cacheLeesTokens: 3_400 });
  });

  it("stuurt de tenant-context nooit naar het model", async () => {
    const create = vi.fn(async () => antwoord());
    await maakProvider(create).completeStructured(request);
    const verzonden = JSON.stringify(create.mock.calls[0]);
    expect(verzonden).not.toContain("context");
    expect(verzonden).not.toContain(request.context.tenantId);
  });
});

describe("BedrockLlmProvider: het antwoord", () => {
  it("geeft een herhaalbare fout als de tool-output ontbreekt", async () => {
    const provider = maakProvider(async () =>
      antwoord({
        stop_reason: "end_turn",
        content: [{ type: "text", text: "hoi", citations: null }],
      }),
    );
    await expect(provider.completeStructured(request)).rejects.toMatchObject({ retryable: true });
  });

  it.each(["refusal", "max_tokens"] as const)(
    "geeft een niet-herhaalbare fout bij stop_reason %s",
    async (stopReason) => {
      const provider = maakProvider(async () => antwoord({ stop_reason: stopReason }));
      await expect(provider.completeStructured(request)).rejects.toMatchObject({
        name: "LlmError",
        retryable: false,
      });
    },
  );
});

describe("BedrockLlmProvider: foutmapping", () => {
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

  afterEach(() => {
    consoleError.mockClear();
  });

  it.each([
    ["ThrottlingException (429)", apiFout(429, "ThrottlingException"), true],
    ["429 zonder fouttype", apiFout(429), true],
    ["500", apiFout(500), true],
    ["503", apiFout(503, "ServiceUnavailableException"), true],
    ["AccessDeniedException (403)", apiFout(403, "AccessDeniedException"), false],
    ["ValidationException (400)", apiFout(400, "ValidationException"), false],
    ["ServiceQuotaExceededException (400)", apiFout(400, "ServiceQuotaExceededException"), false],
    ["netwerkfout", new TypeError("fetch failed"), true],
  ])("%s geeft retryable=%s", async (_naam, fout, retryable) => {
    expect((await foutVan(fout)).retryable).toBe(retryable);
  });

  it("verwijst bij AccessDenied naar het IAM-punt uit het bouwplan", async () => {
    await foutVan(apiFout(403, "AccessDeniedException"));
    expect(consoleError).toHaveBeenCalledExactlyOnceWith(
      "bedrock: toegang geweigerd",
      expect.objectContaining({ hint: expect.stringContaining("EU-inferentieprofiel") }),
    );
  });

  it("geeft een eigen logregel bij een bereikt servicequotum", async () => {
    await foutVan(apiFout(400, "ServiceQuotaExceededException"));
    expect(consoleError).toHaveBeenCalledExactlyOnceWith(
      "bedrock: servicequotum bereikt",
      expect.anything(),
    );
  });

  it("herkent ontbrekende AWS-credentials en probeert dan niet opnieuw", async () => {
    const fout = Object.assign(new Error("Could not load credentials"), {
      name: "CredentialsProviderError",
    });
    expect((await foutVan(fout)).retryable).toBe(false);
    expect(consoleError).toHaveBeenCalledWith(
      "bedrock: geen geldige AWS-credentials",
      expect.anything(),
    );
  });

  it("herkent een credentialsfout die de SDK als verbindingsfout verpakt", async () => {
    // Zo gooit @anthropic-ai/bedrock-sdk 1.x het bij een verlopen `aws login`.
    const oorzaak = Object.assign(new Error("Your session has expired. Please reauthenticate."), {
      name: "CredentialsProviderError",
    });
    const fout = new Anthropic.APIConnectionError({
      message: "Failed to resolve AWS credentials from the credential provider chain.",
      cause: oorzaak,
    });
    const resultaat = await foutVan(fout);
    expect(resultaat.message).toBe("LLM-aanroep mislukt (AWS-credentials)");
    expect(resultaat.retryable).toBe(false);
  });

  it("lekt geen details van de onderliggende fout", async () => {
    const fout = await foutVan(apiFout(400, "ValidationException"));
    expect(fout.message).not.toContain("geheime details");
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("geheime details");
  });
});
