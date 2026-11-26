"use client";
import { useFormStatus } from "react-dom";

interface Props {
  className?: string;
  children: React.ReactNode;
  /** Tekst zolang het formulier verstuurd wordt, bijv. "Bezig met inloggen…". */
  bezigTekst: string;
}

/**
 * Verstuurknop voor server-action-formulieren. Tijdens het versturen is de
 * knop uitgeschakeld en meldt hij dat er iets gebeurt. Dat voorkomt dubbel
 * versturen (en daarmee onnodige tellers op de inlog- en herstelrem) en
 * laat een hovenier op een trage mobiele verbinding zien dat de klik is
 * aangekomen.
 */
export function VerstuurKnop({ className, children, bezigTekst }: Props) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending}>
      {pending ? bezigTekst : children}
    </button>
  );
}
