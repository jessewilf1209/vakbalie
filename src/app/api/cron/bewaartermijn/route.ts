import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { verwijderGesprekVolledig, verwijderLeadVolledig } from "@/lib/avg/verwijder-lead";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { DEMO_LIMIETEN, getDemoTenantKey } from "@/lib/widget/demo";

export const dynamic = "force-dynamic";

/**
 * Bewaartermijn-job (AVG): dagelijks via Vercel Cron.
 *
 * - Leads ouder dan 24 maanden: hard delete incl. foto's en gesprek.
 * - Gesprekken zónder lead (afgebroken intake) ouder dan 30 dagen: idem —
 *   die data heeft geen doel meer (dataminimalisatie).
 * - Gesprekken van de publieke demo-tenant (zonder lead) ouder dan 24 uur.
 * - Meetdata (llm_gebruik, gebruik_events) ouder dan 25 maanden.
 *   Geen persoonsgegevens, wel bedrijfsgegevens van klanten.
 *
 * Beveiliging: alleen aanroepbaar met CRON_SECRET (timing-safe vergeleken).
 * Geen secret geconfigureerd = route uit (fail-closed). Batchlimiet houdt
 * de runtime begrensd; de volgende run pakt het restant.
 */

const LEAD_BEWAARTERMIJN_MAANDEN = 24;
const GESPREK_BEWAARTERMIJN_DAGEN = 30;
const MEETDATA_BEWAARTERMIJN_MAANDEN = 25;
const MEETTABELLEN = ["llm_gebruik", "gebruik_events"] as const;
const BATCH_LIMIET = 200;

function isGeautoriseerd(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;

  const header = request.headers.get("authorization") ?? "";
  const verwacht = `Bearer ${secret}`;
  const a = Buffer.from(header);
  const b = Buffer.from(verwacht);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  if (!isGeautoriseerd(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  const leadGrens = new Date();
  leadGrens.setMonth(leadGrens.getMonth() - LEAD_BEWAARTERMIJN_MAANDEN);

  const gesprekGrens = new Date();
  gesprekGrens.setDate(gesprekGrens.getDate() - GESPREK_BEWAARTERMIJN_DAGEN);

  const { data: verlopenLeads, error: leadFout } = await supabase
    .from("leads")
    .select("id, tenant_id, conversation_id, foto_paden")
    .lt("created_at", leadGrens.toISOString())
    .limit(BATCH_LIMIET);
  if (leadFout) {
    return NextResponse.json({ error: "query mislukt" }, { status: 500 });
  }

  let leadsVerwijderd = 0;
  for (const lead of verlopenLeads ?? []) {
    if (await verwijderLeadVolledig(supabase, lead)) leadsVerwijderd++;
  }

  const { data: verlopenGesprekken, error: gesprekFout } = await supabase
    .from("conversations")
    .select("id, tenant_id, foto_paden")
    .is("lead_id", null)
    .lt("updated_at", gesprekGrens.toISOString())
    .limit(BATCH_LIMIET);
  if (gesprekFout) {
    return NextResponse.json(
      { leadsVerwijderd, error: "gesprekken-query mislukt" },
      { status: 500 },
    );
  }

  let gesprekkenVerwijderd = 0;
  for (const gesprek of verlopenGesprekken ?? []) {
    if (await verwijderGesprekVolledig(supabase, gesprek)) gesprekkenVerwijderd++;
  }

  // Publieke demo: gesprekken zonder lead na 24 uur weg. Bewust alleen
  // lead-loze gesprekken, zodat een verkeerd ingestelde demo-key nooit echte
  // leads van een klant kan raken. Het aantal is meteen een dagmaat voor het
  // gebruik van de demo (in de logs, zonder inhoud).
  let demoGesprekkenVerwijderd = 0;
  const demoKey = getDemoTenantKey();
  if (demoKey) {
    const { data: demoTenant } = await supabase
      .from("tenants")
      .select("id")
      .eq("widget_key", demoKey)
      .maybeSingle();
    if (demoTenant) {
      const demoGrens = new Date(Date.now() - DEMO_LIMIETEN.bewaaruren * 3_600_000);
      const { data: demoGesprekken, error: demoFout } = await supabase
        .from("conversations")
        .select("id, tenant_id, foto_paden")
        .eq("tenant_id", demoTenant.id)
        .is("lead_id", null)
        .lt("created_at", demoGrens.toISOString())
        .limit(BATCH_LIMIET);
      if (demoFout) {
        return NextResponse.json(
          { leadsVerwijderd, gesprekkenVerwijderd, error: "demo-gesprekken query mislukt" },
          { status: 500 },
        );
      }
      for (const gesprek of demoGesprekken ?? []) {
        if (await verwijderGesprekVolledig(supabase, gesprek)) demoGesprekkenVerwijderd++;
      }
    }
  }

  const meetGrens = new Date();
  meetGrens.setMonth(meetGrens.getMonth() - MEETDATA_BEWAARTERMIJN_MAANDEN);

  // Kleine rijen zonder bijlagen: één delete per tabel volstaat.
  let meetrijenVerwijderd = 0;
  for (const tabel of MEETTABELLEN) {
    const { count, error } = await supabase
      .from(tabel)
      .delete({ count: "exact" })
      .lt("created_at", meetGrens.toISOString());
    if (error) {
      return NextResponse.json(
        { leadsVerwijderd, gesprekkenVerwijderd, error: "meetdata opruimen mislukt" },
        { status: 500 },
      );
    }
    meetrijenVerwijderd += count ?? 0;
  }

  // Alleen aantallen in de logs — nooit persoonsgegevens (stap 7.3).
  console.log("bewaartermijn-run klaar", {
    leadsVerwijderd,
    gesprekkenVerwijderd,
    demoGesprekkenVerwijderd,
    meetrijenVerwijderd,
  });

  return NextResponse.json({
    leadsVerwijderd,
    gesprekkenVerwijderd,
    demoGesprekkenVerwijderd,
    meetrijenVerwijderd,
  });
}
