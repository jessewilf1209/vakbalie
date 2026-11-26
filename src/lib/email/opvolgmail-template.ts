import { escapeHtml, veiligOnderwerp } from "./nieuwe-lead-template";
import type { EmailBericht } from "./types";

/**
 * Opvolgmail aan de aanvrager.
 *
 * In tegenstelling tot de leadnotificatie gaat deze mail naar een derde,
 * niet naar de hovenier zelf. De inhoud is AI-gegenereerd en daarna
 * mogelijk door de vakman bewerkt: beide zijn onvertrouwde invoer voor de
 * template. Alles wordt geëscaped; er staat bewust geen enkele
 * onbewerkte string in de HTML.
 *
 * Sober van opzet: dit moet lezen als een mail van de hovenier, niet als
 * een platformnieuwsbrief. Daarom geen logo's, knoppen of merkkleuren.
 */

/**
 * Label vóór het afzenderadres. Bewust één constante: hier één keer
 * wijzigen verandert wat elke ontvanger in zijn inbox ziet staan.
 * Geen em-dash, ook niet in een afzendernaam.
 */
export const AFZENDER_SUFFIX = "offerteaanvraag";

export interface OpvolgmailInput {
  bedrijfsnaam: string;
  onderwerp: string;
  /** Platte tekst met regeleindes, zoals de vakman hem heeft goedgekeurd. */
  tekst: string;
  /** Adres waar een reactie van de aanvrager moet belanden. */
  replyTo: string;
  aan: string;
}

export function bouwOpvolgmail(input: OpvolgmailInput): EmailBericht {
  const alineas = input.tekst
    .split(/\n{2,}/)
    .map((blok) => blok.trim())
    .filter((blok) => blok.length > 0)
    // Enkele regeleindes binnen een alinea blijven behouden (ondertekening).
    .map((blok) => escapeHtml(blok).replace(/\n/g, "<br />"))
    .map((blok) => `<p style="margin:0 0 14px;line-height:1.55;">${blok}</p>`)
    .join("\n    ");

  const html = `<!doctype html>
<html lang="nl"><body style="margin:0;padding:24px;background:#f5f5f4;font-family:Arial,Helvetica,sans-serif;color:#222;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;padding:24px;font-size:15px;">
    ${alineas}
  </div>
</body></html>`;

  return {
    aan: input.aan,
    onderwerp: veiligOnderwerp(input.onderwerp),
    html,
    tekst: input.tekst,
    replyTo: input.replyTo,
    afzenderNaam: `${input.bedrijfsnaam} - ${AFZENDER_SUFFIX}`,
  };
}
