import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { wijzigStatusActie } from "../acties";
import { OpvolgFormulier } from "./_components/opvolg-formulier";
import { formatDatumTijd, LEAD_STATUSSEN, STATUS_LABELS } from "../../presentatie";
import { ScoreBadge } from "../../score-badge";
import { BUDGET_LABELS, TIMING_LABELS } from "@/lib/intake/samenvatting";
import type { BudgetIndicatie, Timing } from "@/lib/intake/types";
import { getSupabaseServer } from "@/lib/supabase/server";
import s from "../../../dashboard.module.css";

export const metadata: Metadata = {
  title: "Lead",
};

export const dynamic = "force-dynamic";

/** Levensduur van signed foto-URLs: lang genoeg voor één werksessie. */
const FOTO_URL_SECONDEN = 3600;

/**
 * Leaddetail: alle intakevelden, leadscore met
 * redenen, foto's via kortlevende signed URLs (storage-policy uit
 * migration 007), het gesprek en een statusknop.
 *
 * Alle bezoekers-/LLM-tekst rendert via React-escaping — nooit
 * dangerouslySetInnerHTML (OWASP LLM02).
 */
export default async function LeadDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ opgeslagen?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  if (!z.uuid().safeParse(id).success) notFound();

  const supabase = await getSupabaseServer();

  // RLS: een lead van een andere tenant geeft hier gewoon "niet gevonden".
  const { data: lead } = await supabase
    .from("leads")
    .select(
      "id, contact_name, contact_email, contact_phone, project_description, plaats, project_type, tuin_grootte, budget_indicatie, timing, lead_score, score_redenen, status, consent_at, created_at, conversation_id, foto_paden",
    )
    .eq("id", id)
    .maybeSingle();
  if (!lead) notFound();

  const fotoPaden: string[] = lead.foto_paden ?? [];
  const { data: fotoUrls } =
    fotoPaden.length > 0
      ? await supabase.storage.from("lead-fotos").createSignedUrls(fotoPaden, FOTO_URL_SECONDEN)
      : { data: null };
  const fotos = (fotoUrls ?? []).flatMap((foto) =>
    foto.signedUrl && foto.path ? [{ pad: foto.path, url: foto.signedUrl }] : [],
  );

  const { data: berichten } = lead.conversation_id
    ? await supabase
        .from("messages")
        .select("id, role, content, created_at")
        .eq("conversation_id", lead.conversation_id)
        .order("created_at", { ascending: true })
    : { data: null };

  // Verstuurde opvolgmails: het begin van een opvolghistorie.
  const { data: opvolgmails } = await supabase
    .from("lead_opvolgmails")
    .select("id, onderwerp, tekst, verzonden_op")
    .eq("lead_id", id)
    .order("verzonden_op", { ascending: false });

  const gegevens: Array<{ label: string; waarde: string | null }> = [
    { label: "Naam", waarde: lead.contact_name },
    { label: "E-mail", waarde: lead.contact_email },
    { label: "Telefoon", waarde: lead.contact_phone },
    { label: "Plaats", waarde: lead.plaats },
    { label: "Werkzaamheden", waarde: lead.project_type },
    { label: "Wensen", waarde: lead.project_description },
    { label: "Tuingrootte", waarde: lead.tuin_grootte },
    {
      label: "Budget",
      waarde: lead.budget_indicatie
        ? BUDGET_LABELS[lead.budget_indicatie as BudgetIndicatie]
        : null,
    },
    { label: "Startmoment", waarde: lead.timing ? TIMING_LABELS[lead.timing as Timing] : null },
    { label: "Binnengekomen", waarde: formatDatumTijd(lead.created_at) },
    {
      label: "Toestemming gegeven",
      waarde: lead.consent_at ? formatDatumTijd(lead.consent_at) : null,
    },
  ];

  return (
    <>
      <Link href="/dashboard/leads" className={s.link}>
        ← Terug naar leads
      </Link>

      <div className={s.detailKopRij}>
        <h1 className={s.paginaTitel}>{lead.contact_name ?? "Onbekende naam"}</h1>
        <ScoreBadge score={lead.lead_score} />
      </div>

      {sp.opgeslagen && <p className={s.melding}>Status opgeslagen.</p>}

      <section className={s.sectie} aria-label="Status">
        <form action={wijzigStatusActie} className={s.statusFormulier}>
          <input type="hidden" name="leadId" value={lead.id} />
          <label htmlFor="status" className={s.label}>
            Status
          </label>
          <select id="status" name="status" defaultValue={lead.status} className={s.veld}>
            {LEAD_STATUSSEN.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>
          <button type="submit" className={s.knopSecundair}>
            Opslaan
          </button>
        </form>
      </section>

      <section className={s.sectie} aria-label="Opvolgen">
        <h2 className={s.sectieTitel}>Opvolgen</h2>
        <OpvolgFormulier
          leadId={lead.id}
          contactEmail={lead.contact_email}
          contactTelefoon={lead.contact_phone}
        />
      </section>

      {opvolgmails && opvolgmails.length > 0 && (
        <section className={s.sectie}>
          <h2 className={s.sectieTitel}>Verstuurde berichten</h2>
          <div className={s.opvolgHistorie}>
            {opvolgmails.map((mail) => (
              <article key={mail.id} className={s.opvolgHistorieItem}>
                <h3 className={s.opvolgHistorieKop}>{mail.onderwerp}</h3>
                <p className={s.opvolgHistorieDatum}>
                  Verstuurd op {formatDatumTijd(mail.verzonden_op)}
                </p>
                {/* Regeleindes uit de verstuurde mail behouden (CSS pre-wrap). */}
                <p className={s.opvolgHistorieTekst}>{mail.tekst}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className={s.sectie}>
        <h2 className={s.sectieTitel}>Aanvraag</h2>
        <dl className={s.gegevens}>
          {gegevens
            .filter((regel) => regel.waarde !== null && regel.waarde !== "")
            .map((regel) => (
              <div key={regel.label} className={s.gegevensRij}>
                <dt>{regel.label}</dt>
                <dd>{regel.waarde}</dd>
              </div>
            ))}
        </dl>
      </section>

      {(lead.score_redenen ?? []).length > 0 && (
        <section className={s.sectie}>
          <h2 className={s.sectieTitel}>Waarom deze leadscore</h2>
          <ul className={s.redenen}>
            {(lead.score_redenen as string[]).map((reden) => (
              <li key={reden}>{reden}</li>
            ))}
          </ul>
        </section>
      )}

      {fotos.length > 0 && (
        <section className={s.sectie}>
          <h2 className={s.sectieTitel}>Foto’s van de situatie</h2>
          <div className={s.fotoRij}>
            {fotos.map((foto, i) => (
              <a key={foto.pad} href={foto.url} target="_blank" rel="noreferrer">
                {/* Signed URLs verlopen; next/image-caching is hier zinloos. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={foto.url}
                  alt={`Foto ${i + 1} van ${fotos.length} — tuinsituatie`}
                  className={s.foto}
                />
              </a>
            ))}
          </div>
        </section>
      )}

      {berichten && berichten.length > 0 && (
        <section className={s.sectie}>
          <h2 className={s.sectieTitel}>Het gesprek</h2>
          <div className={s.gesprek}>
            {berichten
              .filter((bericht) => bericht.role === "user" || bericht.role === "assistant")
              .map((bericht) => (
                <p
                  key={bericht.id}
                  className={
                    bericht.role === "user"
                      ? `${s.bericht} ${s.berichtBezoeker}`
                      : `${s.bericht} ${s.berichtAssistent}`
                  }
                >
                  {bericht.content}
                </p>
              ))}
          </div>
        </section>
      )}

      <section className={s.sectie}>
        <h2 className={s.sectieTitel}>Gegevens verwijderen</h2>
        <p className={s.veldUitleg}>
          Verwijdert deze aanvraag definitief, inclusief foto’s en het gesprek — bijvoorbeeld bij
          een AVG-verwijderverzoek van de aanvrager.
        </p>
        <div className={s.verwijderRij}>
          <Link href={`/dashboard/leads/${lead.id}/verwijderen`} className={s.knopGevaar}>
            Lead verwijderen
          </Link>
        </div>
      </section>
    </>
  );
}
