import type { Metadata } from "next";
import Link from "next/link";
import { formatDatum, STATUS_LABELS } from "./presentatie";
import { ScoreBadge } from "./score-badge";
import { getSupabaseServer } from "@/lib/supabase/server";
import s from "../dashboard.module.css";

export const metadata: Metadata = {
  title: "Overzicht",
};

export const dynamic = "force-dynamic";

function KpiDelta({ huidig, vorig }: { huidig: number; vorig: number }) {
  const diff = huidig - vorig;
  const teken = diff > 0 ? "+" : "";
  const klasse = diff > 0 ? s.kpiDeltaPositief : diff < 0 ? s.kpiDeltaNegatief : s.kpiDelta;
  return (
    <span className={klasse}>
      {teken}
      {diff} vs vorige maand
    </span>
  );
}

/**
 * Dashboard-home: drie kerncijfers van deze maand
 * plus de vijf nieuwste leads. Alle queries via anon-client + RLS.
 */
export default async function DashboardHome() {
  const supabase = await getSupabaseServer();
  const maandNaam = new Intl.DateTimeFormat("nl-NL", { month: "long", year: "numeric" }).format(
    new Date(),
  );
  const maandLabel = maandNaam.charAt(0).toUpperCase() + maandNaam.slice(1);

  const maandStart = new Date();
  maandStart.setDate(1);
  maandStart.setHours(0, 0, 0, 0);
  const sindsMaand = maandStart.toISOString();

  const vorigeStart = new Date(maandStart);
  vorigeStart.setMonth(vorigeStart.getMonth() - 1);
  const sindsVorigeMaand = vorigeStart.toISOString();

  const [leadsMaand, hoogMaand, gesprekkenMaand, nieuwste, leadsVorig, hoogVorig] =
    await Promise.all([
      supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .gte("created_at", sindsMaand),
      supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .gte("created_at", sindsMaand)
        .gte("lead_score", 70),
      supabase
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .gte("created_at", sindsMaand),
      supabase
        .from("leads")
        .select("id, contact_name, plaats, project_type, lead_score, status, created_at")
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .gte("created_at", sindsVorigeMaand)
        .lt("created_at", sindsMaand),
      supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .gte("created_at", sindsVorigeMaand)
        .lt("created_at", sindsMaand)
        .gte("lead_score", 70),
    ]);

  return (
    <>
      <h1 className={s.paginaTitel}>Overzicht</h1>

      <div className={s.sectieKopRij} style={{ marginTop: "1rem" }}>
        <h2 className={s.sectieTitel}>Kerncijfers</h2>
        <span className={s.kpiPeriode}>{maandLabel}</span>
      </div>

      <div className={s.kpiRij}>
        <div className={s.kpiKaart}>
          <div className={s.kpiGetal}>{leadsMaand.count ?? 0}</div>
          <div className={s.kpiLabel}>Leads deze maand</div>
          <KpiDelta huidig={leadsMaand.count ?? 0} vorig={leadsVorig.count ?? 0} />
        </div>
        <div className={s.kpiKaart}>
          <div className={s.kpiGetal}>{hoogMaand.count ?? 0}</div>
          <div className={s.kpiLabel}>
            Hoge leadscore <span className={s.kpiHint}>(score &ge; 70)</span>
          </div>
          <KpiDelta huidig={hoogMaand.count ?? 0} vorig={hoogVorig.count ?? 0} />
        </div>
        <div className={s.kpiKaart}>
          <div className={s.kpiGetal}>{gesprekkenMaand.count ?? 0}</div>
          <div className={s.kpiLabel}>Gesprekken gestart</div>
        </div>
      </div>

      <div className={s.sectieKopRij}>
        <h2 className={s.sectieTitel}>Nieuwste leads</h2>
        <Link href="/dashboard/leads" className={s.link}>
          Alle leads →
        </Link>
      </div>

      {!nieuwste.data || nieuwste.data.length === 0 ? (
        <p className={s.leegStaat}>
          Nog geen leads. Zodra een bezoeker de widget invult, verschijnt de aanvraag hier.
        </p>
      ) : (
        <div className={s.tabelWrap}>
          <table className={s.tabel}>
            <thead>
              <tr>
                <th>Naam</th>
                <th>Plaats</th>
                <th>Werkzaamheden</th>
                <th>Score</th>
                <th>Status</th>
                <th>Datum</th>
              </tr>
            </thead>
            <tbody>
              {nieuwste.data.map((lead) => (
                <tr key={lead.id}>
                  <td>
                    <Link href={`/dashboard/leads/${lead.id}`} className={s.rijLink}>
                      {lead.contact_name ?? "Onbekend"}
                    </Link>
                  </td>
                  <td>{lead.plaats ?? "—"}</td>
                  <td>{lead.project_type ?? "—"}</td>
                  <td>
                    <ScoreBadge score={lead.lead_score} />
                  </td>
                  <td>{STATUS_LABELS[lead.status as keyof typeof STATUS_LABELS] ?? lead.status}</td>
                  <td>{formatDatum(lead.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
