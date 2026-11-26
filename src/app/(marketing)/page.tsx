import type { Metadata } from "next";
import { paginaMetadata } from "./_components/pagina-metadata";
import Link from "next/link";
import s from "./marketing.module.css";
import h from "./home.module.css";
import { ChatPreview } from "./_components/chat-preview";
import { FEATURES, SECURITY, STAPPEN } from "./_components/content";
import { PAKKETTEN } from "./_components/site-config";

export const metadata: Metadata = paginaMetadata({
  pad: "/",
  titel: "Vakbalie: AI-offerteassistent voor hoveniers en vakbedrijven",
  beschrijving:
    "Vakbalie maakt van websitebezoekers complete offerteaanvragen. De AI-assistent stelt de juiste vragen, vat alles samen en geeft elke lead een score.",
  absoluteTitel: true,
});

export default function HomePage() {
  return (
    <>
      {/* ── Hero ───────────────────────────────────────── */}
      <section className={h.hero}>
        <div className={`${s.container} ${h.heroGrid}`}>
          <div className={h.heroText}>
            <h1 className={`${h.heroTitle} ${s.reveal}`} style={{ animationDelay: "80ms" }}>
              Maak van elke websitebezoeker een complete offerte&shy;aanvraag
            </h1>

            <p className={`${h.heroLede} ${s.reveal}`} style={{ animationDelay: "160ms" }}>
              Een slimme chatassistent op je site stelt automatisch de juiste vragen, vat alles
              netjes samen met een leadscore, en zet de aanvraag in je inbox én dashboard. Jij belt
              alleen nog de klanten die ertoe doen.
            </p>

            <div className={`${h.heroCtas} ${s.reveal}`} style={{ animationDelay: "240ms" }}>
              <Link href="/demo" className={`${s.btn} ${s.btnPrimary} ${s.btnLarge}`}>
                Probeer de live demo <span className={s.btnArrow}>→</span>
              </Link>
              <Link href="/features" className={`${s.btn} ${s.btnSecondary} ${s.btnLarge}`}>
                Bekijk de features
              </Link>
            </div>
          </div>

          <dl className={`${h.heroProof} ${s.reveal}`} style={{ animationDelay: "320ms" }}>
            <div className={h.proofItem}>
              <dt className={h.proofNum}>24/7</dt>
              <dd className={h.proofLabel}>aanvragen, ook buiten kantooruren</dd>
            </div>
            <div className={h.proofItem}>
              <dt className={h.proofNum}>1 mail</dt>
              <dd className={h.proofLabel}>per lead, compleet en gescoord</dd>
            </div>
            <div className={h.proofItem}>
              <dt className={h.proofNum}>EU</dt>
              <dd className={h.proofLabel}>alle data in de EU, AVG-proof</dd>
            </div>
          </dl>

          <div className={`${h.heroVisual} ${s.reveal}`} style={{ animationDelay: "200ms" }}>
            <span className={`${h.note} ${h.noteTop}`}>Reageert direct</span>
            <ChatPreview />
            <span className={`${h.note} ${h.noteBottom}`}>Lead opgeslagen</span>
          </div>
        </div>
      </section>

      {/* ── Features ───────────────────────────────────── */}
      <section className={`${s.section} ${s.ruleTop}`} id="features">
        <div className={`${s.container} ${s.grid}`}>
          <div className={s.content}>
            <h2 className={s.h2}>Eén assistent, van eerste vraag tot opgevolgde lead</h2>
            <p className={s.lede}>
              Elke functie is gebouwd om jou meer en betere aanvragen op te leveren, met privacy en
              veiligheid als uitgangspunt.
            </p>

            <ul className={h.featureList}>
              {FEATURES.map((f) => (
                <li key={f.titel} className={h.featureRow}>
                  <h3 className={h.featureTitle}>{f.titel}</h3>
                  <p className={h.featureText}>{f.kort}</p>
                </li>
              ))}
            </ul>

            <p className={h.more}>
              <Link href="/features" className={`${s.btn} ${s.btnGhost}`}>
                Alle features in detail <span className={s.btnArrow}>→</span>
              </Link>
            </p>
          </div>
        </div>
      </section>

      {/* ── Zo werkt het ───────────────────────────────── */}
      <section className={`${s.section} ${s.ruleTop}`}>
        <div className={`${s.container} ${s.grid}`}>
          <div className={s.content}>
            <h2 className={s.h2}>Van bezoeker naar lead in zeven stappen</h2>

            <div className={h.stepCols}>
              <ol className={h.steps}>
                {STAPPEN.slice(0, 4).map((stap) => (
                  <li key={stap.nummer} className={h.step}>
                    <span className={h.stepNum}>{stap.nummer}</span>
                    <div>
                      <h3 className={h.stepTitle}>{stap.titel}</h3>
                      <p className={h.stepText}>{stap.tekst}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <div>
                <ol className={h.steps} start={5}>
                  {STAPPEN.slice(4).map((stap) => (
                    <li key={stap.nummer} className={h.step}>
                      <span className={`${h.stepNum} ${h.stepNumClay}`}>{stap.nummer}</span>
                      <div>
                        <h3 className={h.stepTitle}>{stap.titel}</h3>
                        <p className={h.stepText}>{stap.tekst}</p>
                      </div>
                    </li>
                  ))}
                </ol>
                <p className={`${h.more} ${h.moreSteps}`}>
                  <Link href="/zo-werkt-het" className={`${s.btn} ${s.btnGhost}`}>
                    Bekijk de hele flow <span className={s.btnArrow}>→</span>
                  </Link>
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Privacy en veiligheid ──────────────────────── */}
      <section className={`${h.security} ${s.onDark}`}>
        <div className={`${s.container} ${s.grid}`}>
          <h2 className={h.securityTitle}>{SECURITY.titel}</h2>
          <p className={h.securityText}>{SECURITY.tekst}</p>
        </div>
      </section>

      {/* ── Prijsteaser ────────────────────────────────── */}
      <section className={s.section}>
        <div className={`${s.container} ${s.grid}`}>
          <div className={s.content}>
            <h2 className={s.h2}>Eén vast bedrag per maand, geen verrassingen</h2>

            <div className={h.priceTable}>
              {PAKKETTEN.map((p) => (
                <div key={p.naam} className={h.priceCol}>
                  <div className={h.priceName}>{p.naam}</div>
                  <div className={h.price}>{p.prijs}</div>
                  <div className={h.priceMeta}>
                    {p.periode} · {p.inbegrepen}
                  </div>
                </div>
              ))}
            </div>

            <p className={h.priceMore}>
              <Link href="/prijzen" className={`${s.btn} ${s.btnSecondary}`}>
                Bekijk wat er inzit
              </Link>
            </p>
          </div>
        </div>
      </section>

      {/* ── Slot-CTA ───────────────────────────────────── */}
      <section className={s.band}>
        <div className={`${s.container} ${s.grid} ${s.bandGrid}`}>
          <div className={s.bandBody}>
            <h2 className={s.bandTitle}>Zie het zelf: praat met de assistent</h2>
            <p className={s.bandText}>
              Probeer de live demo en ervaar precies wat jouw websitebezoekers straks meemaken. Geen
              account nodig.
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
