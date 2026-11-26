import type { Metadata } from "next";
import Link from "next/link";
import MarketingLayout from "./(marketing)/layout";
import s from "./(marketing)/marketing.module.css";
import f from "./foutpagina.module.css";

export const metadata: Metadata = {
  title: "Pagina niet gevonden",
};

/**
 * Eigen 404 voor onbekende URL's en voor notFound() in routes zonder eigen
 * not-found. Next.js geeft hierbij een echte HTTP 404 (geen soft 404). De
 * tekst verraadt bewust niet of een pagina wel bestaat maar afgeschermd is
 * (bijvoorbeeld /admin voor niet-beheerders). Next.js zet zelf noindex.
 */
export default function NietGevonden() {
  return (
    <MarketingLayout>
      <section className={`${s.container} ${s.grid} ${f.wrap}`}>
        <div className={f.inhoud}>
          <h1 className={s.h1}>Deze pagina bestaat niet</h1>
          <p className={f.lead}>
            De link is misschien verouderd, of er zit een typefout in het adres. Via de knoppen
            hieronder kom je weer verder.
          </p>
          <div className={f.acties}>
            <Link href="/" className={`${s.btn} ${s.btnPrimary}`}>
              Naar de homepage
            </Link>
            <Link href="/demo" className={`${s.btn} ${s.btnSecondary}`}>
              Probeer de demo
            </Link>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
