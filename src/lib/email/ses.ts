import "server-only";
import { SendEmailCommand, SESv2Client, type SendEmailCommandInput } from "@aws-sdk/client-sesv2";
import type { AwsCredentialProvider } from "@/lib/config/aws";
import { bouwAfzender } from "./afzender";
import type { EmailBericht, EmailProvider, EmailResultaat } from "./types";

export interface SesOpties {
  /** AWS-regio; komt uit `getAwsConfig()` en is daar al op EU gecontroleerd. */
  regio: string;
  /** Afzenderadres (EMAIL_FROM); de weergavenaam komt per bericht. */
  afzender: string;
  /** Optioneel: om later bounce- en klachtevents aan te zetten zonder codewijziging. */
  configuratieSet?: string;
  /** OIDC-provider; zonder gebruikt de SDK de standaard credential-keten. */
  credentialProvider?: AwsCredentialProvider;
}

/** Het deel van de SES-client dat de adapter gebruikt; in tests na te bootsen. */
export interface SesClient {
  send(commando: SendEmailCommand): Promise<unknown>;
}

/** SES weigert het bericht of de configuratie; opnieuw proberen helpt niet. */
const AFGEWEZEN = new Set([
  "MessageRejected",
  "MailFromDomainNotVerifiedException",
  "AccountSuspendedException",
  "SendingPausedException",
  "BadRequestException",
  "NotFoundException",
]);

/** Tijdelijke grens; de aanroeper kan het opnieuw proberen. */
const TIJDELIJK = new Set(["TooManyRequestsException", "LimitExceededException"]);

/** Bouwt het SES-verzoek. Los van de klasse, zodat het te testen is zonder client. */
export function bouwSesVerzoek(
  bericht: EmailBericht,
  opties: Pick<SesOpties, "afzender" | "configuratieSet">,
): SendEmailCommandInput {
  return {
    // De weergavenaam-sanitatie geldt ongewijzigd voor SES.
    FromEmailAddress: bouwAfzender(opties.afzender, bericht.afzenderNaam),
    Destination: { ToAddresses: [bericht.aan] },
    ...(bericht.replyTo ? { ReplyToAddresses: [bericht.replyTo] } : {}),
    Content: {
      Simple: {
        Subject: { Data: bericht.onderwerp, Charset: "UTF-8" },
        Body: {
          Html: { Data: bericht.html, Charset: "UTF-8" },
          Text: { Data: bericht.tekst, Charset: "UTF-8" },
        },
      },
    },
    ...(opties.configuratieSet ? { ConfigurationSetName: opties.configuratieSet } : {}),
  };
}

/**
 * SES-adapter: transactionele mail via Amazon SES in een EU-regio,
 * in hetzelfde AWS-account als Bedrock.
 */
export class SesEmailProvider implements EmailProvider {
  readonly naam = "ses";
  private readonly client: SesClient;

  constructor(
    private readonly opties: SesOpties,
    client?: SesClient,
  ) {
    this.client =
      client ??
      new SESv2Client({
        region: opties.regio,
        ...(opties.credentialProvider ? { credentials: opties.credentialProvider } : {}),
      });
  }

  async verstuur(bericht: EmailBericht): Promise<EmailResultaat> {
    try {
      await this.client.send(new SendEmailCommand(bouwSesVerzoek(bericht, this.opties)));
      return { ok: true };
    } catch (fout) {
      return naarResultaat(fout);
    }
  }
}

/**
 * Vertaalt een SES-fout naar `EmailResultaat`. Logt alleen het fouttype en de
 * status. Nooit de melding zelf: SES zet daar het e-mailadres in.
 */
function naarResultaat(fout: unknown): EmailResultaat {
  const naam = fout instanceof Error ? fout.name : "onbekend";
  const status = (fout as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
  const serverfout =
    (fout as { $fault?: string })?.$fault === "server" || (status !== undefined && status >= 500);

  if (naam === "MessageRejected") {
    // Herkenbare regel, anders zoek je in de code naar een fout die in de
    // AWS-console zit.
    console.error("ses-verzending afgewezen (MessageRejected)", {
      status: status ?? "onbekend",
      hint: "Zit SES nog in de sandbox? Dan mislukt alles naar niet-geverifieerde adressen. Controleer de productietoegang en de geverifieerde afzender in de AWS-console.",
    });
    return { ok: false, reden: "afgewezen" };
  }
  if (naam === "CredentialsProviderError") {
    console.error("ses: geen geldige AWS-credentials", {
      hint: "Productie: controleer AWS_ROLE_ARN en de OIDC-koppeling. Lokaal: aws login en AWS_PROFILE.",
    });
    return { ok: false, reden: "afgewezen" };
  }

  console.error("ses-verzending mislukt", { fout: naam, status: status ?? "netwerk" });

  if (TIJDELIJK.has(naam) || serverfout) return { ok: false, reden: "netwerk" };
  if (AFGEWEZEN.has(naam)) return { ok: false, reden: "afgewezen" };
  // Overige fouten met een HTTP-status zijn clientfouten (bijvoorbeeld
  // AccessDenied); zonder status is het een netwerk- of DNS-fout.
  return { ok: false, reden: status !== undefined ? "afgewezen" : "netwerk" };
}
