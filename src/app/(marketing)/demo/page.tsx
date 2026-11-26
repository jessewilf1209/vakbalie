import type { Metadata } from "next";
import { paginaMetadata } from "../_components/pagina-metadata";
import Link from "next/link";
import s from "../marketing.module.css";
import d from "./demo.module.css";
import { getDemoTenantKey } from "@/lib/widget/demo";

export const metadata: Metadata = paginaMetadata({
  pad: "/demo",
  titel: "Live demo: praat zelf met de AI-assistent",
  beschrijving:
    "Praat zelf met de AI-offerteassistent. Doorloop een echt intakegesprek en zie hoe een aanvraag wordt samengevat en gescoord. Geen account nodig.",
});

const TIPS = [
  "Begin met wat je zou willen laten doen, bijvoorbeeld een tuin laten aanleggen.",
  "Beantwoord de vragen zoals een echte klant dat zou doen.",
  "Aan het eind zie je de samenvatting met leadscore die jij als bedrijf zou ontvangen.",
];

export default function DemoPage() {
  const demoKey = getDemoTenantKey();

  return (
    <section className={`${s.container} ${d.wrap}`}>
      <div className={`${s.grid} ${d.head}`}>
        <div className={s.content}>
          <h1 className={s.h1}>Praat zelf met de assistent</h1>
          <p className={s.lede}>
            Dit is precies wat jouw websitebezoekers zouden meemaken. Probeer het gerust, er worden
            geen gegevens van jou bewaard voor deze demo.
          </p>
        </div>
      </div>

      <div className={`${s.grid} ${d.layout}`}>
        <aside className={d.aside}>
          <p className={d.tag}>Demo-omgeving</p>
          <ol className={d.tips}>
            {TIPS.map((tip, i) => (
              <li key={tip} className={d.tip}>
                <span className={d.tipNum}>{i + 1}</span>
                {tip}
              </li>
            ))}
          </ol>
          <p className={d.note}>
            Je praat met een AI-assistent. Deze demo draait in een veilige testmodus en stuurt geen
            e-mails of echte aanvragen door.
          </p>
        </aside>

        <div className={d.stage}>
          {demoKey ? (
            <iframe
              className={d.frame}
              src={`/widget/${encodeURIComponent(demoKey)}?mode=embed`}
              title="Live demo van de offerte-assistent"
              loading="lazy"
            />
          ) : (
            <div className={d.placeholder}>
              <h2 className={d.placeholderTitle}>De demo wordt binnenkort geactiveerd</h2>
              <p className={d.placeholderText}>
                We zetten de assistent klaar zodat je hem zo zelf kunt uitproberen. Wil je nu al een
                rondleiding? Neem gerust contact op.
              </p>
              <Link href="/contact" className={`${s.btn} ${s.btnPrimary} ${d.placeholderCta}`}>
                Neem contact op
              </Link>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
