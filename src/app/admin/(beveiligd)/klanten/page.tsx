import Link from "next/link";
import { haalKostenPerTenant, leesAdminWeergaveConfig } from "@/lib/admin/cijfers";
import { formatEurIndicatie, formatUsd } from "@/lib/admin/geld";
import {
  leesSortering,
  naarKlantRij,
  sorteerKlanten,
  type SorteerSleutel,
} from "@/lib/admin/klanten-tabel";
import { bepaalPeriode, leesPeriodeSoort, type PeriodeSoort } from "@/lib/admin/periode";
import { vereisAdminPagina } from "@/lib/admin/toegang";
import { formatDatum, formatProcent, STATUS_LABEL } from "../../_components/opmaak";
import { PeriodeFilter } from "../../_components/periode-filter";
import s from "../../../dashboard/dashboard.module.css";
import a from "../../admin.module.css";

export const dynamic = "force-dynamic";

type Zoek = Promise<{ periode?: string; sort?: string; richting?: string }>;

const KOLOMMEN: { sleutel: SorteerSleutel; label: string; rechts?: boolean }[] = [
  { sleutel: "naam", label: "Klant" },
  { sleutel: "status", label: "Status" },
  { sleutel: "gesprekken", label: "Gesprekken", rechts: true },
  { sleutel: "leads", label: "Leads", rechts: true },
  { sleutel: "conversie", label: "Conversie", rechts: true },
  { sleutel: "kosten", label: "AI-kosten", rechts: true },
  { sleutel: "kosten_per_gesprek", label: "Per gesprek", rechts: true },
  { sleutel: "mails", label: "Mails", rechts: true },
  { sleutel: "laatste_gesprek", label: "Laatste gesprek" },
  { sleutel: "laatste_login", label: "Laatste login" },
];

/** Klantentabel: verbruik per klant, geen leads. */
export default async function KlantenPagina({ searchParams }: { searchParams: Zoek }) {
  await vereisAdminPagina();
  const zoek = await searchParams;
  const soort = leesPeriodeSoort(zoek.periode);
  const periode = bepaalPeriode(soort);
  const { sleutel, richting } = leesSortering(zoek.sort, zoek.richting);
  const config = leesAdminWeergaveConfig();

  const url = (p: PeriodeSoort, sl: SorteerSleutel = sleutel, r: string = richting) =>
    `/admin/klanten?periode=${p}&sort=${sl}&richting=${r}`;

  let rijen;
  try {
    rijen = sorteerKlanten(
      (await haalKostenPerTenant(periode)).map(naarKlantRij),
      sleutel,
      richting,
    );
  } catch (fout) {
    console.error("klantentabel laden mislukt", {
      melding: fout instanceof Error ? fout.message : "onbekend",
    });
    return <p className={s.foutmelding}>De cijfers konden niet worden geladen.</p>;
  }

  const totaal = rijen.reduce((som, r) => som + r.kostenTotaal, 0);

  return (
    <>
      <div className={s.detailKopRij}>
        <h1 className={s.paginaTitel}>Klanten</h1>
        <Link href="/admin/klanten/nieuw" className={s.knopPrimair}>
          Nieuwe klant
        </Link>
      </div>

      <div className={s.sectieKopRij} style={{ marginTop: "1rem" }}>
        <PeriodeFilter actief={soort} hrefVoor={(p) => url(p)} />
        <span className={s.kpiPeriode}>
          {periode.label}: {formatUsd(totaal)} {formatEurIndicatie(totaal, config.eurPerUsd) ?? ""}
        </span>
      </div>

      {rijen.length === 0 ? (
        <p className={s.leegStaat}>Nog geen klanten.</p>
      ) : (
        <div className={s.tabelWrap}>
          <table className={s.tabel}>
            <thead>
              <tr>
                {KOLOMMEN.map((k) => {
                  const actief = k.sleutel === sleutel;
                  const volgende =
                    actief && richting === "af"
                      ? "op"
                      : actief
                        ? "af"
                        : k.sleutel === "naam"
                          ? "op"
                          : "af";
                  return (
                    <th
                      key={k.sleutel}
                      className={k.rechts ? a.getalRechts : undefined}
                      aria-sort={
                        actief ? (richting === "op" ? "ascending" : "descending") : undefined
                      }
                    >
                      <Link href={url(soort, k.sleutel, volgende)} className={s.sorteerkop}>
                        {k.label}
                        {actief ? (richting === "op" ? " ↑" : " ↓") : ""}
                      </Link>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rijen.map((r) => (
                <tr key={r.tenantId}>
                  <td>
                    <Link href={`/admin/klanten/${r.tenantId}`} className={s.rijLink}>
                      {r.naam}
                    </Link>
                  </td>
                  <td>{STATUS_LABEL[r.status] ?? r.status}</td>
                  <td className={a.getalRechts}>{r.gesprekken}</td>
                  <td className={a.getalRechts}>{r.leads}</td>
                  <td className={a.getalRechts}>{formatProcent(r.conversie)}</td>
                  <td className={a.getalRechts}>{formatUsd(r.kostenTotaal)}</td>
                  <td className={a.getalRechts}>
                    {r.kostenPerGesprek === null ? "–" : formatUsd(r.kostenPerGesprek, true)}
                  </td>
                  <td className={a.getalRechts}>{r.mails}</td>
                  <td>{formatDatum(r.laatsteGesprek)}</td>
                  <td>{formatDatum(r.laatsteLogin)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className={a.toelichting}>
        &quot;Per gesprek&quot; telt alleen de intake. &quot;Laatste gesprek&quot; en &quot;laatste
        login&quot; kijken buiten de gekozen periode. Pakketten en limieten komen later; dit zijn de
        kosten zoals ze nu zijn.
      </p>
    </>
  );
}
