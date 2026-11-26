import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getLlmProvider,
  getProviderVoorRooktest,
  LlmError,
  resetLlmProviderForTests,
} from "./index";
import { DagBudgetProvider } from "./budget";
import { MockLlmProvider } from "./mock";
import type { LlmStructuredRequest } from "./types";

const baseRequest: LlmStructuredRequest = {
  context: { tenantId: "00000000-0000-0000-0000-000000000001", bron: "intake" },
  system: "Je bent een intake-assistent.",
  messages: [{ role: "user", content: "Ik wil mijn tuin laten aanleggen." }],
  schemaName: "intake_response",
  schema: { type: "object", properties: { reply: { type: "string" } } },
  maxTokens: 512,
};

describe("MockLlmProvider", () => {
  it("geeft de gescripte responder-output terug als ongevalideerde data", async () => {
    const mock = new MockLlmProvider(() => ({ reply: "Wat leuk! In welke plaats woont u?" }));
    const result = await mock.completeStructured(baseRequest);
    expect(result.data).toEqual({ reply: "Wat leuk! In welke plaats woont u?" });
  });

  it("rapporteert token-usage zodat budgetlogica testbaar is", async () => {
    const mock = new MockLlmProvider(() => ({ reply: "ok" }));
    const result = await mock.completeStructured(baseRequest);
    expect(result.usage.inputTokens).toBeGreaterThan(0);
    expect(result.usage.outputTokens).toBeGreaterThan(0);
    expect(result.usage.outputTokens).toBeLessThanOrEqual(baseRequest.maxTokens);
  });

  it("geeft de volledige request door aan de responder", async () => {
    let seen: LlmStructuredRequest | undefined;
    const mock = new MockLlmProvider((req) => {
      seen = req;
      return {};
    });
    await mock.completeStructured(baseRequest);
    expect(seen?.schemaName).toBe("intake_response");
    expect(seen?.messages).toHaveLength(1);
  });
});

describe("getLlmProvider", () => {
  afterEach(() => {
    resetLlmProviderForTests();
    vi.unstubAllEnvs();
  });

  it("valt zonder LLM_PROVIDER terug op de mock (mock-first)", () => {
    expect(getLlmProvider().name).toBe("mock");
  });

  it("kiest niet meer impliciet op basis van een aanwezige key", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key-niet-echt");
    expect(getLlmProvider().name).toBe("mock");
  });

  it("kiest de Anthropic-adapter bij LLM_PROVIDER=anthropic met key", () => {
    vi.stubEnv("LLM_PROVIDER", "anthropic");
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key-niet-echt");
    expect(getLlmProvider().name).toBe("anthropic");
  });

  it("weigert LLM_PROVIDER=anthropic zonder key", () => {
    vi.stubEnv("LLM_PROVIDER", "anthropic");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(() => getLlmProvider()).toThrow(LlmError);
  });

  it("kiest de Bedrock-adapter bij LLM_PROVIDER=bedrock", () => {
    vi.stubEnv("LLM_PROVIDER", "bedrock");
    expect(getLlmProvider().name).toBe("bedrock");
  });

  it("weigert een onbekende provider", () => {
    vi.stubEnv("LLM_PROVIDER", "openai");
    expect(() => getLlmProvider()).toThrow(/LLM_PROVIDER moet een van/);
  });

  it("weigert Bedrock met een regio of model buiten de EU", () => {
    vi.stubEnv("LLM_PROVIDER", "bedrock");
    vi.stubEnv("AWS_REGION", "us-east-1");
    expect(() => getLlmProvider()).toThrow(LlmError);

    vi.stubEnv("AWS_REGION", "eu-north-1");
    vi.stubEnv("BEDROCK_MODEL_ID", "global.anthropic.claude-haiku-5-5");
    expect(() => getLlmProvider()).toThrow(/EU-inferentieprofiel/);
  });

  it("zet elke echte provider achter de dagrem, de mock niet", () => {
    expect(getLlmProvider()).toBeInstanceOf(MockLlmProvider);
    vi.stubEnv("LLM_PROVIDER", "bedrock");
    expect(getLlmProvider()).toBeInstanceOf(DagBudgetProvider);
    resetLlmProviderForTests();
    vi.stubEnv("LLM_PROVIDER", "anthropic");
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key-niet-echt");
    expect(getLlmProvider()).toBeInstanceOf(DagBudgetProvider);
  });

  it("weigert een echte provider bij een ongeldig dagplafond", () => {
    vi.stubEnv("LLM_PROVIDER", "bedrock");
    vi.stubEnv("LLM_DAGPLAFOND_USD", "onbeperkt");
    expect(() => getLlmProvider()).toThrow(/LLM_DAGPLAFOND_USD/);
  });

  it("cachet de echte provider tussen aanroepen", () => {
    vi.stubEnv("LLM_PROVIDER", "bedrock");
    expect(getLlmProvider()).toBe(getLlmProvider());
  });

  it("geeft elke aanroeper een mock met zijn eigen responder", async () => {
    const intake = getLlmProvider(() => ({ bron: "intake" }));
    const opvolgen = getLlmProvider(() => ({ bron: "opvolgen" }));
    expect((await intake.completeStructured(baseRequest)).data).toEqual({ bron: "intake" });
    expect((await opvolgen.completeStructured(baseRequest)).data).toEqual({ bron: "opvolgen" });
  });

  describe("residentie-slot in productie", () => {
    beforeEach(() => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("VERCEL_ENV", "production");
    });

    it.each(["", "mock", "anthropic"])("weigert LLM_PROVIDER=%s", (provider) => {
      vi.stubEnv("LLM_PROVIDER", provider);
      vi.stubEnv("ANTHROPIC_API_KEY", "test-key-niet-echt");
      expect(() => getLlmProvider()).toThrow(/moet in productie bedrock zijn/);
    });

    it("laat Bedrock door", () => {
      vi.stubEnv("LLM_PROVIDER", "bedrock");
      expect(getLlmProvider().name).toBe("bedrock");
    });

    it("laat een andere provider alleen door met ALLOW_NON_EU_LLM=true", () => {
      vi.stubEnv("LLM_PROVIDER", "mock");
      vi.stubEnv("ALLOW_NON_EU_LLM", "1");
      expect(() => getLlmProvider()).toThrow(LlmError);
      vi.stubEnv("ALLOW_NON_EU_LLM", "true");
      expect(getLlmProvider().name).toBe("mock");
    });

    it("geldt niet op een preview-deploy", () => {
      vi.stubEnv("VERCEL_ENV", "preview");
      vi.stubEnv("LLM_PROVIDER", "");
      expect(getLlmProvider().name).toBe("mock");
    });
  });
});

describe("getProviderVoorRooktest", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("geeft de kale adapter, zonder dagrem", () => {
    vi.stubEnv("LLM_PROVIDER", "bedrock");
    const provider = getProviderVoorRooktest();
    expect(provider.name).toBe("bedrock");
    expect(provider).not.toBeInstanceOf(DagBudgetProvider);
  });

  it("weigert de mock, want een rooktest daartegen zegt niets", () => {
    vi.stubEnv("LLM_PROVIDER", "mock");
    expect(() => getProviderVoorRooktest()).toThrow(/staat op mock/);
  });

  it("weigert in productie", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("LLM_PROVIDER", "bedrock");
    expect(() => getProviderVoorRooktest()).toThrow(/nooit in productie/);
  });

  it("eist een key bij de directe API", () => {
    vi.stubEnv("LLM_PROVIDER", "anthropic");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(() => getProviderVoorRooktest()).toThrow(/ANTHROPIC_API_KEY ontbreekt/);
  });
});
