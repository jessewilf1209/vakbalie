import type { Metadata } from "next";
import { paginaMetadata } from "../_components/pagina-metadata";
import s from "../marketing.module.css";
import p from "./privacy.module.css";

export const metadata: Metadata = paginaMetadata({
  pad: "/privacy",
  titel: "Privacyverklaring: zo gaan we om met gegevens",
  beschrijving:
    "Lees hoe Vakbalie omgaat met persoonsgegevens: welke gegevens de chatassistent verwerkt, waarvoor, hoe lang we ze bewaren en welke rechten je hebt.",
});

export default function PrivacyPagina() {
  return (
    <section className={`${s.container} ${p.wrap}`}>
      <div className={s.grid}>
        <div className={p.body}>
          <h1 className={s.h1}>Privacyverklaring</h1>

          <div className={p.prose}>
            <p className={p.notice}>
              <strong>Let op: dit is een voorlopige versie.</strong> Vóór de eerste echte pilot
              wordt deze verklaring vervangen door een juridisch kloppende tekst.
            </p>

            <p>
              Via de chat-assistent verzamelen we de gegevens die je zelf invult om je
              offerte-aanvraag door te sturen naar het bedrijf waarmee je chat: je naam,
              e-mailadres, eventueel telefoonnummer, woonplaats, projectwensen en eventuele
              foto&apos;s.
            </p>

            <h2>Wat we doen met je gegevens</h2>
            <ul>
              <li>Contactgegevens vragen we pas na jouw expliciete toestemming.</li>
              <li>Locatiegegevens (GPS) worden uit foto&apos;s verwijderd vóór opslag.</li>
              <li>Alle gegevens worden binnen de EU opgeslagen.</li>
              <li>Gegevens worden maximaal 24 maanden bewaard en daarna verwijderd.</li>
              <li>
                Wil je je gegevens laten verwijderen? Neem contact op met het bedrijf waar je de
                aanvraag deed.
              </li>
            </ul>

            <h2>Praten met een AI</h2>
            <p>
              De assistent is een AI. Dat melden we ook in de chat zelf. Je gesprek wordt gebruikt
              om je aanvraag samen te stellen en door te geven aan het betreffende bedrijf.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
