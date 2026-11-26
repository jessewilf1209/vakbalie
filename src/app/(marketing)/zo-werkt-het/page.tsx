import type { Metadata } from "next";
import { paginaMetadata } from "../_components/pagina-metadata";
import Link from "next/link";
import s from "../marketing.module.css";
import t from "./flow.module.css";
import { STAPPEN } from "../_components/content";

export const metadata: Metadata = paginaMetadata({
  pad: "/zo-werkt-het",
  titel: "Zo werkt de AI-offerteassistent, in zeven stappen",
  beschrijving:
    "Van websitebezoeker tot opgevolgde lead in zeven stappen: chat, intake, samenvatting met leadscore, veilige opslag, e-mailnotificatie en je dashboard.",
});

export default function ZoWerktHetPage() {
  return (
    <>
      <section className={`${s.container} ${s.grid} ${s.pageHead}`}>
        <div className={s.content}>
          <h1 className={s.h1}>Van bezoeker naar lead in zeven stappen</h1>
          <p className={s.lede}>
            De assistent neemt het hele traject uit handen: een goed gesprek voeren, de juiste
            informatie verzamelen en alles netjes bij jou afleveren. Zo ziet dat eruit.
          </p>
        </div>
      </section>

      <div className={`${s.container} ${s.grid} ${t.flow}`}>
        {/* Groen voor 1-4 (bezoekerkant), klei voor 5-7 (jij ontvangt). */}
        <ol className={`${s.content} ${t.timeline}`}>
          {STAPPEN.map((stap) => {
            const isBusiness = stap.nummer >= 5;
            return (
              <li key={stap.nummer} className={`${t.item} ${stap.nummer === 5 ? t.itemTurn : ""}`}>
                <span className={`${t.marker} ${isBusiness ? t.markerClay : ""}`}>
                  {stap.nummer}
                </span>
                <div>
                  <h2 className={t.title}>{stap.titel}</h2>
                  <p className={t.text}>{stap.tekst}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      <section className={s.band}>
        <div className={`${s.container} ${s.grid} ${s.bandGrid}`}>
          <div className={s.bandBody}>
            <h2 className={s.bandTitle}>Liever ervaren dan lezen?</h2>
            <p className={s.bandText}>Doorloop de flow zelf in de live demo.</p>
          </div>
          <div className={s.bandActions}>
            <Link href="/demo" className={`${s.btn} ${s.btnPrimary} ${s.btnLarge}`}>
              Start de live demo <span className={s.btnArrow}>→</span>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
