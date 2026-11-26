import "server-only";
import { z } from "zod";
import { isEuInferentieprofiel, isEuRegio } from "./aws";

/**
 * Validatie van de omgevingsvariabelen rond providerkeuze en dataresidentie
 *. Eén `assertEnv()` die alle problemen in één keer meldt,
 * zodat een verkeerde configuratie luid faalt in plaats van stil persoons-
 * gegevens buiten de EU te sturen.
 *
 * Foutmeldingen noemen alleen variabelenamen, nooit waarden: ze komen in de
 * logs terecht en een deel van de variabelen is geheim.
 */

export const LLM_PROVIDERS = ["mock", "bedrock", "anthropic"] as const;
export const EMAIL_PROVIDERS = ["mock", "ses"] as const;

/** De enige providers die persoonsgegevens binnen de EU houden. */
const EU_LLM_PROVIDER = "bedrock";
const EU_EMAIL_PROVIDER = "ses";

const GELEZEN_VARIABELEN = [
  "LLM_PROVIDER",
  "EMAIL_PROVIDER",
  "AWS_REGION",
  "AWS_ROLE_ARN",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "BEDROCK_MODEL_ID",
  "SES_CONFIGURATION_SET",
  "EMAIL_FROM",
  "EMAIL_CATCH_ALL",
  "ANTHROPIC_API_KEY",
] as const;

const optioneel = z.string().optional();

const basisSchema = z.object({
  LLM_PROVIDER: z
    .enum(LLM_PROVIDERS, { error: `moet een van ${LLM_PROVIDERS.join(", ")} zijn` })
    .default("mock"),
  EMAIL_PROVIDER: z
    .enum(EMAIL_PROVIDERS, { error: `moet een van ${EMAIL_PROVIDERS.join(", ")} zijn` })
    .default("mock"),
  AWS_REGION: optioneel.refine((v) => v === undefined || isEuRegio(v), {
    error: "is geen EU-regio; verwacht bijvoorbeeld eu-north-1",
  }),
  AWS_ROLE_ARN: optioneel.refine(
    (v) => v === undefined || /^arn:aws:iam::\d{12}:role\/.+$/.test(v),
    {
      error: "is geen geldige IAM-rol-ARN",
    },
  ),
  AWS_ACCESS_KEY_ID: optioneel,
  AWS_SECRET_ACCESS_KEY: optioneel,
  BEDROCK_MODEL_ID: optioneel.refine((v) => v === undefined || isEuInferentieprofiel(v), {
    error: "is geen EU-inferentieprofiel (moet met eu. beginnen)",
  }),
  SES_CONFIGURATION_SET: optioneel,
  EMAIL_FROM: optioneel,
  EMAIL_CATCH_ALL: optioneel,
  ANTHROPIC_API_KEY: optioneel,
});

export type AppEnv = z.infer<typeof basisSchema> & {
  /** Echte productie, dus niet een preview-deploy of een lokale build. */
  productie: boolean;
};

/** Configuratiefout. `problemen` bevat één regel per variabele, zonder waarden. */
export class EnvFout extends Error {
  constructor(readonly problemen: readonly string[]) {
    super(`Ongeldige omgevingsconfiguratie:\n- ${problemen.join("\n- ")}`);
    this.name = "EnvFout";
  }
}

/**
 * Is dit de productieomgeving met echte persoonsgegevens?
 *
 * Op Vercel beslist `VERCEL_ENV`, niet `NODE_ENV`: een preview-deploy draait
 * ook met `NODE_ENV=production`, maar hoort op de mock te blijven. Buiten
 * Vercel is `NODE_ENV=production` het enige signaal en geldt het strenge
 * regime (fail-closed).
 */
export function isProductie(bron: NodeJS.ProcessEnv = process.env): boolean {
  const vercelEnv = bron.VERCEL_ENV?.trim();
  if (vercelEnv) return vercelEnv === "production";
  return bron.NODE_ENV === "production";
}

/**
 * De enige uitweg uit het residentie-slot voor de LLM. Bewust een aparte,
 * lelijke variabele die exact "true" moet zijn: wie hem zet, kiest er
 * zichtbaar voor. Gebruik alleen bewust.
 */
export function nietEuLlmToegestaan(bron: NodeJS.ProcessEnv = process.env): boolean {
  return bron.ALLOW_NON_EU_LLM?.trim() === "true";
}

/** Zelfde uitweg voor e-mail, bijvoorbeeld zolang SES nog niet bereikbaar is. */
export function nietEuEmailToegestaan(bron: NodeJS.ProcessEnv = process.env): boolean {
  return bron.ALLOW_NON_EU_EMAIL?.trim() === "true";
}

function maakSchema(productie: boolean, llmUitzondering: boolean, emailUitzondering: boolean) {
  return basisSchema.superRefine((env, ctx) => {
    const meld = (variabele: keyof typeof env, message: string) =>
      ctx.addIssue({ code: "custom", path: [variabele], message });

    if (productie) {
      // Met een catch-all gaat alle mail naar één testadres in plaats van naar
      // de vakman: in productie is dat een datalek én een gemiste aanvraag.
      if (env.EMAIL_CATCH_ALL !== undefined) {
        meld("EMAIL_CATCH_ALL", "mag in productie niet bestaan");
      }
      if (env.LLM_PROVIDER !== EU_LLM_PROVIDER && !llmUitzondering) {
        meld("LLM_PROVIDER", `moet in productie ${EU_LLM_PROVIDER} zijn (EU-residentie)`);
      }
      if (env.EMAIL_PROVIDER !== EU_EMAIL_PROVIDER && !emailUitzondering) {
        meld(
          "EMAIL_PROVIDER",
          `moet in productie ${EU_EMAIL_PROVIDER} zijn (EU-residentie)`,
        );
      }
    }

    if (env.LLM_PROVIDER === "anthropic" && env.ANTHROPIC_API_KEY === undefined) {
      meld("ANTHROPIC_API_KEY", "ontbreekt, vereist bij LLM_PROVIDER=anthropic");
    }
    if (env.EMAIL_PROVIDER !== "mock" && env.EMAIL_FROM === undefined) {
      meld("EMAIL_FROM", `ontbreekt, vereist bij EMAIL_PROVIDER=${env.EMAIL_PROVIDER}`);
    }

    const heeftSleutelId = env.AWS_ACCESS_KEY_ID !== undefined;
    const heeftSleutelGeheim = env.AWS_SECRET_ACCESS_KEY !== undefined;
    if (heeftSleutelId !== heeftSleutelGeheim) {
      meld(
        heeftSleutelId ? "AWS_SECRET_ACCESS_KEY" : "AWS_ACCESS_KEY_ID",
        "ontbreekt, een AWS-sleutelpaar bestaat uit beide variabelen",
      );
    }

    // Buiten productie mag de SDK ook een lokaal AWS-profiel gebruiken; in
    // productie bestaat dat niet en moet de toegang expliciet geregeld zijn.
    const kiestAws = env.LLM_PROVIDER === "bedrock" || env.EMAIL_PROVIDER === "ses";
    const heeftSleutelpaar = heeftSleutelId && heeftSleutelGeheim;
    if (productie && kiestAws && env.AWS_ROLE_ARN === undefined && !heeftSleutelpaar) {
      meld("AWS_ROLE_ARN", "ontbreekt (of een AWS-sleutelpaar), vereist bij een AWS-provider");
    }
  });
}

/**
 * Valideert de omgeving en geeft de getypeerde waarden terug. Gooit een
 * `EnvFout` met alle problemen tegelijk. Lege variabelen tellen als afwezig,
 * net als in de rest van de code.
 */
export function assertEnv(bron: NodeJS.ProcessEnv = process.env): AppEnv {
  const productie = isProductie(bron);
  const invoer: Record<string, string | undefined> = {};
  for (const naam of GELEZEN_VARIABELEN) {
    const waarde = bron[naam]?.trim();
    invoer[naam] = waarde ? waarde : undefined;
  }

  const llmUitzondering = nietEuLlmToegestaan(bron);

  const emailUitzondering = nietEuEmailToegestaan(bron);

  const resultaat = maakSchema(productie, llmUitzondering, emailUitzondering).safeParse(invoer);
  if (!resultaat.success) {
    throw new EnvFout(
      resultaat.error.issues.map((issue) => `${issue.path.join(".")} ${issue.message}`),
    );
  }
  if (productie && llmUitzondering && resultaat.data.LLM_PROVIDER !== EU_LLM_PROVIDER) {
    console.warn(
      "LET OP: ALLOW_NON_EU_LLM staat aan in productie. De LLM draait NIET via het EU-profiel; leg dit vast in.",
    );
  }
  if (productie && emailUitzondering && resultaat.data.EMAIL_PROVIDER !== EU_EMAIL_PROVIDER) {
    console.warn(
      "LET OP: ALLOW_NON_EU_EMAIL staat aan in productie. E-mail gaat NIET via SES in de EU; leg dit vast in.",
    );
  }
  return { ...resultaat.data, productie };
}
