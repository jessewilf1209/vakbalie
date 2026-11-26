import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { haalKostenPerTenant, haalTenantTrend, leesAdminWeergaveConfig } from "@/lib/admin/cijfers";
import { formatEurIndicatie, formatUsd, perStuk } from "@/lib/admin/geld";
import { bepaalPeriode, leesPeriodeSoort } from "@/lib/admin/periode";
import { haalTenantBeheer } from "@/lib/admin/beheer-lezen";
import { vereisAdminPagina } from "@/lib/admin/toegang";
import { BeheerPaneel } from "../../../_components/beheer-paneel";
import { formatDag, formatDatum, formatProcent, STATUS_LABEL } from "../../../_components/opmaak";
import { PeriodeFilter } from "../../../_components/periode-filter";
import { StaafGrafiek } from "../../../_components/staaf-grafiek";
import s from "../../../../dashboard/dashboard.module.css";
import a from "../../../admin.module.css";

export const dynamic = "force-dynamic";

/**
 * Klantdetail: trend per dag, kosten per bron,
 * funnel en weigeringen. Bewust geen leads, gesprekken of foto's: als
 * verwerker heeft Vakbalie geen reden om aanvragen van een hovenier in te
 * zien.
 */
export default async function KlantDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ periode?: string; nieuw?: string }>;
}) {
  await vereisAdminPagina();
  const { id } = await params;
  if (!z.guid().safeParse(id).success) notFound();

  const zoek = await searchParams;
  const soort = leesPeriodeSoort(zoek.periode);
  const periode = bepaalPeriode(soort);
  const config = leesAdminWeergaveConfig();

  let klant, trend, beheer;
  try {
    const [perKlant, dagen, beheerGegevens] = await Promise.all([
      haalKostenPerTenant(periode),
      haalTenantTrend(id, periode),
      haalTenantBeheer(id),
    ]);
    klant = perKlant.find((k) => k.tenantId === id);
    trend = dagen;
    beheer = beheerGegevens;
  } catch (fout) {
    console.error("klantdetail laden mislukt", {
      melding: fout instanceof Error ? fout.message : "onbekend",
    });
    return <p className={s.foutmelding}>De cijfers konden niet worden geladen.</p>;
  }
  if (!klant || !beheer.tenant) notFound();

  const weigeringen = klant.afgerondOpBudget + klant.rateLimitGeweigerd + klant.dagremGeweigerd;
  const perGesprek = perStuk(klant.kostenIntake, klant.gesprekken);
  const maxKosten = Math.max(0, ...trend.map((d) => d.kostenTotaal));
  const maxGesprekken = Math.max(0, ...trend.map((d) => d.gesprekken));
  const eur = formatEurIndicatie(klant.kostenTotaal, config.eurPerUsd);

  return (
    <>
      <p>
        <Link href="/admin/klanten" className={s.link}>
          ← Alle klanten
        </Link>
      </p>
      <div className={s.detailKopRij}>
        <h1 className={s.paginaTitel}>{klant.naam}</h1>
        <span className={s.badge}>{STATUS_LABEL[klant.status] ?? klant.status}</span>
      </div>
      {zoek.nieuw === "1" && (
        <p className={s.melding}>
          Klant aangemaakt en de eigenaar uitgenodigd. Controleer hieronder de domeinen.
        </p>
      )}

      <div className={s.sectieKopRij} style={{ marginTop: "1rem" }}>
        <PeriodeFilter actief={soort} hrefVoor={(p) => `/admin/klanten/${id}?periode=${p}`} />
        <span className={s.kpiPeriode}>{periode.label}</span>
      </div>

      <div className={s.kpiRij}>
        <div className={s.kpiKaart}>
          <div className={s.kpiGetal}>{formatUsd(klant.kostenTotaal)}</div>
          <div className={s.kpiLabel}>
            AI-kosten {eur && <span className={s.kpiHint}>{eur}</span>}
          </div>
          <span className={s.kpiDelta}>
            {perGesprek === null ? "Geen gesprekken" : `${formatUsd(perGesprek, true)} per gesprek`}
          </span>
        </div>
        <div className={s.kpiKaart}>
          <div className={s.kpiGetal}>{klant.gesprekken}</div>
          <div className={s.kpiLabel}>Gesprekken gestart</div>
          <span className={s.kpiDelta}>
            {klant.leads} leads, conversie {formatProcent(perStuk(klant.leads, klant.gesprekken))}
          </span>
        </div>
        <div className={s.kpiKaart}>
          <div className={s.kpiGetal}>{weigeringen}</div>
          <div className={s.kpiLabel}>Weigeringen</div>
          <span className={s.kpiDelta}>
            {klant.rateLimitGeweigerd} rate limit, {klant.afgerondOpBudget} gespreksbudget,{" "}
            {klant.dagremGeweigerd} dagrem
          </span>
        </div>
        <div className={s.kpiKaart}>
          <div className={s.kpiGetal}>{klant.notificatiemails + klant.opvolgmails}</div>
          <div className={s.kpiLabel}>Mails verstuurd</div>
          <span className={s.kpiDelta}>
            {klant.notificatiemails} notificatie, {klant.opvolgmails} opvolg
          </span>
        </div>
      </div>

      <section className={s.sectie}>
        <h2 className={s.sectieTitel}>Per dag</h2>
        <div className={a.grafiekRaster}>
          <StaafGrafiek
            titel="Gesprekken per dag"
            maxLabel={String(maxGesprekken)}
            staven={trend.map((d) => ({
              label: formatDag(d.dag),
              waarde: d.gesprekken,
              tooltip: `${formatDag(d.dag)}: ${d.gesprekken} gesprekken, ${d.leads} leads`,
            }))}
          />
          <StaafGrafiek
            titel="AI-kosten per dag (USD)"
            maxLabel={formatUsd(maxKosten, true)}
            staven={trend.map((d) => ({
              label: formatDag(d.dag),
              waarde: d.kostenTotaal,
              tooltip: `${formatDag(d.dag)}: ${formatUsd(d.kostenTotaal, true)}`,
            }))}
          />
        </div>

        <details className={a.tabelDetails}>
          <summary>Toon als tabel</summary>
          <div className={s.tabelWrap}>
            <table className={s.tabel}>
              <thead>
                <tr>
                  <th>Dag</th>
                  <th className={a.getalRechts}>Gesprekken</th>
                  <th className={a.getalRechts}>Leads</th>
                  <th className={a.getalRechts}>AI-kosten</th>
                  <th className={a.getalRechts}>Weigeringen</th>
                </tr>
              </thead>
              <tbody>
                {trend.map((d) => (
                  <tr key={d.dag}>
                    <td>{formatDag(d.dag)}</td>
                    <td className={a.getalRechts}>{d.gesprekken}</td>
                    <td className={a.getalRechts}>{d.leads}</td>
                    <td className={a.getalRechts}>{formatUsd(d.kostenTotaal, true)}</td>
                    <td className={a.getalRechts}>{d.weigeringen}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>

      <section className={s.sectie}>
        <h2 className={s.sectieTitel}>Kosten per bron</h2>
        <div className={s.tabelWrap}>
          <table className={s.tabel}>
            <thead>
              <tr>
                <th>Bron</th>
                <th className={a.getalRechts}>AI-kosten</th>
                <th className={a.getalRechts}>Aandeel</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["Intake (widget)", klant.kostenIntake],
                  ["Opvolgmail", klant.kostenOpvolgmail],
                  ["Belscript", klant.kostenBelscript],
                ] as const
              ).map(([label, waarde]) => (
                <tr key={label}>
                  <td>{label}</td>
                  <td className={a.getalRechts}>{formatUsd(waarde, true)}</td>
                  <td className={a.getalRechts}>
                    {formatProcent(perStuk(waarde, klant.kostenTotaal))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={a.toelichting}>
          {klant.aanroepen} AI-aanroepen, {klant.inputTokens.toLocaleString("nl-NL")} input- en{" "}
          {klant.outputTokens.toLocaleString("nl-NL")} outputtokens. {klant.fotos} foto&apos;s
          geüpload. Laatste gesprek {formatDatum(klant.laatsteGesprek)}, laatste login{" "}
          {formatDatum(klant.laatsteLogin)}.
        </p>
      </section>

      <h2 className={s.paginaTitel} style={{ marginTop: "2.5rem" }}>
        Beheer
      </h2>
      <BeheerPaneel tenant={beheer.tenant} gebruikers={beheer.gebruikers} audit={beheer.audit} />
    </>
  );
}
