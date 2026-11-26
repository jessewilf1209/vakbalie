import { describe, expect, it, vi } from "vitest";
import { assertEnv, EnvFout, isProductie } from "./env";

const ROL_ARN = "arn:aws:iam::123456789012:role/offerte-agent-productie";

/** Een geldige productieconfiguratie */
const PRODUCTIE: Record<string, string> = {
  NODE_ENV: "production",
  VERCEL_ENV: "production",
  LLM_PROVIDER: "bedrock",
  EMAIL_PROVIDER: "ses",
  AWS_REGION: "eu-north-1",
  AWS_ROLE_ARN: ROL_ARN,
  BEDROCK_MODEL_ID: "eu.anthropic.claude-haiku-4-5-20251001-v1:0",
  EMAIL_FROM: "aanvragen@vakbalie.nl",
};

function env(waarden: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return { NODE_ENV: "test", ...waarden };
}

function zonder(basis: Record<string, string>, ...namen: string[]): Record<string, string> {
  return Object.fromEntries(Object.entries(basis).filter(([naam]) => !namen.includes(naam)));
}

function problemenVan(bron: NodeJS.ProcessEnv): readonly string[] {
  try {
    assertEnv(bron);
  } catch (fout) {
    if (fout instanceof EnvFout) return fout.problemen;
    throw fout;
  }
  return [];
}

describe("isProductie", () => {
  it("volgt op Vercel VERCEL_ENV, zodat een preview-deploy geen productie is", () => {
    expect(isProductie(env({ NODE_ENV: "production", VERCEL_ENV: "production" }))).toBe(true);
    expect(isProductie(env({ NODE_ENV: "production", VERCEL_ENV: "preview" }))).toBe(false);
    expect(isProductie(env({ NODE_ENV: "production", VERCEL_ENV: "development" }))).toBe(false);
  });

  it("valt buiten Vercel terug op NODE_ENV (fail-closed)", () => {
    expect(isProductie(env({ NODE_ENV: "production" }))).toBe(true);
    expect(isProductie(env({ NODE_ENV: "development" }))).toBe(false);
    expect(isProductie(env({}))).toBe(false);
  });
});

describe("assertEnv buiten productie", () => {
  it("accepteert een lege omgeving en kiest de mocks (mock-first)", () => {
    const resultaat = assertEnv(env({}));
    expect(resultaat.LLM_PROVIDER).toBe("mock");
    expect(resultaat.EMAIL_PROVIDER).toBe("mock");
    expect(resultaat.productie).toBe(false);
  });

  it("behandelt lege strings als afwezig", () => {
    const resultaat = assertEnv(
      env({ LLM_PROVIDER: "", EMAIL_PROVIDER: "  ", EMAIL_CATCH_ALL: "" }),
    );
    expect(resultaat.LLM_PROVIDER).toBe("mock");
    expect(resultaat.EMAIL_PROVIDER).toBe("mock");
    expect(resultaat.EMAIL_CATCH_ALL).toBeUndefined();
  });

  it("staat een catch-all toe, want die is voor ontwikkeling bedoeld", () => {
    expect(assertEnv(env({ EMAIL_CATCH_ALL: "test@example.com" })).EMAIL_CATCH_ALL).toBe(
      "test@example.com",
    );
  });

  it("laat een preview-deploy op de mocks draaien", () => {
    expect(() => assertEnv(env({ NODE_ENV: "production", VERCEL_ENV: "preview" }))).not.toThrow();
  });

  it("staat Bedrock met een lokaal AWS-profiel toe, zonder rol of sleutels", () => {
    expect(() => assertEnv(env({ LLM_PROVIDER: "bedrock" }))).not.toThrow();
  });

  it("weigert een onbekende provider", () => {
    expect(problemenVan(env({ LLM_PROVIDER: "openai" }))).toEqual([
      "LLM_PROVIDER moet een van mock, bedrock, anthropic zijn",
    ]);
    expect(problemenVan(env({ EMAIL_PROVIDER: "sendgrid" }))).toEqual([
      "EMAIL_PROVIDER moet een van mock, ses zijn",
    ]);
  });

  it("meldt een ontbrekende variabele bij de gekozen provider", () => {
    expect(problemenVan(env({ LLM_PROVIDER: "anthropic" }))).toEqual([
      "ANTHROPIC_API_KEY ontbreekt, vereist bij LLM_PROVIDER=anthropic",
    ]);
    expect(problemenVan(env({ EMAIL_PROVIDER: "ses" }))).toEqual([
      "EMAIL_FROM ontbreekt, vereist bij EMAIL_PROVIDER=ses",
    ]);
  });

  it("weigert een half AWS-sleutelpaar", () => {
    expect(problemenVan(env({ AWS_ACCESS_KEY_ID: "AKIATEST" }))).toEqual([
      "AWS_SECRET_ACCESS_KEY ontbreekt, een AWS-sleutelpaar bestaat uit beide variabelen",
    ]);
    expect(problemenVan(env({ AWS_SECRET_ACCESS_KEY: "geheim" }))).toEqual([
      "AWS_ACCESS_KEY_ID ontbreekt, een AWS-sleutelpaar bestaat uit beide variabelen",
    ]);
  });

  it("weigert ook buiten productie een regio of model buiten de EU", () => {
    expect(problemenVan(env({ AWS_REGION: "us-east-1" }))).toHaveLength(1);
    expect(problemenVan(env({ AWS_REGION: "eu-west-2" }))).toHaveLength(1);
    expect(
      problemenVan(env({ BEDROCK_MODEL_ID: "global.anthropic.claude-haiku-4-5-20251001-v1:0" })),
    ).toEqual(["BEDROCK_MODEL_ID is geen EU-inferentieprofiel (moet met eu. beginnen)"]);
  });

  it("weigert een rol-ARN die geen IAM-rol is", () => {
    expect(problemenVan(env({ AWS_ROLE_ARN: "arn:aws:iam::123456789012:user/jesse" }))).toEqual([
      "AWS_ROLE_ARN is geen geldige IAM-rol-ARN",
    ]);
  });
});

describe("assertEnv in productie", () => {
  it("accepteert de geldige combinatie met een OIDC-rol", () => {
    const resultaat = assertEnv(env(PRODUCTIE));
    expect(resultaat).toMatchObject({
      productie: true,
      LLM_PROVIDER: "bedrock",
      EMAIL_PROVIDER: "ses",
      AWS_ROLE_ARN: ROL_ARN,
    });
  });

  it("accepteert een sleutelpaar als terugvaloptie voor de rol", () => {
    const metSleutels = {
      ...zonder(PRODUCTIE, "AWS_ROLE_ARN"),
      AWS_ACCESS_KEY_ID: "AKIATEST",
      AWS_SECRET_ACCESS_KEY: "geheim",
    };
    expect(() => assertEnv(env(metSleutels))).not.toThrow();
  });

  it("weigert een catch-all", () => {
    expect(problemenVan(env({ ...PRODUCTIE, EMAIL_CATCH_ALL: "test@example.com" }))).toEqual([
      "EMAIL_CATCH_ALL mag in productie niet bestaan",
    ]);
  });

  it.each(["mock", "anthropic", undefined])("weigert LLM_PROVIDER=%s (residentie)", (provider) => {
    const problemen = problemenVan(
      env({ ...PRODUCTIE, LLM_PROVIDER: provider, ANTHROPIC_API_KEY: "sk-ant-test" }),
    );
    expect(problemen).toEqual([
      "LLM_PROVIDER moet in productie bedrock zijn (EU-residentie)",
    ]);
  });

  it.each(["mock", undefined])("weigert EMAIL_PROVIDER=%s (residentie)", (provider) => {
    const problemen = problemenVan(env({ ...PRODUCTIE, EMAIL_PROVIDER: provider }));
    expect(problemen).toEqual([
      "EMAIL_PROVIDER moet in productie ses zijn (EU-residentie)",
    ]);
  });

  it("weigert een AWS-provider zonder rol en zonder sleutelpaar", () => {
    expect(problemenVan(env(zonder(PRODUCTIE, "AWS_ROLE_ARN")))).toEqual([
      "AWS_ROLE_ARN ontbreekt (of een AWS-sleutelpaar), vereist bij een AWS-provider",
    ]);
  });

  it("laat een niet-EU-LLM alleen door met ALLOW_NON_EU_LLM=true, met een luide waarschuwing", () => {
    const waarschuwing = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const bron = { ...PRODUCTIE, LLM_PROVIDER: "mock" };

    expect(problemenVan(env({ ...bron, ALLOW_NON_EU_LLM: "ja" }))).toHaveLength(1);
    expect(waarschuwing).not.toHaveBeenCalled();

    expect(() => assertEnv(env({ ...bron, ALLOW_NON_EU_LLM: "true" }))).not.toThrow();
    expect(waarschuwing).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining("ALLOW_NON_EU_LLM"),
    );
    waarschuwing.mockRestore();
  });

  it("laat een niet-EU-mailprovider alleen door met ALLOW_NON_EU_EMAIL=true", () => {
    const waarschuwing = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const bron = { ...PRODUCTIE, EMAIL_PROVIDER: "mock" };

    expect(problemenVan(env({ ...bron, ALLOW_NON_EU_EMAIL: "ja" }))).toHaveLength(1);
    expect(() => assertEnv(env({ ...bron, ALLOW_NON_EU_EMAIL: "true" }))).not.toThrow();
    expect(waarschuwing).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining("ALLOW_NON_EU_EMAIL"),
    );
    waarschuwing.mockRestore();
  });

  it("meldt alle problemen in één keer", () => {
    const problemen = problemenVan(
      env({ NODE_ENV: "production", EMAIL_CATCH_ALL: "x@example.com" }),
    );
    expect(problemen).toEqual([
      "EMAIL_CATCH_ALL mag in productie niet bestaan",
      "LLM_PROVIDER moet in productie bedrock zijn (EU-residentie)",
      "EMAIL_PROVIDER moet in productie ses zijn (EU-residentie)",
    ]);
  });

  it("zet nooit een waarde in de foutmelding, alleen variabelenamen", () => {
    const geheim = "sk-ant-zeer-geheim";
    const bron = env({
      ...PRODUCTIE,
      LLM_PROVIDER: geheim,
      AWS_REGION: "us-east-1",
      EMAIL_CATCH_ALL: "prive@example.com",
      AWS_SECRET_ACCESS_KEY: geheim,
    });
    let melding = "";
    try {
      assertEnv(bron);
    } catch (fout) {
      melding = fout instanceof Error ? fout.message : "";
    }
    expect(melding).toContain("Ongeldige omgevingsconfiguratie");
    expect(melding).not.toContain(geheim);
    expect(melding).not.toContain("us-east-1");
    expect(melding).not.toContain("prive@example.com");
  });
});
