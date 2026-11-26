import Link from "next/link";
import {
  haalKostenPerTenant,
  haalPlatformOverzicht,
  leesAdminWeergaveConfig,
} from "@/lib/admin/cijfers";
import { formatEurIndicatie, formatUsd, perStuk } from "@/lib/admin/geld";
import { bepaalPeriode } from "@/lib/admin/periode";
import { bepaalSignalen } from "@/lib/admin/signalen";
import { vereisAdminPagina } from "@/lib/admin/toegang";
import s from "../../dashboard/dashboard.module.css";
import a from "../admin.module.css";

export const dynamic = "force-dynamic";

/**
 * Admin-overzicht: kosten vandaag tegenover de
 * dagrem, kosten deze en vorige maand, klanten en signalen. Alleen
 * verbruik, nooit leadinhoud.
 */
export default async function AdminOverzicht() {
  // Ook per pagina: de layout kan bij navigatie binnen de groep gecachet zijn.
  await vereisAdminPagina();

  const config = leesAdminWeergaveConfig();
  const dezeMaand = bepaalPeriode("deze_maand");
  const vorigeMaand = bepaalPeriode("vorige_maand");
  const week = bepaalPeriode("laatste_7_dagen");

  let gegevens;
  try {
    const [nu, vorig, perKlant] = await Promise.all([
      haalPlatformOverzicht(dezeMaand),
      haalPlatformOverzicht(vorigeMaand),
      haalKostenPerTenant(week),
    ]);
    gegevens = { nu, vorig, perKlant };
  } catch (fout) {
    console.error("admin-overzicht laden mislukt", {
      melding: fout instanceof Error ? fout.message : "onbekend",
    });
    return (
      <p className={s.foutmelding}>
        De cijfers konden niet worden geladen. Staan de migrations van het admin-dashboard in deze
        database?
      </p>
    );
  }

  const { nu, vorig, perKlant } = gegevens;
  const dagremProcent =
    config.dagremPlafond > 0 ? Math.min(100, (nu.dagremStand / config.dagremPlafond) * 100) : 0;
  const signalen = bepaalSignalen({
    tenants: perKlant,
    dagremStand: nu.dagremStand,
    dagremPlafond: config.dagremPlafond,
  });
  const perGesprek = perStuk(nu.kostenIntake, nu.gesprekken);
  const actieveKlanten = nu.klantenActief + nu.klantenTrial;
  const eur = (eenheden: number) => formatEurIndicatie(eenheden, config.eurPerUsd);

  return (
    <>
      <h1 className={s.paginaTitel}>Overzicht</h1>

      <div className={s.sectieKopRij} style={{ marginTop: "1rem" }}>
        <h2 className={s.sectieTitel}>Kosten</h2>
        <span className={s.kpiPeriode}>{dezeMaand.label}</span>
      </div>

      <div className={s.kpiRij}>
        <div className={s.kpiKaart}>
          <div className={s.kpiGetal}>{formatUsd(nu.dagremStand)}</div>
          <div className={s.kpiLabel}>
            AI-kosten vandaag{" "}
            <span className={s.kpiHint}>
              van {formatUsd(config.dagremPlafond)} dagrem (UTC-dag)
            </span>
          </div>
          <div
            className={a.meter}
            role="meter"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(dagremProcent)}
            aria-label="Dagrem gebruikt"
          >
            <div
              className={`${a.meterVulling} ${dagremProcent >= 80 ? a.meterWaarschuwing : ""}`}
              style={{ width: `${dagremProcent}%` }}
            />
          </div>
        </div>

        <div className={s.kpiKaart}>
          <div className={s.kpiGetal}>{formatUsd(nu.kostenTotaal)}</div>
          <div className={s.kpiLabel}>
            AI-kosten deze maand{" "}
            {eur(nu.kostenTotaal) && <span className={s.kpiHint}>{eur(nu.kostenTotaal)}</span>}
          </div>
          <span className={s.kpiDelta}>
            {vorigeMaand.label}: {formatUsd(vorig.kostenTotaal)}
          </span>
        </div>

        <div className={s.kpiKaart}>
          <div className={s.kpiGetal}>
            {perGesprek === null ? "–" : formatUsd(perGesprek, true)}
          </div>
          <div className={s.kpiLabel}>Gemiddelde AI-kosten per gesprek</div>
          <span className={s.kpiDelta}>
            {nu.gesprekken} gesprekken, {nu.leads} leads
          </span>
        </div>

        <div className={s.kpiKaart}>
          <div className={s.kpiGetal}>{actieveKlanten}</div>
          <div className={s.kpiLabel}>
            Klanten{" "}
            <span className={s.kpiHint}>
              ({nu.klantenActief} actief, {nu.klantenTrial} trial)
            </span>
          </div>
          <span className={s.kpiDelta}>{nu.klantenMetGesprekken} met gesprekken deze maand</span>
        </div>
      </div>

      <p className={a.toelichting}>
        {config.vasteKostenPerMaand === null ? (
          <>
            Vaste kosten (hosting, database, domein) zijn niet ingesteld. Zet{" "}
            <code>ADMIN_VASTE_KOSTEN_USD_PER_MAAND</code> om ze en het aandeel per klant te zien.
          </>
        ) : (
          <>
            Vaste kosten {formatUsd(config.vasteKostenPerMaand)} per maand
            {actieveKlanten > 0 &&
              `, indicatief ${formatUsd(Math.round(config.vasteKostenPerMaand / actieveKlanten))} per actieve klant`}
            .
          </>
        )}{" "}
        AI-kosten zijn een berekening met de tarieven uit de configuratie, geen factuur: leg ze
        maandelijks naast de AWS-rekening.
        {config.eurPerUsd === null && " Zet ADMIN_EUR_PER_USD voor een indicatie in euro's."}
      </p>

      <div className={s.sectieKopRij} style={{ marginTop: "2rem" }}>
        <h2 className={s.sectieTitel}>Signalen</h2>
        <span className={s.kpiPeriode}>{week.label}</span>
      </div>

      {signalen.length === 0 ? (
        <p className={s.leegStaat}>Geen signalen. Alles ziet er normaal uit.</p>
      ) : (
        <ul className={a.signalen}>
          {signalen.map((sig) => (
            <li key={`${sig.soort}-${sig.tenantId ?? "platform"}`} className={a.signaal}>
              <span className={a.signaalIcoon} aria-hidden="true">
                !
              </span>
              <span className={a.signaalTitel}>
                {sig.tenantId ? (
                  <Link href={`/admin/klanten/${sig.tenantId}`} className={s.link}>
                    {sig.titel}
                  </Link>
                ) : (
                  sig.titel
                )}
              </span>
              <span className={a.signaalUitleg}>{sig.uitleg}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
