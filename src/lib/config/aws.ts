import "server-only";
import { awsCredentialsProvider } from "@vercel/oidc-aws-credentials-provider";

/**
 * AWS-configuratie voor Bedrock en SES: één plek waar
 * regio, rol en model-ID uit de omgeving komen, zodat de twee adapters niet
 * elk hun eigen leeslogica krijgen.
 *
 * Alleen server-side; de waarden bestaan nooit client-side.
 */

export const AWS_REGION_DEFAULT = "eu-north-1";
export const BEDROCK_MODEL_ID_DEFAULT = "eu.anthropic.claude-haiku-4-5-20251001-v1:0";

/**
 * AWS-regio's die in de EU liggen. Bewust een vaste lijst en geen controle op
 * het voorvoegsel "eu-": eu-west-2 (Londen) en eu-central-2 (Zürich) liggen
 * buiten de EU.
 */
export const EU_REGIOS: readonly string[] = [
  "eu-central-1",
  "eu-north-1",
  "eu-south-1",
  "eu-south-2",
  "eu-west-1",
  "eu-west-3",
];

export type AwsCredentialProvider = ReturnType<typeof awsCredentialsProvider>;

export interface AwsConfig {
  regio: string;
  /** IAM-rol voor Vercel OIDC; `undefined` = standaard credential-keten. */
  rolArn: string | undefined;
  bedrockModelId: string;
  emailAfzender: string | undefined;
  sesConfiguratieSet: string | undefined;
}

/** Fout in de AWS-configuratie. Bevat alleen variabelenamen, nooit waarden. */
export class AwsConfigFout extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AwsConfigFout";
  }
}

export function isEuRegio(regio: string): boolean {
  return EU_REGIOS.includes(regio);
}

/**
 * Alleen het geografische EU-inferentieprofiel houdt de verwerking binnen de
 * EU. Een `global.`- of `us.`-profiel routeert erbuiten, ook vanuit een EU-regio.
 */
export function isEuInferentieprofiel(modelId: string): boolean {
  return modelId.startsWith("eu.");
}

function lees(bron: NodeJS.ProcessEnv, naam: string): string | undefined {
  const waarde = bron[naam]?.trim();
  return waarde ? waarde : undefined;
}

/**
 * Leest de AWS-configuratie en weigert alles wat buiten de EU uitkomt
 * (fail-closed op residentie).
 *
 * `AWS_REGION` heeft een eigen default: Vercel zet die variabele zelf op de
 * uitvoeringsregio van de functie, dus de omgeving is niet blind te
 * vertrouwen. Een niet-EU-waarde is een fout en geen stille terugval, zodat
 * een verkeerde instelling zichtbaar wordt.
 */
export function getAwsConfig(bron: NodeJS.ProcessEnv = process.env): AwsConfig {
  const regio = lees(bron, "AWS_REGION") ?? AWS_REGION_DEFAULT;
  if (!isEuRegio(regio)) {
    throw new AwsConfigFout("AWS_REGION is geen EU-regio; verwacht bijvoorbeeld eu-north-1");
  }

  const bedrockModelId = lees(bron, "BEDROCK_MODEL_ID") ?? BEDROCK_MODEL_ID_DEFAULT;
  if (!isEuInferentieprofiel(bedrockModelId)) {
    throw new AwsConfigFout(
      "BEDROCK_MODEL_ID is geen EU-inferentieprofiel (moet met eu. beginnen)",
    );
  }

  return {
    regio,
    rolArn: lees(bron, "AWS_ROLE_ARN"),
    bedrockModelId,
    emailAfzender: lees(bron, "EMAIL_FROM"),
    sesConfiguratieSet: lees(bron, "SES_CONFIGURATION_SET"),
  };
}

/**
 * Credential-provider voor de AWS-clients.
 *
 * - `AWS_ROLE_ARN` aanwezig: Vercel OIDC wisselt het kortlevende token van de
 *   deployment in voor tijdelijke credentials van die rol. Er staat dan geen
 *   langlevende sleutel in Vercel (voorkeur).
 * - anders `undefined`: de SDK gebruikt zijn standaard credential-keten
 *   (lokaal profiel of een sleutelpaar in de omgeving).
 *
 * De STS-aanroep gaat naar het regionale endpoint van dezelfde EU-regio.
 */
export function getAwsCredentialProvider(
  bron: NodeJS.ProcessEnv = process.env,
): AwsCredentialProvider | undefined {
  const { regio, rolArn } = getAwsConfig(bron);
  if (!rolArn) return undefined;
  return awsCredentialsProvider({ roleArn: rolArn, clientConfig: { region: regio } });
}
