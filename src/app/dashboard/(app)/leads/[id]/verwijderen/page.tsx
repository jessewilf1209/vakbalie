import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { verwijderLeadActie } from "../../acties";
import { getSupabaseServer } from "@/lib/supabase/server";
import s from "../../../../dashboard.module.css";

export const metadata: Metadata = {
  title: "Lead verwijderen",
};

export const dynamic = "force-dynamic";

interface ZoekParams {
  fout?: string;
}

/**
 * Bevestigingspagina vóór hard delete (AVG). Bewust een
 * aparte pagina in plaats van een confirm-dialog: werkt zonder JS, en de
 * hovenier ziet exact wat er verdwijnt voordat hij tekent.
 */
export default async function LeadVerwijderen({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<ZoekParams>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const sp = await searchParams;

  const supabase = await getSupabaseServer();
  const { data: lead } = await supabase
    .from("leads")
    .select("id, contact_name, plaats, conversation_id, foto_paden")
    .eq("id", id)
    .maybeSingle();
  if (!lead) notFound();

  const aantalFotos = (lead.foto_paden ?? []).length;

  return (
    <>
      <Link href={`/dashboard/leads/${lead.id}`} className={s.link}>
        ← Terug naar de lead
      </Link>

      <h1 className={s.paginaTitel}>Lead definitief verwijderen</h1>

      {sp.fout && (
        <p className={s.foutmelding}>
          Verwijderen is niet volledig gelukt. Probeer het opnieuw; er is niets half verwijderd.
        </p>
      )}

      <section className={s.sectie}>
        <p>
          Je staat op het punt de aanvraag van{" "}
          <strong>{lead.contact_name ?? "onbekende naam"}</strong>
          {lead.plaats ? ` uit ${lead.plaats}` : ""} definitief te verwijderen. Dit omvat:
        </p>
        <ul className={s.redenen}>
          <li>alle contactgegevens en intakevelden van deze lead</li>
          <li>het volledige gesprek met de assistent</li>
          {aantalFotos > 0 && (
            <li>
              {aantalFotos} {aantalFotos === 1 ? "foto" : "foto's"} van de situatie
            </li>
          )}
        </ul>
        <p className={s.veldUitleg}>
          Dit kan niet ongedaan worden gemaakt. Gebruik dit ook wanneer een bezoeker vraagt om zijn
          gegevens te verwijderen (AVG-verwijderverzoek).
        </p>

        <div className={s.verwijderRij}>
          <form action={verwijderLeadActie}>
            <input type="hidden" name="leadId" value={lead.id} />
            <button type="submit" className={s.knopGevaar}>
              Definitief verwijderen
            </button>
          </form>
          <Link href={`/dashboard/leads/${lead.id}`} className={s.knopSecundair}>
            Annuleren
          </Link>
        </div>
      </section>
    </>
  );
}
