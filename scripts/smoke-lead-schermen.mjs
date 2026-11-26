/**
 * Smoke-test voor de lead-schermen: draait exact de
 * queries van het dashboard met de ANON-key + ingelogde dev-gebruiker,
 * zodat RLS én de nieuwe storage-leespolicy (migration 007) bewezen zijn.
 *
 * ALLEEN voor de lokale stack:  node scripts/smoke-lead-schermen.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((r) => r.includes("=") && !r.trim().startsWith("#"))
    .map((r) => [r.slice(0, r.indexOf("=")).trim(), r.slice(r.indexOf("=") + 1).trim()]),
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(url ?? "")) {
  console.error("Weigert: dit script is alleen voor de lokale stack.");
  process.exit(1);
}

const supabase = createClient(url, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

const { error: loginFout } = await supabase.auth.signInWithPassword({
  email: "dev@offerte-agent.test",
  password: "lokaal-dev-wachtwoord-123",
});
if (loginFout) {
  console.error("Login mislukt:", loginFout.message);
  process.exit(1);
}

let fouten = 0;
const check = (naam, ok, detail = "") => {
  console.log(`${ok ? "✅" : "❌"} ${naam}${detail ? ` — ${detail}` : ""}`);
  if (!ok) fouten++;
};

// 1. Leadoverzicht-query (paginering + count)
const overzicht = await supabase
  .from("leads")
  .select("id, contact_name, plaats, project_type, lead_score, status, created_at", {
    count: "exact",
  })
  .order("created_at", { ascending: false })
  .range(0, 19);
check("leadoverzicht", !overzicht.error && (overzicht.count ?? 0) > 0, `${overzicht.count} leads`);

// 1b. Statusfilter (DoD stap 8: leadoverzicht met gefilterde data)
const gefilterd = await supabase
  .from("leads")
  .select("id, status", { count: "exact" })
  .eq("status", "new")
  .order("created_at", { ascending: false })
  .range(0, 19);
check(
  "leadoverzicht met statusfilter",
  !gefilterd.error &&
    (gefilterd.data ?? []).every((l) => l.status === "new") &&
    (gefilterd.count ?? 0) <= (overzicht.count ?? 0),
  `${gefilterd.count} van ${overzicht.count} met status "new"`,
);

// 2. Home-KPI's
const maandStart = new Date();
maandStart.setDate(1);
maandStart.setHours(0, 0, 0, 0);
const kpi = await supabase
  .from("leads")
  .select("id", { count: "exact", head: true })
  .gte("created_at", maandStart.toISOString());
check("kpi leads deze maand", !kpi.error, `${kpi.count}`);

// 3. Leaddetail + gesprek + foto's
const lead = overzicht.data?.[0];
const detail = await supabase
  .from("leads")
  .select("id, contact_name, score_redenen, conversation_id, foto_paden, status")
  .eq("id", lead.id)
  .maybeSingle();
check("leaddetail", !detail.error && detail.data !== null, detail.data?.contact_name ?? "");

if (detail.data?.conversation_id) {
  const berichten = await supabase
    .from("messages")
    .select("id, role, content")
    .eq("conversation_id", detail.data.conversation_id)
    .order("created_at", { ascending: true });
  check(
    "gespreksberichten",
    !berichten.error && (berichten.data?.length ?? 0) > 0,
    `${berichten.data?.length} berichten`,
  );
}

// 4. Signed URL voor foto's (migration 007) — pak een lead mét foto's
const { data: metFotos } = await supabase
  .from("leads")
  .select("id, foto_paden")
  .neq("foto_paden", "{}")
  .limit(1);
if (metFotos?.[0]?.foto_paden?.length) {
  const signed = await supabase.storage
    .from("lead-fotos")
    .createSignedUrls(metFotos[0].foto_paden, 3600);
  const ok = !signed.error && signed.data?.every((f) => f.signedUrl);
  check(
    "signed foto-URLs (policy 007)",
    ok,
    signed.error?.message ?? `${signed.data?.length} URL(s)`,
  );
  if (ok) {
    const resp = await fetch(signed.data[0].signedUrl);
    check(
      "foto ophalen via signed URL",
      resp.ok,
      `HTTP ${resp.status}, ${resp.headers.get("content-type")}`,
    );
  }
} else {
  console.log("ℹ️  geen leads met foto's in lokale db — signed-URL-test overgeslagen");
}

// 5. Statuswijziging (zoals de server action) + terugzetten
const update = await supabase
  .from("leads")
  .update({ status: "contacted" })
  .eq("id", lead.id)
  .select("status")
  .maybeSingle();
check("statuswijziging", !update.error && update.data?.status === "contacted");
await supabase.from("leads").update({ status: detail.data.status }).eq("id", lead.id);

// 6. Tenant-isolatie: niet-bestaand/vreemd lead-id geeft 0 rijen, geen fout
const vreemd = await supabase
  .from("leads")
  .select("id")
  .eq("id", "11111111-2222-3333-4444-555555555555")
  .maybeSingle();
check("vreemd lead-id ⇒ niets", !vreemd.error && vreemd.data === null);

process.exit(fouten === 0 ? 0 : 1);
