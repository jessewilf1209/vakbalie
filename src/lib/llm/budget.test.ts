import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  berekenKosten,
  DagBudgetProvider,
  leesDagBudgetConfig,
  type DagBudgetConfig,
  type DagTeller,
  type GebruikMeting,
} from "./budget";
import { LlmBudgetError, LlmError, type LlmProvider, type LlmStructuredRequest } from "./types";

const MODEL = "eu.anthropic.claude-haiku-4-5-20251001-v1:0";

/** $5 plafond, $1,10 per miljoen input, $5,50 per miljoen output. */
const CONFIG: DagBudgetConfig = {
  plafond: 50_000,
  prijsInputPerMtok: 11_000,
  prijsOutputPerMtok: 55_000,
};

const request: LlmStructuredRequest = {
  context: { tenantId: "00000000-0000-0000-0000-000000000001", bron: "intake" },
  system: "Je bent een intake-assistent.",
  messages: [{ role: "user", content: "Hallo" }],
  schemaName: "intake_response",
  schema: { type: "object" },
  maxTokens: 512,
};

function maakProvider(usage = { inputTokens: 2_000, outputTokens: 200 }) {
  const completeStructured = vi.fn(async () => ({ data: { ok: true }, usage }));
  const provider: LlmProvider = { name: "bedrock", model: MODEL, completeStructured };
  return { provider, completeStructured };
}

/** Teller in het geheugen, met dezelfde afspraak als de databasefunctie. */
function maakTeller(beginstand = 0) {
  let stand = beginstand;
  const teller = vi.fn<DagTeller>(async (delta) => {
    stand += delta;
    return stand;
  });
  return { teller, stand: () => stand };
}

describe("leesDagBudgetConfig", () => {
  it("rekent dollars om naar tienduizendsten", () => {
    expect(
      leesDagBudgetConfig({
        NODE_ENV: "test",
        LLM_DAGPLAFOND_USD: "5",
        LLM_PRIJS_INPUT_PER_MTOK: "1.10",
        LLM_PRIJS_OUTPUT_PER_MTOK: "5.50",
        LLM_DAGPLAFOND_PER_KLANT_USD: "2",
      }),
    ).toEqual({ ...CONFIG, plafondPerKlant: 20_000 });
  });

  it("valt zonder configuratie terug op een laag plafond en het duurste tarief", () => {
    expect(leesDagBudgetConfig({ NODE_ENV: "test" })).toEqual({
      ...CONFIG,
      plafondPerKlant: 20_000,
    });
  });

  it.each(["0", "-5", "vijf", "5,50", "1e3", "Infinity"])(
    "weigert de ongeldige waarde %s in plaats van stil terug te vallen",
    (waarde) => {
      expect(() => leesDagBudgetConfig({ NODE_ENV: "test", LLM_DAGPLAFOND_USD: waarde })).toThrow(
        LlmError,
      );
    },
  );
});

describe("berekenKosten", () => {
  it("rekent met bekende tokenaantallen in hele tienduizendsten", () => {
    // 2.000 × $1,10/M = $0,0022 en 200 × $5,50/M = $0,0011, samen $0,0033.
    expect(berekenKosten({ inputTokens: 2_000, outputTokens: 200 }, CONFIG)).toBe(33);
    expect(berekenKosten({ inputTokens: 1_000_000, outputTokens: 1_000_000 }, CONFIG)).toBe(66_000);
  });

  it("rondt naar boven af, zodat kleine aanroepen niet gratis lijken", () => {
    expect(berekenKosten({ inputTokens: 1, outputTokens: 0 }, CONFIG)).toBe(1);
    expect(berekenKosten({ inputTokens: 0, outputTokens: 0 }, CONFIG)).toBe(0);
  });
});

describe("DagBudgetProvider", () => {
  const meting = vi.fn<GebruikMeting>(async () => undefined);
  beforeEach(() => meting.mockClear());
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

  afterEach(() => {
    consoleError.mockClear();
    consoleWarn.mockClear();
  });

  it("laat onder het plafond door en boekt de werkelijke kosten", async () => {
    const { provider, completeStructured } = maakProvider();
    const { teller, stand } = maakTeller(100);
    const resultaat = await new DagBudgetProvider(
      provider,
      CONFIG,
      teller,
      meting,
    ).completeStructured(request);

    expect(resultaat.data).toEqual({ ok: true });
    expect(completeStructured).toHaveBeenCalledExactlyOnceWith(request);
    expect(teller.mock.calls).toEqual([[0], [33]]);
    expect(stand()).toBe(133);
  });

  it("houdt de naam van de echte provider aan", () => {
    const { provider } = maakProvider();
    expect(new DagBudgetProvider(provider, CONFIG, maakTeller().teller, meting).name).toBe(
      "bedrock",
    );
  });

  it.each([50_000, 50_001])(
    "weigert bij stand %i zonder de provider aan te roepen",
    async (beginstand) => {
      const { provider, completeStructured } = maakProvider();
      const { teller } = maakTeller(beginstand);
      const budget = new DagBudgetProvider(provider, CONFIG, teller, meting);

      await expect(budget.completeStructured(request)).rejects.toBeInstanceOf(LlmBudgetError);
      expect(completeStructured).not.toHaveBeenCalled();
      expect(teller.mock.calls).toEqual([[0]]);
      expect(consoleError).toHaveBeenCalledOnce();
    },
  );

  it("weigert bij een databasefout (fail-closed)", async () => {
    const { provider, completeStructured } = maakProvider();
    const teller: DagTeller = async () => {
      throw new Error("verhoog_teller mislukt (57014)");
    };
    const fout = await new DagBudgetProvider(provider, CONFIG, teller, meting)
      .completeStructured(request)
      .catch((e: unknown) => e);

    expect(fout).toBeInstanceOf(LlmError);
    // Geen budgetfout: de intake mag hier niet doen alsof het gesprek klaar is.
    expect(fout).not.toBeInstanceOf(LlmBudgetError);
    expect(completeStructured).not.toHaveBeenCalled();
  });

  it("geeft het antwoord terug als alleen het boeken mislukt", async () => {
    const { provider } = maakProvider();
    const teller: DagTeller = async (delta) => {
      if (delta > 0) throw new Error("verhoog_teller mislukt (57014)");
      return 0;
    };
    const resultaat = await new DagBudgetProvider(
      provider,
      CONFIG,
      teller,
      meting,
    ).completeStructured(request);
    expect(resultaat.data).toEqual({ ok: true });
    expect(consoleError).toHaveBeenCalledExactlyOnceWith(
      "dagbudget: kosten niet geboekt",
      expect.anything(),
    );
  });

  it("boekt niets als de provider zelf faalt", async () => {
    const provider: LlmProvider = {
      name: "bedrock",
      model: MODEL,
      completeStructured: async () => {
        throw new LlmError("LLM-aanroep mislukt (throttling)", true);
      },
    };
    const { teller } = maakTeller();
    await expect(
      new DagBudgetProvider(provider, CONFIG, teller, meting).completeStructured(request),
    ).rejects.toMatchObject({ retryable: true });
    expect(teller.mock.calls).toEqual([[0]]);
  });

  it("waarschuwt één keer per drempel, op 50% en op 80%", async () => {
    // Elke aanroep kost 33; de stand loopt van 24.950 over 25.000 heen.
    const { provider } = maakProvider();
    const { teller } = maakTeller(24_950);
    const budget = new DagBudgetProvider(provider, CONFIG, teller, meting);

    await budget.completeStructured(request); // 24.983
    expect(consoleWarn).not.toHaveBeenCalled();
    await budget.completeStructured(request); // 25.016: passeert 50%
    await budget.completeStructured(request); // 25.049: al gepasseerd
    expect(consoleWarn).toHaveBeenCalledExactlyOnceWith("dagbudget voor AI-kosten: 50% bereikt", {
      standUsd: "2.50",
      plafondUsd: "5.00",
    });

    consoleWarn.mockClear();
    const { teller: bijna80 } = maakTeller(39_990);
    await new DagBudgetProvider(provider, CONFIG, bijna80, meting).completeStructured(request);
    expect(consoleWarn).toHaveBeenCalledExactlyOnceWith(
      "dagbudget voor AI-kosten: 80% bereikt",
      expect.anything(),
    );
  });

  it("meldt beide drempels als één dure aanroep ze samen passeert", async () => {
    const { provider } = maakProvider({ inputTokens: 0, outputTokens: 800_000 }); // 44.000
    const { teller } = maakTeller(0);
    await new DagBudgetProvider(provider, CONFIG, teller, meting).completeStructured(request);
    expect(consoleWarn).toHaveBeenCalledTimes(2);
  });
});

describe("berekenKosten met prompt caching", () => {
  it("prijst cache schrijven op 125% en cache lezen op 10% van het inputtarief", () => {
    // 1M schrijven = $1,375 en 1M lezen = $0,11 bij $1,10 input.
    expect(
      berekenKosten(
        { inputTokens: 0, outputTokens: 0, cacheSchrijfTokens: 1_000_000, cacheLeesTokens: 0 },
        CONFIG,
      ),
    ).toBe(13_750);
    expect(
      berekenKosten(
        { inputTokens: 0, outputTokens: 0, cacheSchrijfTokens: 0, cacheLeesTokens: 1_000_000 },
        CONFIG,
      ),
    ).toBe(1_100);
  });
});

describe("DagBudgetProvider: meetlaag", () => {
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
  afterEach(() => consoleError.mockClear());

  const context = {
    tenantId: "00000000-0000-0000-0000-000000000002",
    bron: "intake" as const,
    conversationId: "11111111-1111-1111-1111-111111111111",
  };

  it("legt elke geslaagde aanroep vast met tenant, bron, model en dezelfde kosten", async () => {
    const meting = vi.fn<GebruikMeting>(async () => undefined);
    const { provider } = maakProvider({ inputTokens: 2_000, outputTokens: 200 });
    const { teller } = maakTeller();
    await new DagBudgetProvider(provider, CONFIG, teller, meting).completeStructured({
      ...request,
      context,
    });

    expect(meting).toHaveBeenCalledExactlyOnceWith({
      tenantId: context.tenantId,
      conversationId: context.conversationId,
      bron: "intake",
      provider: "bedrock",
      model: MODEL,
      inputTokens: 2_000,
      outputTokens: 200,
      cacheSchrijfTokens: 0,
      cacheLeesTokens: 0,
      kostenEenheden: 33,
    });
    expect(teller.mock.calls.at(-1)).toEqual([33]);
  });

  it("de som van de vastgelegde kosten is gelijk aan wat de dagrem optelt", async () => {
    const rijen: number[] = [];
    const meting: GebruikMeting = async (rij) => {
      rijen.push(rij.kostenEenheden);
    };
    const { teller, stand } = maakTeller();
    for (const usage of [
      { inputTokens: 2_000, outputTokens: 200 },
      { inputTokens: 7, outputTokens: 3 },
      { inputTokens: 15_321, outputTokens: 987, cacheLeesTokens: 4_000 },
    ]) {
      const { provider } = maakProvider(usage);
      await new DagBudgetProvider(provider, CONFIG, teller, meting).completeStructured(request);
    }
    expect(rijen).toHaveLength(3);
    expect(rijen.reduce((a, b) => a + b, 0)).toBe(stand());
  });

  it("een kapotte meting breekt de aanroep niet", async () => {
    const meting: GebruikMeting = async () => {
      throw new Error("database weg");
    };
    const { provider } = maakProvider();
    const resultaat = await new DagBudgetProvider(
      provider,
      CONFIG,
      maakTeller().teller,
      meting,
    ).completeStructured(request);
    expect(resultaat.data).toEqual({ ok: true });
    expect(consoleError).toHaveBeenCalledOnce();
    // Geen inhoud in de logregel, alleen de bron.
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("Hallo");
  });

  it("legt niets vast bij een weigering of een providerfout", async () => {
    const meting = vi.fn<GebruikMeting>(async () => undefined);
    const { provider } = maakProvider();
    await new DagBudgetProvider(provider, CONFIG, maakTeller(50_000).teller, meting)
      .completeStructured(request)
      .catch(() => undefined);

    const kapot: LlmProvider = {
      name: "bedrock",
      model: MODEL,
      completeStructured: async () => {
        throw new LlmError("LLM-aanroep mislukt (throttling)", true);
      },
    };
    await new DagBudgetProvider(kapot, CONFIG, maakTeller().teller, meting)
      .completeStructured(request)
      .catch(() => undefined);

    expect(meting).not.toHaveBeenCalled();
  });
});

describe("DagBudgetProvider: rem per klant", () => {
  const meting = vi.fn<GebruikMeting>(async () => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  const PER_KLANT: DagBudgetConfig = { ...CONFIG, plafondPerKlant: 20_000 };

  /** Teller per klant in het geheugen. */
  function maakKlantTeller(begin: Record<string, number> = {}) {
    const standen = new Map(Object.entries(begin));
    const klantTeller = vi.fn(async (tenantId: string, delta: number) => {
      const nieuw = (standen.get(tenantId) ?? 0) + delta;
      standen.set(tenantId, nieuw);
      return nieuw;
    });
    return { klantTeller, stand: (id: string) => standen.get(id) ?? 0 };
  }

  it("weigert een klant boven zijn eigen plafond, ook als het platform nog ruimte heeft", async () => {
    const { provider, completeStructured } = maakProvider();
    const { klantTeller } = maakKlantTeller({ [request.context.tenantId]: 20_000 });
    const fout = await new DagBudgetProvider(
      provider,
      PER_KLANT,
      maakTeller(100).teller,
      meting,
      klantTeller,
    )
      .completeStructured(request)
      .catch((e: unknown) => e);
    expect(fout).toBeInstanceOf(LlmBudgetError);
    expect(completeStructured).not.toHaveBeenCalled();
  });

  it("laat een andere klant gewoon door en boekt op de eigen teller", async () => {
    const { provider, completeStructured } = maakProvider();
    const { klantTeller, stand } = maakKlantTeller({ "andere-klant": 20_000 });
    await new DagBudgetProvider(
      provider,
      PER_KLANT,
      maakTeller().teller,
      meting,
      klantTeller,
    ).completeStructured(request);
    expect(completeStructured).toHaveBeenCalledOnce();
    expect(stand(request.context.tenantId)).toBe(33);
    expect(stand("andere-klant")).toBe(20_000);
  });

  it("weigert fail-closed als de klantteller niet te lezen is", async () => {
    const { provider, completeStructured } = maakProvider();
    const kapot = vi.fn(async () => {
      throw new Error("database weg");
    });
    const fout = await new DagBudgetProvider(
      provider,
      PER_KLANT,
      maakTeller().teller,
      meting,
      kapot,
    )
      .completeStructured(request)
      .catch((e: unknown) => e);
    expect(fout).toBeInstanceOf(LlmError);
    expect(fout).not.toBeInstanceOf(LlmBudgetError);
    expect(completeStructured).not.toHaveBeenCalled();
  });

  it("raakt de klantteller niet zonder plafondPerKlant (oude gedrag)", async () => {
    const { provider } = maakProvider();
    const { klantTeller } = maakKlantTeller();
    await new DagBudgetProvider(
      provider,
      CONFIG,
      maakTeller().teller,
      meting,
      klantTeller,
    ).completeStructured(request);
    expect(klantTeller).not.toHaveBeenCalled();
  });
});
