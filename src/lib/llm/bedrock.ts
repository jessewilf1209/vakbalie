import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { AnthropicBedrock } from "@anthropic-ai/bedrock-sdk";
import type { AwsCredentialProvider } from "@/lib/config/aws";
import { bouwBerichtVerzoek, leesAntwoord, type BerichtenClient } from "./messages";
import {
  LlmError,
  type LlmProvider,
  type LlmStructuredRequest,
  type LlmStructuredResult,
} from "./types";

export interface BedrockOpties {
  /** AWS-bronregio; komt uit `getAwsConfig()` en is daar al op EU gecontroleerd. */
  regio: string;
  /** EU-inferentieprofiel, bijvoorbeeld `eu.anthropic.claude-haiku-5-5`. */
  modelId: string;
  /** OIDC-provider; zonder gebruikt de SDK de standaard credential-keten. */
  credentialProvider?: AwsCredentialProvider;
}

type ProviderChainResolver = NonNullable<
  ConstructorParameters<typeof AnthropicBedrock>[0]
>["providerChainResolver"];

/**
 * Bedrock-adapter: dezelfde Messages-API als de Anthropic-adapter,
 * maar via een EU-inferentieprofiel, zodat gespreksinhoud binnen EU-regio's
 * van AWS blijft. Regio en model-ID komen uit de configuratie, nooit uit
 * deze klasse: een modelwissel mag geen codewijziging zijn.
 */
export class BedrockLlmProvider implements LlmProvider {
  readonly name = "bedrock";
  readonly model: string;
  private readonly client: BerichtenClient;

  constructor(opties: BedrockOpties, client?: BerichtenClient) {
    this.model = opties.modelId;
    const provider = opties.credentialProvider;
    this.client =
      client ??
      new AnthropicBedrock({
        awsRegion: opties.regio,
        // De rol-provider van Vercel en de SDK gebruiken elk een eigen versie
        // van hetzelfde AWS-credentialtype; functioneel zijn ze gelijk.
        ...(provider
          ? { providerChainResolver: (async () => provider) as ProviderChainResolver }
          : {}),
      });
  }

  async completeStructured(request: LlmStructuredRequest): Promise<LlmStructuredResult> {
    let response: Anthropic.Message;
    try {
      response = await this.client.messages.create(bouwBerichtVerzoek(request, this.model));
    } catch (error) {
      throw naarLlmError(error);
    }
    return leesAntwoord(response);
  }
}

/**
 * Zoekt een `CredentialsProviderError` in de fout zelf of in de `cause`-keten
 * (begrensd, tegen cyclische ketens).
 */
function isCredentialsFout(error: unknown): boolean {
  let huidige: unknown = error;
  for (let diepte = 0; diepte < 5 && huidige instanceof Error; diepte++) {
    if (huidige.name === "CredentialsProviderError") return true;
    huidige = huidige.cause;
  }
  return false;
}

/** Bedrock zet het fouttype in een header, bijvoorbeeld "ThrottlingException:http://...". */
function bedrockFoutType(error: InstanceType<typeof Anthropic.APIError>): string | undefined {
  return error.headers?.get("x-amzn-errortype")?.split(":")[0];
}

/**
 * Vertaalt een Bedrock-fout naar `LlmError`. Logt alleen status en fouttype,
 * nooit gespreksinhoud of credentials.
 */
function naarLlmError(error: unknown): LlmError {
  // Vóór de APIError-tak: de Bedrock-SDK (vanaf 1.x) verpakt een
  // credentialsfout als APIConnectionError, met de echte fout in `cause`.
  if (isCredentialsFout(error)) {
    console.error("bedrock: geen geldige AWS-credentials", {
      hint: "Productie: controleer AWS_ROLE_ARN en de OIDC-koppeling. Lokaal: aws login en AWS_PROFILE.",
    });
    return new LlmError("LLM-aanroep mislukt (AWS-credentials)", false);
  }
  if (!(error instanceof Anthropic.APIError)) {
    return new LlmError("LLM-aanroep mislukt (netwerk/onbekend)", true);
  }

  const status = error.status;
  const type = bedrockFoutType(error);

  if (type === "ServiceQuotaExceededException") {
    // Geen bug en niet met opnieuw proberen op te lossen: quotum aanvragen.
    console.error("bedrock: servicequotum bereikt", {
      hint: "Vraag in AWS Service Quotas een hoger Bedrock-quotum aan voor dit model.",
    });
    return new LlmError("LLM-aanroep mislukt (servicequotum)", false);
  }
  if (type === "ThrottlingException" || status === 429) {
    return new LlmError("LLM-aanroep mislukt (throttling)", true);
  }
  if (type === "AccessDeniedException" || status === 403) {
    console.error("bedrock: toegang geweigerd", {
      hint: "Een EU-inferentieprofiel vereist IAM-rechten op het profiel én op het model in elke bestemmingsregio. Controleer ook de modeltoegang in Bedrock.",
    });
    return new LlmError("LLM-aanroep mislukt (toegang geweigerd)", false);
  }
  if (status !== undefined && status >= 500) {
    return new LlmError(`LLM-aanroep mislukt (status ${status})`, true);
  }
  // ValidationException en overige 4xx: opnieuw proberen geeft hetzelfde.
  return new LlmError(`LLM-aanroep mislukt (status ${status ?? "onbekend"})`, false);
}
