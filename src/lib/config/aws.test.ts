import { beforeEach, describe, expect, it, vi } from "vitest";

const { awsCredentialsProvider } = vi.hoisted(() => ({
  awsCredentialsProvider: vi.fn(() => async () => ({
    accessKeyId: "test",
    secretAccessKey: "test",
  })),
}));
vi.mock("@vercel/oidc-aws-credentials-provider", () => ({ awsCredentialsProvider }));

import {
  AWS_REGION_DEFAULT,
  AwsConfigFout,
  BEDROCK_MODEL_ID_DEFAULT,
  getAwsConfig,
  getAwsCredentialProvider,
  isEuRegio,
} from "./aws";

const ROL_ARN = "arn:aws:iam::123456789012:role/offerte-agent-productie";

function env(waarden: Record<string, string> = {}): NodeJS.ProcessEnv {
  return { NODE_ENV: "test", ...waarden };
}

describe("getAwsConfig", () => {
  it("valt zonder configuratie terug op Stockholm en het EU-profiel", () => {
    expect(getAwsConfig(env())).toEqual({
      regio: AWS_REGION_DEFAULT,
      rolArn: undefined,
      bedrockModelId: BEDROCK_MODEL_ID_DEFAULT,
      emailAfzender: undefined,
      sesConfiguratieSet: undefined,
    });
    expect(AWS_REGION_DEFAULT).toBe("eu-north-1");
  });

  it("leest alle variabelen uit de omgeving", () => {
    const config = getAwsConfig(
      env({
        AWS_REGION: "eu-west-1",
        AWS_ROLE_ARN: ROL_ARN,
        BEDROCK_MODEL_ID: "eu.anthropic.claude-sonnet-4-5-20250929-v1:0",
        EMAIL_FROM: "aanvragen@vakbalie.nl",
        SES_CONFIGURATION_SET: "transactioneel",
      }),
    );
    expect(config).toEqual({
      regio: "eu-west-1",
      rolArn: ROL_ARN,
      bedrockModelId: "eu.anthropic.claude-sonnet-4-5-20250929-v1:0",
      emailAfzender: "aanvragen@vakbalie.nl",
      sesConfiguratieSet: "transactioneel",
    });
  });

  it("behandelt lege en witruimte-waarden als afwezig", () => {
    const config = getAwsConfig(env({ AWS_REGION: "  ", AWS_ROLE_ARN: "", BEDROCK_MODEL_ID: "" }));
    expect(config.regio).toBe(AWS_REGION_DEFAULT);
    expect(config.rolArn).toBeUndefined();
    expect(config.bedrockModelId).toBe(BEDROCK_MODEL_ID_DEFAULT);
  });

  it.each(["us-east-1", "eu-west-2", "eu-central-2", "iad1"])(
    "weigert de niet-EU-regio %s in plaats van stil terug te vallen",
    (regio) => {
      expect(() => getAwsConfig(env({ AWS_REGION: regio }))).toThrow(AwsConfigFout);
    },
  );

  it.each([
    "global.anthropic.claude-haiku-4-5-20251001-v1:0",
    "us.anthropic.claude-haiku-4-5-20251001-v1:0",
    "anthropic.claude-haiku-4-5-20251001-v1:0",
  ])("weigert het model-ID %s omdat het geen EU-profiel is", (modelId) => {
    expect(() => getAwsConfig(env({ BEDROCK_MODEL_ID: modelId }))).toThrow(AwsConfigFout);
  });

  it("zet de afgekeurde waarde niet in de foutmelding", () => {
    expect(() => getAwsConfig(env({ AWS_REGION: "us-east-1" }))).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining("us-east-1") }),
    );
  });
});

describe("isEuRegio", () => {
  it("kent Londen en Zürich niet als EU-regio, ondanks het voorvoegsel", () => {
    expect(isEuRegio("eu-central-1")).toBe(true);
    expect(isEuRegio("eu-west-2")).toBe(false);
    expect(isEuRegio("eu-central-2")).toBe(false);
  });
});

describe("getAwsCredentialProvider", () => {
  beforeEach(() => {
    awsCredentialsProvider.mockClear();
  });

  it("geeft zonder rol-ARN undefined, zodat de SDK zijn standaardketen gebruikt", () => {
    expect(getAwsCredentialProvider(env())).toBeUndefined();
    expect(awsCredentialsProvider).not.toHaveBeenCalled();
  });

  it("geeft met rol-ARN de OIDC-provider, met STS in dezelfde EU-regio", () => {
    const provider = getAwsCredentialProvider(env({ AWS_ROLE_ARN: ROL_ARN }));
    expect(provider).toBeTypeOf("function");
    expect(awsCredentialsProvider).toHaveBeenCalledExactlyOnceWith({
      roleArn: ROL_ARN,
      clientConfig: { region: "eu-north-1" },
    });
  });

  it("maakt geen provider aan bij een niet-EU-regio", () => {
    expect(() =>
      getAwsCredentialProvider(env({ AWS_ROLE_ARN: ROL_ARN, AWS_REGION: "us-east-1" })),
    ).toThrow(AwsConfigFout);
    expect(awsCredentialsProvider).not.toHaveBeenCalled();
  });
});
