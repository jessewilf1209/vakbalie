import { describe, expect, it } from "vitest";
import type { TenantCijfers } from "./cijfers-types";
import { leesSortering, naarKlantRij, sorteerKlanten } from "./klanten-tabel";

function t(naam: string, over: Partial<TenantCijfers> = {}): TenantCijfers {
  return {
    tenantId: naam,
    naam,
    status: "active",
    gesprekken: 0,
    leads: 0,
    fotos: 0,
    aanroepen: 0,
    inputTokens: 0,
    outputTokens: 0,
    kostenIntake: 0,
    kostenOpvolgmail: 0,
    kostenBelscript: 0,
    kostenTotaal: 0,
    notificatiemails: 0,
    opvolgmails: 0,
    afgerondOpBudget: 0,
    rateLimitGeweigerd: 0,
    dagremGeweigerd: 0,
    laatsteGesprek: null,
    laatsteLogin: null,
    ...over,
  };
}

describe("naarKlantRij", () => {
  it("rekent conversie, kosten per gesprek en mails uit, en deelt nooit door nul", () => {
    expect(
      naarKlantRij(
        t("A", { gesprekken: 4, leads: 1, kostenIntake: 200, notificatiemails: 1, opvolgmails: 2 }),
      ),
    ).toMatchObject({
      conversie: 0.25,
      kostenPerGesprek: 50,
      mails: 3,
    });
    expect(naarKlantRij(t("B"))).toMatchObject({ conversie: null, kostenPerGesprek: null });
  });
});

describe("sorteerKlanten", () => {
  const rijen = [
    naarKlantRij(t("Bloem", { kostenTotaal: 5, gesprekken: 1, kostenIntake: 5 })),
    naarKlantRij(t("aarde", { kostenTotaal: 50, gesprekken: 2, kostenIntake: 50 })),
    naarKlantRij(t("Cactus")),
  ];

  it("kosten aflopend is de standaard", () => {
    const { sleutel, richting } = leesSortering(undefined, undefined);
    expect(sorteerKlanten(rijen, sleutel, richting).map((r) => r.naam)).toEqual([
      "aarde",
      "Bloem",
      "Cactus",
    ]);
  });

  it("naam sorteert zonder op hoofdletters te letten", () => {
    expect(sorteerKlanten(rijen, "naam", "op").map((r) => r.naam)).toEqual([
      "aarde",
      "Bloem",
      "Cactus",
    ]);
  });

  it("lege waarden blijven onderaan, ook oplopend", () => {
    expect(sorteerKlanten(rijen, "kosten_per_gesprek", "op").map((r) => r.naam)).toEqual([
      "Bloem",
      "aarde",
      "Cactus",
    ]);
  });

  it("onbekende sleutel uit de URL wordt de standaard", () => {
    expect(leesSortering("drop table", "zijwaarts")).toEqual({ sleutel: "kosten", richting: "af" });
  });
});
