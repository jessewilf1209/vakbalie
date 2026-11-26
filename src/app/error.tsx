"use client";

import Link from "next/link";
import { body, display } from "@/lib/fonts";
import s from "./(marketing)/marketing.module.css";
import f from "./foutpagina.module.css";

/**
 * Foutpagina voor onverwachte fouten bij het renderen. Toont nooit details
 * van de fout zelf: fouten uit Server Components komen hier alleen met een
 * `digest` aan (een id die ook in de serverlogs van Vercel staat). Die id
 * tonen we, zodat een klant hem bij een supportvraag kan doorgeven.
 */
export default function Foutpagina({ error, retry }: { error: unknown; retry: () => void }) {
  const digest =
    typeof error === "object" && error !== null && "digest" in error
      ? String((error as { digest?: unknown }).digest ?? "")
      : "";

  return (
    <div className={`${display.variable} ${body.variable} ${s.site}`}>
      <main id="main-content" className={s.main}>
        <section className={`${s.container} ${s.grid} ${f.wrap}`}>
          <div className={f.inhoud}>
            <h1 className={s.h1}>Er ging iets mis</h1>
            <p className={f.lead}>
              Dit ligt aan ons, niet aan jou. Probeer het opnieuw. Blijft het misgaan, laat het ons
              dan weten.
            </p>
            <div className={f.acties}>
              <button type="button" onClick={() => retry()} className={`${s.btn} ${s.btnPrimary}`}>
                Opnieuw proberen
              </button>
              <Link href="/" className={`${s.btn} ${s.btnSecondary}`}>
                Naar de homepage
              </Link>
            </div>
            {digest && <p className={f.code}>Foutcode: {digest}</p>}
          </div>
        </section>
      </main>
    </div>
  );
}
