import { describe, expect, it } from "vitest";
import { amsterdamMiddernacht, bepaalPeriode, leesPeriodeSoort } from "./periode";

describe("amsterdamMiddernacht", () => {
  it("houdt rekening met zomertijd (UTC+2) en wintertijd (UTC+1)", () => {
    expect(amsterdamMiddernacht(2026, 7, 1).toISOString()).toBe("2026-06-30T22:00:00.000Z");
    expect(amsterdamMiddernacht(2026, 1, 1).toISOString()).toBe("2025-12-31T23:00:00.000Z");
  });

  it("klopt op de dagen van de klokwissel", () => {
    // 29 maart 2026: klok vooruit om 02:00. 25 oktober 2026: klok terug.
    expect(amsterdamMiddernacht(2026, 3, 29).toISOString()).toBe("2026-03-28T23:00:00.000Z");
    expect(amsterdamMiddernacht(2026, 3, 30).toISOString()).toBe("2026-03-29T22:00:00.000Z");
    expect(amsterdamMiddernacht(2026, 10, 25).toISOString()).toBe("2026-10-24T22:00:00.000Z");
    expect(amsterdamMiddernacht(2026, 10, 26).toISOString()).toBe("2026-10-25T23:00:00.000Z");
  });

  it("rolt maanden en dagen door zoals Date.UTC", () => {
    expect(amsterdamMiddernacht(2026, 13, 1).toISOString()).toBe("2026-12-31T23:00:00.000Z");
    expect(amsterdamMiddernacht(2026, 3, 0).toISOString()).toBe("2026-02-27T23:00:00.000Z");
  });
});

describe("bepaalPeriode", () => {
  // 31 oktober 23:30 UTC is in Amsterdam al 1 november 00:30.
  const nu = new Date("2026-10-31T23:30:00Z");

  it("deze maand volgt de Amsterdamse kalender, niet UTC", () => {
    const p = bepaalPeriode("deze_maand", nu);
    expect(p.van.toISOString()).toBe("2026-10-31T23:00:00.000Z");
    expect(p.tot.toISOString()).toBe("2026-11-01T23:00:00.000Z");
    expect(p.label).toBe("November 2026");
  });

  it("vorige maand loopt over de klokwissel heen", () => {
    const p = bepaalPeriode("vorige_maand", nu);
    expect(p.van.toISOString()).toBe("2026-09-30T22:00:00.000Z");
    expect(p.tot.toISOString()).toBe("2026-10-31T23:00:00.000Z");
    expect(p.label).toBe("Oktober 2026");
  });

  it("laatste 7 dagen telt vandaag mee", () => {
    const p = bepaalPeriode("laatste_7_dagen", nu);
    expect(p.van.toISOString()).toBe("2026-10-25T23:00:00.000Z");
    expect(p.tot.toISOString()).toBe("2026-11-01T23:00:00.000Z");
  });

  it("onbekende zoekparameter wordt deze maand", () => {
    expect(leesPeriodeSoort("iets")).toBe("deze_maand");
    expect(leesPeriodeSoort(undefined)).toBe("deze_maand");
    expect(leesPeriodeSoort("vorige_maand")).toBe("vorige_maand");
  });
});
