import { describe, expect, it } from "vitest";
import type { TenantCijfers } from "./cijfers-types";
import { bepaalSignalen } from "./signalen";

const NU = new Date("2026-11-11T12:00:00Z");

function tenant(over: Partial<TenantCijfers>): TenantCijfers {
  return {
    tenantId: "10000000-0000-4000-8000-000000000001",
    naam: "Tuin",
    status: "active",
    gesprekken: 10,
    leads: 2,
    fotos: 0,
    aanroepen: 40,
    inputTokens: 0,
    outputTokens: 0,
    kostenIntake: 10 * 100,
    kostenOpvolgmail: 0,
    kostenBelscript: 0,
    kostenTotaal: 10 * 100,
    notificatiemails: 2,
    opvolgmails: 0,
    afgerondOpBudget: 0,
    rateLimitGeweigerd: 0,
    dagremGeweigerd: 0,
    laatsteGesprek: new Date("2026-11-11T08:00:00Z"),
    laatsteLogin: null,
    ...over,
  };
}

const zonder = { dagremStand: 0, dagremPlafond: 50_000, nu: NU };

describe("bepaalSignalen", () => {
  it("geen signalen bij een gezonde klant", () => {
    expect(bepaalSignalen({ ...zonder, tenants: [tenant({})] })).toEqual([]);
  });

  it("actieve klant zonder gesprekken in 7 dagen (kapotte widget)", () => {
    const signalen = bepaalSignalen({
      ...zonder,
      tenants: [tenant({ laatsteGesprek: new Date("2026-11-03T12:00:00Z"), gesprekken: 0 })],
    });
    expect(signalen.map((s) => s.soort)).toEqual(["geen_gesprekken"]);
    expect(signalen[0].titel).toContain("8 dagen");
  });

  it("nieuwe klant die nog nooit een gesprek had", () => {
    const signalen = bepaalSignalen({
      ...zonder,
      tenants: [tenant({ status: "trial", laatsteGesprek: null, gesprekken: 0 })],
    });
    expect(signalen[0].titel).toContain("nog nooit");
  });

  it("een inactieve klant valt niet op door stilte", () => {
    const signalen = bepaalSignalen({
      ...zonder,
      tenants: [tenant({ status: "inactive", laatsteGesprek: null, gesprekken: 0 })],
    });
    expect(signalen).toEqual([]);
  });

  it("kostenuitschieter: meer dan 2x het gemiddelde per gesprek", () => {
    const normaal = tenant({ tenantId: "a", naam: "Normaal" });
    const duur = tenant({ tenantId: "b", naam: "Duur", gesprekken: 10, kostenIntake: 10 * 1_000 });
    const signalen = bepaalSignalen({
      ...zonder,
      tenants: [normaal, normaal, normaal, normaal, normaal, duur],
    });
    expect(signalen.filter((s) => s.soort === "dure_gesprekken").map((s) => s.tenantId)).toEqual([
      "b",
    ]);
  });

  it("vergelijkt geen kosten bij te weinig gesprekken", () => {
    const signalen = bepaalSignalen({
      ...zonder,
      tenants: [
        tenant({ tenantId: "a" }),
        tenant({ tenantId: "b", gesprekken: 2, kostenIntake: 1e6 }),
      ],
    });
    expect(signalen.some((s) => s.soort === "dure_gesprekken")).toBe(false);
  });

  it("dagrem boven 80%", () => {
    const signalen = bepaalSignalen({ ...zonder, dagremStand: 40_000, tenants: [] });
    expect(signalen).toMatchObject([{ soort: "dagrem_hoog", titel: "Dagrem op 80%" }]);
  });

  it("veel weigeringen bij één klant (mogelijk een bot)", () => {
    const signalen = bepaalSignalen({
      ...zonder,
      tenants: [tenant({ rateLimitGeweigerd: 25, gesprekken: 4 })],
    });
    expect(signalen.map((s) => s.soort)).toEqual(["veel_weigeringen"]);
  });
});
