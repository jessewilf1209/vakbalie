"use client";

import { useState } from "react";
import { genereerOpvolgActie, verstuurOpvolgmailActie } from "../../acties";
import { MAX_INSTRUCTIE_TEKENS, type OpvolgVoorstel } from "@/lib/opvolgen/generatie";
import s from "../../../../dashboard.module.css";

/**
 * Concept-en-verstuur-flow voor de AI-opvolging.
 *
 * Bewuste afwijking van het "geen client-JS"-patroon elders in het
 * dashboard: het concept moet bewerkbaar zijn vóórdat het verstuurd wordt,
 * zonder dat het tussentijds in de database staat. Het concept leeft
 * daarom alleen in React-state, nooit in localStorage of de database.
 *
 * Alle autorisatie, validatie en verzending gebeuren server-side; dit
 * component is een formulier, geen beveiligingslaag.
 */

interface Props {
  leadId: string;
  /** Null als de aanvrager geen e-mailadres achterliet: dan een belscript. */
  contactEmail: string | null;
  contactTelefoon: string | null;
}

type Status =
  | { fase: "leeg" }
  | { fase: "bezig" }
  | { fase: "concept"; voorstel: OpvolgVoorstel }
  | { fase: "verstuurd"; statusGewijzigd: boolean };

export function OpvolgFormulier({ leadId, contactEmail, contactTelefoon }: Props) {
  const [status, setStatus] = useState<Status>({ fase: "leeg" });
  const [instructie, setInstructie] = useState("");
  const [onderwerp, setOnderwerp] = useState("");
  const [tekst, setTekst] = useState("");
  const [fout, setFout] = useState<string | null>(null);
  const [verstuurBezig, setVerstuurBezig] = useState(false);

  const kanMailen = contactEmail !== null;

  async function genereer() {
    setFout(null);
    setStatus({ fase: "bezig" });
    const resultaat = await genereerOpvolgActie({
      leadId,
      instructie: instructie.trim() || undefined,
    });

    if (!resultaat.ok) {
      setFout(resultaat.fout);
      setStatus({ fase: "leeg" });
      return;
    }
    if (resultaat.waarde.soort === "mail") {
      setOnderwerp(resultaat.waarde.onderwerp);
      setTekst(resultaat.waarde.tekst);
    }
    setStatus({ fase: "concept", voorstel: resultaat.waarde });
  }

  async function verstuur() {
    setFout(null);
    setVerstuurBezig(true);
    const resultaat = await verstuurOpvolgmailActie({ leadId, onderwerp, tekst });
    setVerstuurBezig(false);

    if (!resultaat.ok) {
      setFout(resultaat.fout);
      return;
    }
    setStatus({ fase: "verstuurd", statusGewijzigd: resultaat.waarde.statusGewijzigd });
  }

  if (status.fase === "verstuurd") {
    return (
      <div className={s.opvolg}>
        <p className={s.melding}>
          De mail is verstuurd naar {contactEmail}.
          {status.statusGewijzigd && " De status staat nu op Benaderd."}
        </p>
        <div className={s.opvolgKnoppen}>
          <button
            type="button"
            className={s.knopSecundair}
            onClick={() => {
              setStatus({ fase: "leeg" });
              setInstructie("");
              setOnderwerp("");
              setTekst("");
            }}
          >
            Nog een bericht opstellen
          </button>
        </div>
      </div>
    );
  }

  const bezig = status.fase === "bezig";
  const knopTekst = bezig
    ? "Bezig met opstellen…"
    : status.fase === "concept"
      ? "Opnieuw genereren"
      : kanMailen
        ? "Genereer voorstel"
        : "Genereer belscript";

  return (
    <div className={s.opvolg}>
      <p className={s.opvolgUitleg}>
        {kanMailen ? (
          <>
            Stel een opvolgmail op voor {contactEmail}. Je leest en bewerkt het voorstel voordat er
            iets verstuurd wordt.
          </>
        ) : (
          <>
            Deze aanvrager liet geen e-mailadres achter
            {contactTelefoon ? `, alleen een telefoonnummer (${contactTelefoon})` : ""}. Hieronder
            maak je een belscript dat je tijdens het gesprek kunt volgen.
          </>
        )}
      </p>

      <label htmlFor="instructie" className={s.label}>
        Wat wil je laten weten? (optioneel)
      </label>
      <textarea
        id="instructie"
        className={s.veld}
        rows={2}
        maxLength={MAX_INSTRUCTIE_TEKENS}
        value={instructie}
        onChange={(e) => setInstructie(e.target.value)}
        placeholder="bv. kan volgende week dinsdag langskomen, richtprijs rond de 4000 euro"
        disabled={bezig}
      />
      <p className={s.opvolgTeller}>
        {instructie.length} / {MAX_INSTRUCTIE_TEKENS}
      </p>

      <div className={s.opvolgKnoppen}>
        <button type="button" className={s.knopSecundair} onClick={genereer} disabled={bezig}>
          {knopTekst}
        </button>
      </div>

      {fout && <p className={s.foutmelding}>{fout}</p>}

      {status.fase === "concept" && status.voorstel.soort === "belscript" && (
        <div className={s.opvolgConcept}>
          <p className={s.opvolgConceptKop}>Belscript</p>
          <div className={s.opvolgScript}>
            <section className={s.opvolgScriptBlok}>
              <h3 className={s.opvolgScriptLabel}>Opening</h3>
              <p className={s.opvolgScriptTekst}>{status.voorstel.opening}</p>
            </section>
            <section className={s.opvolgScriptBlok}>
              <h3 className={s.opvolgScriptLabel}>Bespreken</h3>
              <ul className={s.redenen}>
                {status.voorstel.punten.map((punt) => (
                  <li key={punt}>{punt}</li>
                ))}
              </ul>
            </section>
            <section className={s.opvolgScriptBlok}>
              <h3 className={s.opvolgScriptLabel}>Afsluiten</h3>
              <p className={s.opvolgScriptTekst}>{status.voorstel.afsluiting}</p>
            </section>
          </div>
        </div>
      )}

      {status.fase === "concept" && status.voorstel.soort === "mail" && (
        <div className={s.opvolgConcept}>
          <p className={s.opvolgConceptKop}>
            Concept. Er gaat pas iets weg als je op Versturen klikt.
          </p>

          <label htmlFor="onderwerp" className={s.label}>
            Onderwerp
          </label>
          <input
            id="onderwerp"
            type="text"
            className={s.veld}
            maxLength={150}
            value={onderwerp}
            onChange={(e) => setOnderwerp(e.target.value)}
          />

          <label htmlFor="tekst" className={s.label} style={{ marginTop: "0.8rem" }}>
            Bericht
          </label>
          <textarea
            id="tekst"
            className={s.veld}
            rows={12}
            maxLength={2000}
            value={tekst}
            onChange={(e) => setTekst(e.target.value)}
          />

          <div className={s.opvolgKnoppen}>
            <button
              type="button"
              className={s.knopPrimair}
              onClick={verstuur}
              disabled={verstuurBezig || onderwerp.trim() === "" || tekst.trim() === ""}
            >
              {verstuurBezig ? "Versturen…" : "Versturen"}
            </button>
            <span className={s.opvolgTeller} style={{ textAlign: "left" }}>
              naar {contactEmail}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
