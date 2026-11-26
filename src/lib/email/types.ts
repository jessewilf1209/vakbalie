/**
 * E-mailabstractie (mock-first zoals de LLM-laag). De
 * provider volgt `EMAIL_PROVIDER`: zonder waarde logt de mock alleen
 * metadata; productie verstuurt via Amazon SES in de EU.
 */

export interface EmailBericht {
  aan: string;
  onderwerp: string;
  html: string;
  /** Platte-tekstvariant; mailclients zijn geen browsers. */
  tekst: string;
  /**
   * Antwoordadres, als dat afwijkt van de afzender. Gebruikt bij de
   * opvolgmail: het platform verstuurt, maar een reactie van de aanvrager
   * moet bij de hovenier belanden.
   */
  replyTo?: string;
  /**
   * Weergavenaam vóór het afzenderadres ("Naam <adres>"). Het adres zelf
   * blijft altijd EMAIL_FROM; alleen het label verschilt per tenant.
   */
  afzenderNaam?: string;
}

export interface EmailResultaat {
  ok: boolean;
  /**
   * Waarom het misging, zodat de aanroeper een bruikbare melding kan tonen:
   * "netwerk" is tijdelijk (opnieuw proberen helpt), "afgewezen" betekent
   * dat de mailservice het bericht of de configuratie weigert (opnieuw
   * proberen helpt niet). Nooit de foutdetails zelf: die horen in het log.
   */
  reden?: "netwerk" | "afgewezen";
}

export interface EmailProvider {
  readonly naam: string;
  verstuur(bericht: EmailBericht): Promise<EmailResultaat>;
}
