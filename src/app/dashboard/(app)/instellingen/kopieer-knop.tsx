"use client";

import { useState } from "react";
import s from "../../dashboard.module.css";

/** Kopieert de embed-snippet naar het klembord (enige client-JS op deze pagina). */
export function KopieerKnop({ tekst }: { tekst: string }) {
  const [gekopieerd, setGekopieerd] = useState(false);

  return (
    <button
      type="button"
      className={s.knopSecundair}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(tekst);
          setGekopieerd(true);
          setTimeout(() => setGekopieerd(false), 2000);
        } catch {
          // Klembord geweigerd (permissies): de gebruiker kan handmatig selecteren.
        }
      }}
    >
      {gekopieerd ? "Gekopieerd ✓" : "Kopieer snippet"}
    </button>
  );
}
