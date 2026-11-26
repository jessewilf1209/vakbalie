"use client";

import { startTransition, useActionState } from "react";
import type { BeheerStaat } from "../(beveiligd)/klanten/beheer-acties";
import s from "../../dashboard/dashboard.module.css";
import a from "../admin.module.css";

type Actie = (staat: BeheerStaat, formData: FormData) => Promise<BeheerStaat>;

/**
 * Formulier voor een beheeractie, met de uitkomst eronder. De velden komen
 * als children van de server; alleen de afhandeling draait in de browser.
 * Meldingen zijn platte tekst (React escapet), nooit HTML.
 */
export function BeheerFormulier({
  actie,
  knop,
  knopKlasse,
  uitgeschakeld = false,
  children,
}: {
  actie: Actie;
  knop: string;
  knopKlasse?: string;
  uitgeschakeld?: boolean;
  children: React.ReactNode;
}) {
  const [staat, verstuur, bezig] = useActionState(actie, { status: "leeg" } as BeheerStaat);

  // Bewust onSubmit in plaats van action={...}: React zet een formulier met
  // een action na elke verzending terug naar de beginwaarden, en dan is bij
  // een validatiefout alle invoer weg.
  function bijVerzenden(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(() => verstuur(formData));
  }

  return (
    <form onSubmit={bijVerzenden} className={a.beheerFormulier}>
      {children}
      <button
        type="submit"
        className={knopKlasse ?? s.knopPrimair}
        disabled={bezig || uitgeschakeld}
      >
        {bezig ? "Bezig…" : knop}
      </button>
      <div aria-live="polite">
        {staat.status === "fout" && (
          <ul className={s.foutmelding}>
            {staat.meldingen.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        )}
        {staat.status === "ok" && (
          <>
            <p className={s.melding}>{staat.melding}</p>
            {staat.waarschuwingen?.map((w) => (
              <p key={w} className={a.waarschuwing}>
                Let op: {w}
              </p>
            ))}
          </>
        )}
      </div>
    </form>
  );
}
