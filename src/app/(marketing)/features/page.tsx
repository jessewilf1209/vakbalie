import type { Metadata } from "next";
import { paginaMetadata } from "../_components/pagina-metadata";
import Image from "next/image";
import Link from "next/link";
import s from "../marketing.module.css";
import f from "./features.module.css";
import { FEATURES } from "../_components/content";

export const metadata: Metadata = paginaMetadata({
  pad: "/features",
  titel: "Functies: AI-intake, leadscore en dashboard",
  beschrijving:
    "Van AI-intakegesprek en leadscore tot foto-upload, e-mailnotificatie, dashboard en twee insluitmodi: alle functies van Vakbalie op een rij.",
});

/** Anker voor de inhoudsopgave, afgeleid van de bestaande featurenaam. */
function anker(titel: string): string {
  return titel
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export default function FeaturesPage() {
  return (
    <>
      <section className={`${s.container} ${s.grid} ${s.pageHead}`}>
        <div className={s.content}>
          <h1 className={s.h1}>Alles om meer en betere aanvragen binnen te halen</h1>
          <p className={s.lede}>
            Elke functie is gebouwd rond één doel: jou completere leads opleveren, met zo min
            mogelijk gedoe, en met privacy en veiligheid als uitgangspunt.
          </p>

          <ul className={f.toc}>
            {FEATURES.map((feature) => (
              <li key={feature.titel}>
                <a href={`#${anker(feature.titel)}`} className={f.tocLink}>
                  {feature.titel}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <div>
        {FEATURES.map((feature) => (
          <section
            key={feature.titel}
            id={anker(feature.titel)}
            className={`${s.section} ${s.ruleTop} ${f.feature}`}
          >
            <div className={`${s.container} ${f.row}`}>
              <div className={f.copy}>
                <h2 className={f.title}>{feature.titel}</h2>
                <p className={f.text}>{feature.lang}</p>
                <ul className={f.points}>
                  {feature.punten.map((punt) => (
                    <li key={punt} className={f.point}>
                      {punt}
                    </li>
                  ))}
                </ul>
              </div>

              <div className={f.visual}>
                {feature.screenshot ? (
                  <Image
                    className={f.shot}
                    src={feature.screenshot.src}
                    alt={feature.screenshot.alt}
                    width={600}
                    height={480}
                    sizes="(max-width: 820px) 100vw, 50vw"
                  />
                ) : (
                  <span className={f.visualLabel}>{feature.titel}</span>
                )}
              </div>
            </div>
          </section>
        ))}
      </div>

      <section className={s.band}>
        <div className={`${s.container} ${s.grid} ${s.bandGrid}`}>
          <div className={s.bandBody}>
            <h2 className={s.bandTitle}>Benieuwd hoe dat voelt?</h2>
            <p className={s.bandText}>Praat zelf met de assistent in de live demo.</p>
          </div>
          <div className={s.bandActions}>
            <Link href="/demo" className={`${s.btn} ${s.btnPrimary} ${s.btnLarge}`}>
              Start de live demo <span className={s.btnArrow}>→</span>
            </Link>
            <Link href="/prijzen" className={`${s.btn} ${s.btnSecondary} ${s.btnLarge}`}>
              Bekijk de prijzen
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
