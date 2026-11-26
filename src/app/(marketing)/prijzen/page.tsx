import type { Metadata } from "next";
import { paginaMetadata } from "../_components/pagina-metadata";
import Link from "next/link";
import s from "../marketing.module.css";
import p from "./prijzen.module.css";
import { BTW_VERMELDING, PAKKETTEN, SITE, STAFFEL } from "../_components/site-config";

export const metadata: Metadata = paginaMetadata({
  pad: "/prijzen",
  titel: "Prijzen: AI-offerteassistent vanaf €99 per maand",
  beschrijving:
    "Eén vast bedrag per maand. Start €99, Pro €199 en Premium €399, met een eerlijke staffel voor extra gesprekken. Geen verrassingen.",
});

const FAQ = [
  {
    vraag: "Wat telt als één gesprek?",
    antwoord:
      "Een gesprek is één intakesessie van een bezoeker met de assistent, van het openen van de chat tot het afronden. Of er nu twee of twintig berichten worden gewisseld: het telt als één gesprek. Zo blijft het meetbaar en eerlijk.",
  },
  {
    vraag: "Wat als ik over mijn gesprekken heen ga?",
    antwoord: STAFFEL,
  },
  {
    vraag: "Zit ik ergens aan vast?",
    antwoord:
      "Nee. De pakketten zijn per maand. Je kunt op- of afschalen wanneer je drukte of seizoen daarom vraagt.",
  },
  {
    vraag: "Zijn de prijzen inclusief btw?",
    antwoord: `Nee, alle genoemde prijzen zijn ${BTW_VERMELDING}. Je ontvangt elke maand een factuur.`,
  },
  {
    vraag: "Hoe nauwkeurig is de AI, en wat als hij iets verkeerd begrijpt?",
    antwoord:
      "De assistent vat samen wat de bezoeker zelf vertelt. Aan het eind ziet de bezoeker die samenvatting en bevestigt of verbetert hij hem; pas daarna komt de aanvraag bij jou binnen. In je dashboard staat het volledige gesprek, zodat je altijd kunt nalezen wat er echt gezegd is. Een AI kan zich vergissen: gebruik de samenvatting en de leadscore als hulpmiddel, niet als eindoordeel.",
  },
  {
    vraag: "Noemt de assistent prijzen of doet hij beloftes namens mij?",
    antwoord:
      "Nee. De assistent is zo ingesteld dat hij alleen de informatie voor je offerte verzamelt: wat er moet gebeuren, waar, wanneer en een budgetindicatie. Prijzen, planning en afspraken maak je zelf.",
  },
  {
    vraag: "Weten mijn klanten dat ze met een AI praten?",
    antwoord:
      "Ja. Boven elk gesprek staat dat de bezoeker met een AI-assistent praat en niet met een mens. Dat is sinds augustus 2026 ook verplicht onder de Europese AI-verordening.",
  },
  {
    vraag: "Wat gebeurt er met de gegevens van mijn klanten?",
    antwoord:
      "Aanvragen, gesprekken en foto's worden opgeslagen in de EU. Data van verschillende bedrijven is strikt van elkaar gescheiden. Aanvragen worden na 24 maanden automatisch verwijderd, en je kunt een aanvraag ook zelf direct verwijderen. Vóór de start sluiten we samen een verwerkersovereenkomst.",
  },
  {
    vraag: "Hoe zeg ik op, en wat gebeurt er dan met mijn gegevens?",
    antwoord:
      "Je kunt per maand opzeggen met een e-mail. Na het opzeggen verwijderen we de aanvragen, gesprekken en foto's van jouw bedrijf. De precieze termijn staat in de verwerkersovereenkomst.",
  },
  {
    vraag: "Werkt het op mijn bestaande website?",
    antwoord:
      "Ja. Je sluit de assistent in met één code-snippet, als zwevende chatbubble of als chatvenster midden in een pagina. Geen verbouwing van je site nodig.",
  },
  {
    vraag: "Hoe krijg ik hulp als er iets niet werkt?",
    antwoord: `Mail naar ${SITE.email}. Je krijgt antwoord van de mensen die Vakbalie bouwen, niet van een callcenter.`,
  },
];

/**
 * FAQPage-structured data (schema.org) voor zoekmachines. Gebouwd uit
 * dezelfde lijst als de zichtbare FAQ, zodat ze nooit uit elkaar lopen.
 * `<` wordt ge-escaped zodat de tekst het script-element niet kan sluiten.
 */
const FAQ_JSON_LD = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ.map((item) => ({
    "@type": "Question",
    name: item.vraag,
    acceptedAnswer: { "@type": "Answer", text: item.antwoord },
  })),
}).replace(/</g, "\\u003c");

export default function PrijzenPage() {
  return (
    <>
      <section className={`${s.container} ${s.grid} ${s.pageHead}`}>
        <div className={s.content}>
          <h1 className={s.h1}>Eén vast bedrag per maand, geen verrassingen</h1>
          <p className={s.lede}>
            Kies het pakket dat bij je drukte past. Elk pakket bevat de volledige assistent, je
            betaalt alleen voor het aantal gesprekken.
          </p>
        </div>
      </section>

      <section className={`${s.container} ${p.plans}`}>
        <div className={p.grid}>
          {PAKKETTEN.map((pakket) => (
            <div
              key={pakket.naam}
              className={`${p.plan} ${pakket.uitgelicht ? p.planFeatured : ""}`}
            >
              {/* "Meest gekozen" staat in de DOM vóór de naam (zoals voorheen), visueel erna. */}
              <div className={p.planHead}>
                {pakket.uitgelicht && <span className={p.ribbon}>Meest gekozen</span>}
                <div className={p.planName}>{pakket.naam}</div>
              </div>
              <div className={p.planPrice}>{pakket.prijs}</div>
              <div className={p.planPeriod}>{pakket.periode}</div>
              <div className={p.planIncluded}>{pakket.inbegrepen}</div>
              <p className={p.planDesc}>{pakket.beschrijving}</p>
              <ul className={p.planPoints}>
                {pakket.punten.map((punt) => (
                  <li key={punt} className={p.planPoint}>
                    {punt}
                  </li>
                ))}
              </ul>
              <Link
                href="/contact"
                className={`${s.btn} ${pakket.uitgelicht ? s.btnPrimary : s.btnSecondary} ${p.planCta}`}
              >
                Vraag dit pakket aan
              </Link>
            </div>
          ))}
        </div>

        <p className={p.staffel}>{STAFFEL}</p>
      </section>

      <section className={`${s.section} ${s.ruleTop}`}>
        <div className={`${s.container} ${s.grid}`}>
          <div className={s.content}>
            <h2 className={s.h2}>Goed om te weten</h2>
            <script
              type="application/ld+json"
              // Statische, eigen tekst (geen invoer van gebruikers), met < ge-escaped.
              dangerouslySetInnerHTML={{ __html: FAQ_JSON_LD }}
            />

            <div className={p.faq}>
              {FAQ.map((item) => (
                <details key={item.vraag} className={p.faqItem}>
                  <summary>{item.vraag}</summary>
                  <p className={p.faqAnswer}>{item.antwoord}</p>
                </details>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className={s.band}>
        <div className={`${s.container} ${s.grid} ${s.bandGrid}`}>
          <div className={s.bandBody}>
            <h2 className={s.bandTitle}>Klaar om te starten?</h2>
            <p className={s.bandText}>
              Probeer eerst de live demo, of neem direct contact op voor een pilot.
            </p>
          </div>
          <div className={s.bandActions}>
            <Link href="/demo" className={`${s.btn} ${s.btnPrimary} ${s.btnLarge}`}>
              Start de live demo <span className={s.btnArrow}>→</span>
            </Link>
            <Link href="/contact" className={`${s.btn} ${s.btnSecondary} ${s.btnLarge}`}>
              Neem contact op
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
