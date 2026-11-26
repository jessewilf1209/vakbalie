import { describe, expect, it } from "vitest";
import { MockLlmProvider } from "@/lib/llm";
import { verwerkIntakeBeurt } from "./engine";
import { intakeMockResponder } from "./mock-responder";
import { hovenierProfiel } from "./profiel";
import { INTAKE_LIMIETEN } from "./limits";
import { nieuweIntakeState } from "./types";

/**
 * Optioneel lager berichtenplafond (de publieke demo). Het platformplafond
 * blijft de bovengrens: een hogere waarde mag het nooit verruimen.
 */

function beurt(aantalBerichten: number, maxBerichten?: number) {
  const state = nieuweIntakeState();
  state.aantalBerichten = aantalBerichten;
  return verwerkIntakeBeurt({
    profiel: hovenierProfiel,
    state,
    geschiedenis: [],
    bezoekersBericht: "Ik wil een nieuwe tuin",
    llm: new MockLlmProvider(intakeMockResponder),
    context: { tenantId: "t-1", conversationId: "c-1" },
    maxBerichten,
  });
}

describe("verwerkIntakeBeurt: maxBerichten", () => {
  it("rondt af zodra het lagere plafond wordt overschreden", async () => {
    const resultaat = await beurt(5, 5);
    expect(resultaat.status).toBe("limiet_bereikt");
    expect(resultaat.limietReden).toBe("gespreksbudget");
  });

  it("laat berichten onder het lagere plafond gewoon door", async () => {
    const resultaat = await beurt(4, 5);
    expect(resultaat.status).not.toBe("limiet_bereikt");
  });

  it("gebruikt zonder maxBerichten het platformplafond", async () => {
    expect((await beurt(5)).status).not.toBe("limiet_bereikt");
    expect((await beurt(INTAKE_LIMIETEN.maxBerichtenPerGesprek)).status).toBe("limiet_bereikt");
  });

  it("laat een hogere waarde het platformplafond niet verruimen", async () => {
    const resultaat = await beurt(INTAKE_LIMIETEN.maxBerichtenPerGesprek, 999);
    expect(resultaat.status).toBe("limiet_bereikt");
  });
});
