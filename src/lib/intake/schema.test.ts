import { describe, expect, it } from "vitest";
import { intakeResponseJsonSchema, intakeResponseSchema, sanitizeVelden } from "./schema";

describe("intakeResponseSchema", () => {
  it("accepteert een minimale geldige respons", () => {
    const r = intakeResponseSchema.safeParse({ antwoord: "In welke plaats woon je?" });
    expect(r.success).toBe(true);
  });

  it("wijst een leeg of veel te lang antwoord af", () => {
    expect(intakeResponseSchema.safeParse({ antwoord: "" }).success).toBe(false);
    expect(intakeResponseSchema.safeParse({ antwoord: "x".repeat(1501) }).success).toBe(false);
  });

  it("dwingt budget- en timing-categorieën af (geen vrije tekst)", () => {
    const fout = intakeResponseSchema.safeParse({
      antwoord: "ok",
      velden: { budgetIndicatie: "ongeveer vijfduizend euro" },
    });
    expect(fout.success).toBe(false);
    const goed = intakeResponseSchema.safeParse({
      antwoord: "ok",
      velden: { budgetIndicatie: "2500_10000", timing: "1_3_maanden" },
    });
    expect(goed.success).toBe(true);
  });

  it("wijst onbekende score-achtige velden af die de LLM zou kunnen smokkelen", () => {
    const r = intakeResponseSchema.safeParse({ antwoord: "ok", leadscore: 100 });
    // Onbekende keys worden gestript: parse slaagt maar het veld bestaat niet.
    expect(r.success).toBe(true);
    expect(r.success && "leadscore" in r.data).toBe(false);
  });

  it("genereert een bruikbaar JSON-schema voor tool-use", () => {
    const schema = intakeResponseJsonSchema();
    expect(schema).toMatchObject({ type: "object" });
    expect(JSON.stringify(schema)).toContain("antwoord");
  });
});

describe("sanitizeVelden", () => {
  it("normaliseert een geldig e-mailadres", () => {
    expect(sanitizeVelden({ contactEmail: "  Jan@Voorbeeld.NL " })).toEqual({
      contactEmail: "jan@voorbeeld.nl",
    });
  });

  it("laat een ongeldig e-mailadres weg in plaats van te falen", () => {
    expect(sanitizeVelden({ contactEmail: "geen-email", plaats: "Zwolle" })).toEqual({
      plaats: "Zwolle",
    });
  });

  it("valideert en formatteert een Nederlands telefoonnummer", () => {
    const schoon = sanitizeVelden({ contactTelefoon: "0612345678" });
    expect(schoon.contactTelefoon).toBe("+31 6 12345678");
  });

  it("laat een ongeldig telefoonnummer weg", () => {
    expect(sanitizeVelden({ contactTelefoon: "12" })).toEqual({});
  });

  it("trimt tekstvelden en laat lege strings weg", () => {
    expect(sanitizeVelden({ plaats: "  Zwolle  ", wensen: "   " })).toEqual({
      plaats: "Zwolle",
    });
  });
});
