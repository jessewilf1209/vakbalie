import { z } from "zod";
import parsePhoneNumberFromString from "libphonenumber-js";
import { BUDGET_WAARDEN, TIMING_WAARDEN, type IntakeVelden } from "./types";

/**
 * Eén Zod-schema als bron van waarheid voor de LLM-output
 * . De LLM-aanroep dwingt ditzelfde schema af via tool-use
 * (z.toJSONSchema); server-side validatie hier is de échte grens —
 * LLM-output bereikt nooit ongevalideerd de rest van het systeem.
 */

export const intakeResponseSchema = z.object({
  /** Antwoord aan de bezoeker. Length-capped tegen runaway output. */
  antwoord: z.string().min(1).max(1500),
  /** In deze beurt herkende velden; alleen meegeven wat de bezoeker zei. */
  velden: z
    .object({
      plaats: z.string().max(120).nullish(),
      projectType: z.string().max(120).nullish(),
      wensen: z.string().max(2000).nullish(),
      tuinGrootte: z.string().max(120).nullish(),
      budgetIndicatie: z.enum(BUDGET_WAARDEN).nullish(),
      timing: z.enum(TIMING_WAARDEN).nullish(),
      contactNaam: z.string().max(200).nullish(),
      contactEmail: z.string().max(320).nullish(),
      contactTelefoon: z.string().max(40).nullish(),
    })
    .nullish(),
  /** Gaf de bezoeker deze beurt expliciet toestemming voor contactgegevens? */
  consentGegeven: z.boolean().nullish(),
  /** Signaal van het model dat de intake compleet is (server checkt zelf óók). */
  intakeCompleet: z.boolean().nullish(),
});

export type IntakeResponse = z.infer<typeof intakeResponseSchema>;

/** JSON Schema voor de tool-use-aanroep — gegenereerd, dus nooit uit de pas. */
export function intakeResponseJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(intakeResponseSchema, { target: "draft-7" }) as Record<string, unknown>;
}

/**
 * Schema voor de in de database bewaarde gespreksstaat. Alleen de server
 * schrijft die, maar we parsen tóch defensief (schema-drift na migraties,
 * defense-in-depth). Onparseerbaar = vers beginnen.
 */
export const intakeStateSchema = z.object({
  velden: z
    .object({
      plaats: z.string().max(120).optional(),
      projectType: z.string().max(120).optional(),
      wensen: z.string().max(2000).optional(),
      tuinGrootte: z.string().max(120).optional(),
      budgetIndicatie: z.enum(BUDGET_WAARDEN).optional(),
      timing: z.enum(TIMING_WAARDEN).optional(),
      contactNaam: z.string().max(200).optional(),
      contactEmail: z.string().max(320).optional(),
      contactTelefoon: z.string().max(40).optional(),
    })
    .default({}),
  consent: z
    .object({ gegeven: z.boolean(), tijdstip: z.string().optional() })
    .default({ gegeven: false }),
  aantalBerichten: z.number().int().min(0).default(0),
  tokens: z
    .object({ input: z.number().min(0), output: z.number().min(0) })
    .default({ input: 0, output: 0 }),
  afgerond: z.boolean().default(false),
});

const emailSchema = z.email();

/**
 * Veld-niveau-sanitisatie ná schema-validatie (stap 5.4): echte validators
 * voor e-mail en telefoon; ongeldig veld = veld weglaten (de engine vraagt
 * dan opnieuw), nooit de hele beurt laten falen.
 */
export function sanitizeVelden(ruw: NonNullable<IntakeResponse["velden"]>): Partial<IntakeVelden> {
  const schoon: Partial<IntakeVelden> = {};

  const tekstVelden = ["plaats", "projectType", "wensen", "tuinGrootte", "contactNaam"] as const;
  for (const veld of tekstVelden) {
    const waarde = ruw[veld];
    if (typeof waarde === "string" && waarde.trim().length > 0) {
      schoon[veld] = waarde.trim();
    }
  }

  if (ruw.budgetIndicatie) schoon.budgetIndicatie = ruw.budgetIndicatie;
  if (ruw.timing) schoon.timing = ruw.timing;

  if (typeof ruw.contactEmail === "string") {
    const email = ruw.contactEmail.trim().toLowerCase();
    if (emailSchema.safeParse(email).success) schoon.contactEmail = email;
  }

  if (typeof ruw.contactTelefoon === "string") {
    // Echte validator (libphonenumber), default-land NL.
    const nummer = parsePhoneNumberFromString(ruw.contactTelefoon.trim(), "NL");
    if (nummer?.isValid()) schoon.contactTelefoon = nummer.formatInternational();
  }

  return schoon;
}
