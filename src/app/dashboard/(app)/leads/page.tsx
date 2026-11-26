import type { Metadata } from "next";
import Link from "next/link";
import { formatDatum, LEAD_STATUSSEN, STATUS_LABELS, type LeadStatus } from "../presentatie";
import { ScoreBadge } from "../score-badge";
import { getSupabaseServer } from "@/lib/supabase/server";
import s from "../../dashboard.module.css";

export const metadata: Metadata = {
  title: "Leads",
};

export const dynamic = "force-dynamic";

const PAGINA_GROOTTE = 20;

interface ZoekParams {
  pagina?: string;
  status?: string;
  verwijderd?: string;
  q?: string;
  sort?: string;
  richting?: string;
}

/**
 * Leadoverzicht: server-side paginering en
 * statusfilter via GET-params — geen client-JS nodig. RLS beperkt de
 * query tot de eigen tenant; alle tekst rendert via React-escaping.
 */
export default async function LeadsPagina({ searchParams }: { searchParams: Promise<ZoekParams> }) {
  const sp = await searchParams;

  const pagina = Math.max(1, Number.parseInt(sp.pagina ?? "1", 10) || 1);
  const statusFilter = (LEAD_STATUSSEN as readonly string[]).includes(sp.status ?? "")
    ? (sp.status as LeadStatus)
    : undefined;
  const zoekterm = sp.q?.trim() ?? "";
  const sortVeld = ["contact_name", "lead_score", "created_at"].includes(sp.sort ?? "")
    ? sp.sort!
    : "created_at";
  const sortRichting = sp.richting === "asc";

  const supabase = await getSupabaseServer();
  const van = (pagina - 1) * PAGINA_GROOTTE;

  let query = supabase
    .from("leads")
    .select("id, contact_name, plaats, project_type, lead_score, status, created_at", {
      count: "exact",
    });
  if (statusFilter) query = query.eq("status", statusFilter);
  if (zoekterm) query = query.ilike("contact_name", `%${zoekterm}%`);
  query = query.order(sortVeld, { ascending: sortRichting }).range(van, van + PAGINA_GROOTTE - 1);

  const { data: leads, count } = await query;
  const totaal = count ?? 0;
  const laatstePagina = Math.max(1, Math.ceil(totaal / PAGINA_GROOTTE));

  const filterUrl = (status?: LeadStatus) => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (zoekterm) params.set("q", zoekterm);
    const qs = params.toString();
    return qs ? `/dashboard/leads?${qs}` : "/dashboard/leads";
  };
  const paginaUrl = (p: number) => {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (zoekterm) params.set("q", zoekterm);
    params.set("pagina", String(p));
    return `/dashboard/leads?${params.toString()}`;
  };
  const sortUrl = (veld: string) => {
    const nieuweRichting = sortVeld === veld && !sortRichting ? "asc" : "desc";
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (zoekterm) params.set("q", zoekterm);
    params.set("sort", veld);
    params.set("richting", nieuweRichting);
    return `/dashboard/leads?${params.toString()}`;
  };

  const leegBericht = zoekterm
    ? `Geen leads gevonden voor "${zoekterm}".`
    : statusFilter
      ? `Geen leads met status "${STATUS_LABELS[statusFilter]}".`
      : "Nog geen leads. Zodra een bezoeker de widget invult, verschijnt de aanvraag hier.";

  return (
    <>
      <h1 className={s.paginaTitel}>Leads</h1>

      {sp.verwijderd && (
        <p className={s.melding}>De lead is definitief verwijderd, inclusief foto’s en gesprek.</p>
      )}

      <form method="GET" className={s.zoekRij}>
        {statusFilter && <input type="hidden" name="status" value={statusFilter} />}
        {sp.sort && <input type="hidden" name="sort" value={sp.sort} />}
        {sp.richting && <input type="hidden" name="richting" value={sp.richting} />}
        <input
          type="search"
          name="q"
          defaultValue={zoekterm}
          placeholder="Zoek op naam..."
          className={`${s.veld} ${s.zoekVeld}`}
          aria-label="Zoeken op naam"
        />
        <button type="submit" className={s.knopSecundair}>
          Zoeken
        </button>
      </form>

      <nav className={s.filterRij} aria-label="Filter op status">
        <Link
          href={filterUrl()}
          className={statusFilter ? s.filterKnop : `${s.filterKnop} ${s.filterActief}`}
        >
          Alle
        </Link>
        {LEAD_STATUSSEN.map((status) => (
          <Link
            key={status}
            href={filterUrl(status)}
            className={statusFilter === status ? `${s.filterKnop} ${s.filterActief}` : s.filterKnop}
          >
            {STATUS_LABELS[status]}
          </Link>
        ))}
      </nav>

      {!leads || leads.length === 0 ? (
        <p className={s.leegStaat}>{leegBericht}</p>
      ) : (
        <>
          <div className={s.tabelWrap}>
            <table className={s.tabel}>
              <thead>
                <tr>
                  <th>
                    <Link href={sortUrl("contact_name")} className={s.sorteerkop}>
                      Naam{sortVeld === "contact_name" ? (sortRichting ? " ↑" : " ↓") : ""}
                    </Link>
                  </th>
                  <th>Plaats</th>
                  <th>Werkzaamheden</th>
                  <th>
                    <Link href={sortUrl("lead_score")} className={s.sorteerkop}>
                      Score{sortVeld === "lead_score" ? (sortRichting ? " ↑" : " ↓") : ""}
                    </Link>
                  </th>
                  <th>Status</th>
                  <th>
                    <Link href={sortUrl("created_at")} className={s.sorteerkop}>
                      Datum{sortVeld === "created_at" ? (sortRichting ? " ↑" : " ↓") : ""}
                    </Link>
                  </th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
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
                    <td>
                      {STATUS_LABELS[lead.status as keyof typeof STATUS_LABELS] ?? lead.status}
                    </td>
                    <td>{formatDatum(lead.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {laatstePagina > 1 && (
            <nav className={s.paginering} aria-label="Paginering">
              {pagina > 1 ? (
                <Link href={paginaUrl(pagina - 1)} className={s.link}>
                  ← Vorige
                </Link>
              ) : (
                <span className={s.linkUit}>← Vorige</span>
              )}
              <span>
                Pagina {pagina} van {laatstePagina}
              </span>
              {pagina < laatstePagina ? (
                <Link href={paginaUrl(pagina + 1)} className={s.link}>
                  Volgende →
                </Link>
              ) : (
                <span className={s.linkUit}>Volgende →</span>
              )}
            </nav>
          )}
        </>
      )}
    </>
  );
}
