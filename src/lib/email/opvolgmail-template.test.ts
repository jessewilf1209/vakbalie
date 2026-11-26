import { describe, expect, it } from "vitest";
import { bouwAfzender } from "./index";
import { bouwOpvolgmail } from "./opvolgmail-template";

/**
 * De opvolgmail gaat naar een derde en bevat AI-tekst die de vakman heeft
 * kunnen bewerken: beide zijn onvertrouwde invoer voor de template
 *. Getest wordt dat er niets onbewerkt in HTML of headers komt.
 */

const BASIS = {
  bedrijfsnaam: "Groen & Co",
  onderwerp: "Je offerteaanvraag",
  tekst: "Hallo Jan,\n\nBedankt voor je aanvraag.\n\nMet vriendelijke groet,\nGroen & Co",
  replyTo: "info@groenco.test",
  aan: "jan@voorbeeld.nl",
};

describe("bouwOpvolgmail", () => {
  it("escapet HTML uit de berichttekst", () => {
    const mail = bouwOpvolgmail({
      ...BASIS,
      tekst: "Hallo <script>alert(1)</script> en <b>vet</b>",
    });

    expect(mail.html).not.toContain("<script>");
    expect(mail.html).not.toContain("<b>vet</b>");
    expect(mail.html).toContain("&lt;script&gt;");
  });

  it("escapet ook de ampersand in een bedrijfsnaam in de tekst", () => {
    const mail = bouwOpvolgmail({ ...BASIS, tekst: "Groeten van Groen & Co" });
    expect(mail.html).toContain("Groen &amp; Co");
  });

  it("strijkt newlines uit het onderwerp (header-injectie)", () => {
    const mail = bouwOpvolgmail({
      ...BASIS,
      onderwerp: "Aanvraag\r\nBcc: stiekem@aanvaller.test",
    });

    expect(mail.onderwerp).not.toMatch(/[\r\n]/);
    expect(mail.onderwerp).toContain("Bcc: stiekem@aanvaller.test");
  });

  it("zet reply-to op het adres van de hovenier", () => {
    const mail = bouwOpvolgmail(BASIS);
    expect(mail.replyTo).toBe("info@groenco.test");
  });

  it("gebruikt de bedrijfsnaam als afzenderlabel zonder em-dash", () => {
    const mail = bouwOpvolgmail(BASIS);
    expect(mail.afzenderNaam).toBe("Groen & Co - offerteaanvraag");
    expect(mail.afzenderNaam).not.toMatch(/[—–]/);
  });

  it("behoudt alinea-indeling en enkele regeleindes", () => {
    const mail = bouwOpvolgmail(BASIS);
    // Drie alinea's: aanhef, dankwoord, ondertekening.
    expect(mail.html.match(/<p style/g)?.length).toBe(3);
    // Regeleinde binnen de ondertekening blijft staan.
    expect(mail.html).toContain("Met vriendelijke groet,<br />Groen &amp; Co");
  });

  it("stuurt de platte tekst onbewerkt mee voor mailclients zonder HTML", () => {
    const mail = bouwOpvolgmail(BASIS);
    expect(mail.tekst).toBe(BASIS.tekst);
  });
});

describe("bouwAfzender", () => {
  it("zet de weergavenaam gequote vóór het adres", () => {
    expect(bouwAfzender("noreply@platform.test", "Groen & Co - offerteaanvraag")).toBe(
      '"Groen & Co - offerteaanvraag" <noreply@platform.test>',
    );
  });

  it("houdt een komma binnen de quotes (anders leest het als twee adressen)", () => {
    expect(bouwAfzender("a@b.test", "Groen, Co en Zonen")).toBe('"Groen, Co en Zonen" <a@b.test>');
  });

  it("strijkt newlines uit de naam (header-injectie via bedrijfsnaam)", () => {
    const from = bouwAfzender("noreply@platform.test", "Kwaad\r\nBcc: stiekem@aanvaller.test");
    expect(from).not.toMatch(/[\r\n]/);
  });

  it("verwijdert punthaken, quotes en backslashes die de header kunnen breken", () => {
    expect(bouwAfzender("a@b.test", 'Kwaad <x@y.test> "test" \\')).toBe(
      '"Kwaad x@y.test test" <a@b.test>',
    );
  });

  it("valt terug op het kale adres zonder naam", () => {
    expect(bouwAfzender("a@b.test")).toBe("a@b.test");
    expect(bouwAfzender("a@b.test", "   ")).toBe("a@b.test");
  });

  it("laat een adres met bestaande weergavenaam ongemoeid", () => {
    expect(bouwAfzender("Platform <a@b.test>", "Groen & Co")).toBe("Platform <a@b.test>");
  });
});
