import { getAwsConfig, getAwsCredentialProvider } from "@/lib/config/aws";
import { EMAIL_PROVIDERS, isProductie, nietEuEmailToegestaan } from "@/lib/config/env";
import { SesEmailProvider } from "./ses";
import type { EmailBericht, EmailProvider, EmailResultaat } from "./types";

export type { EmailBericht, EmailProvider, EmailResultaat } from "./types";
export { bouwAfzender } from "./afzender";
export { SesEmailProvider } from "./ses";

/**
 * Mock-provider: geen netwerk, logt alléén metadata (nooit inhoud of
 * adressen — AVG). Houdt het laatste bericht vast voor tests/dev-inspectie.
 */
export class MockEmailProvider implements EmailProvider {
  readonly naam = "mock";
  laatsteBericht: EmailBericht | null = null;

  async verstuur(bericht: EmailBericht): Promise<EmailResultaat> {
    this.laatsteBericht = bericht;
    console.info("mock-mail verstuurd", { onderwerpLengte: bericht.onderwerp.length });
    return { ok: true };
  }
}

/**
 * Staat in voor een geweigerde configuratie. Verstuurt nooit iets en meldt
 * dat luid in het log, zonder de aanroeper te laten crashen: die krijgt een
 * gewoon "afgewezen" terug en handelt dat af zoals elke mislukte verzending
 * (de leadnotificatie draait bijvoorbeeld haar claim terug).
 */
export class GeweigerdeEmailProvider implements EmailProvider {
  readonly naam = "geweigerd";

  constructor(private readonly reden: string) {}

  async verstuur(): Promise<EmailResultaat> {
    console.error("e-mail niet verstuurd: configuratie geweigerd", { reden: this.reden });
    return { ok: false, reden: "afgewezen" };
  }
}

type EmailProviderNaam = (typeof EMAIL_PROVIDERS)[number];

/** De enige provider die mailinhoud binnen de EU houdt. */
const EU_PROVIDER: EmailProviderNaam = "ses";

let cached: EmailProvider | null = null;

function kiesEmailProvider(): EmailProvider {
  const keuze = process.env.EMAIL_PROVIDER?.trim() || "mock";
  if (!(EMAIL_PROVIDERS as readonly string[]).includes(keuze)) {
    return new GeweigerdeEmailProvider(
      `EMAIL_PROVIDER moet een van ${EMAIL_PROVIDERS.join(", ")} zijn`,
    );
  }

  if (isProductie()) {
    // Met een catch-all gaat alle mail naar één testadres in plaats van naar
    // de vakman: in productie is dat een datalek én een gemiste aanvraag.
    if (process.env.EMAIL_CATCH_ALL?.trim()) {
      return new GeweigerdeEmailProvider("EMAIL_CATCH_ALL mag in productie niet bestaan");
    }
    if (keuze !== EU_PROVIDER && !nietEuEmailToegestaan()) {
      return new GeweigerdeEmailProvider(
        `EMAIL_PROVIDER moet in productie ${EU_PROVIDER} zijn (EU-residentie)`,
      );
    }
  }

  if (keuze === "mock") return new MockEmailProvider();

  const afzender = process.env.EMAIL_FROM?.trim();
  if (!afzender) {
    return new GeweigerdeEmailProvider(`EMAIL_FROM ontbreekt, vereist bij EMAIL_PROVIDER=${keuze}`);
  }

  try {
    const config = getAwsConfig();
    return new SesEmailProvider({
      regio: config.regio,
      afzender,
      configuratieSet: config.sesConfiguratieSet,
      credentialProvider: getAwsCredentialProvider(),
    });
  } catch (fout) {
    // AwsConfigFout noemt alleen variabelenamen, dus veilig om te loggen.
    return new GeweigerdeEmailProvider(fout instanceof Error ? fout.message : "AWS-configuratie");
  }
}

/**
 * Geeft de actieve e-mailprovider. De keuze is expliciet via
 * `EMAIL_PROVIDER`: leeg of `mock` (geen echte mails), `ses` (productie,
 * Amazon SES in de EU).
 *
 * Residentie-slot: in productie is alleen `ses` toegestaan, tenzij
 * `ALLOW_NON_EU_EMAIL=true` staat. Een geweigerde configuratie gooit geen
 * fout maar levert een provider op die niets verstuurt en dat luid logt.
 */
export function getEmailProvider(): EmailProvider {
  if (!cached) cached = kiesEmailProvider();
  return cached;
}

/** Alleen voor tests. */
export function resetEmailProviderForTests(): void {
  cached = null;
}
