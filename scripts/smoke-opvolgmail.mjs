/**
 * Smoke-test voor de opvolgmail-historie.
 *
 * Bewijst tegen de échte lokale database wat unit tests met mocks niet
 * kunnen aantonen: de RLS-policy en GRANTs op lead_opvolgmails, isolatie
 * tussen tenants, en de cascade-verwijdering bij een AVG-verzoek.
 *
 * ALLEEN voor de lokale stack:  node scripts/smoke-opvolgmail.mjs
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
// Service-role omzeilt RLS: nodig om een tweede tenant te kunnen opvoeren
// en om te controleren wat er ná een cascade écht nog in de tabel staat.
const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, {
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

// Eigen lead van de ingelogde gebruiker.
const { data: eigenLead } = await supabase
  .from("leads")
  .select("id, tenant_id")
  .limit(1)
  .maybeSingle();
if (!eigenLead) {
  console.error("Geen lead in de lokale database. Draai eerst: pnpm exec supabase db reset");
  process.exit(1);
}

// 1. Schrijven en teruglezen binnen de eigen tenant
const insert = await supabase
  .from("lead_opvolgmails")
  .insert({
    tenant_id: eigenLead.tenant_id,
    lead_id: eigenLead.id,
    onderwerp: "Smoke-test",
    tekst: "Testbericht uit smoke-opvolgmail.mjs",
  })
  .select("id")
  .maybeSingle();
check("insert in eigen tenant", !insert.error && !!insert.data?.id, insert.error?.message);

const gelezen = await supabase
  .from("lead_opvolgmails")
  .select("id, onderwerp")
  .eq("lead_id", eigenLead.id);
check(
  "teruglezen in eigen tenant",
  !gelezen.error && (gelezen.data?.length ?? 0) > 0,
  gelezen.error?.message,
);

// 2. Isolatie: rij van een ándere tenant is onzichtbaar én onschrijfbaar
const { data: vreemdeTenant } = await admin
  .from("tenants")
  .select("id")
  .neq("id", eigenLead.tenant_id)
  .limit(1)
  .maybeSingle();
const { data: vreemdeLead } = vreemdeTenant
  ? await admin
      .from("leads")
      .select("id, tenant_id")
      .eq("tenant_id", vreemdeTenant.id)
      .limit(1)
      .maybeSingle()
  : { data: null };

if (vreemdeLead) {
  const vreemdeRij = await admin
    .from("lead_opvolgmails")
    .insert({
      tenant_id: vreemdeLead.tenant_id,
      lead_id: vreemdeLead.id,
      onderwerp: "Van een andere tenant",
      tekst: "Mag de dev-gebruiker nooit zien",
    })
    .select("id")
    .maybeSingle();

  const zichtbaar = await supabase
    .from("lead_opvolgmails")
    .select("id")
    .eq("id", vreemdeRij.data.id)
    .maybeSingle();
  check("rij van andere tenant onzichtbaar", !zichtbaar.error && zichtbaar.data === null);

  const stiekemSchrijven = await supabase.from("lead_opvolgmails").insert({
    tenant_id: vreemdeLead.tenant_id,
    lead_id: vreemdeLead.id,
    onderwerp: "Injectiepoging",
    tekst: "Schrijven naar een vreemde tenant hoort te falen",
  });
  check(
    "schrijven naar andere tenant geweigerd",
    !!stiekemSchrijven.error,
    stiekemSchrijven.error?.code ?? "GEEN FOUT (policy lek!)",
  );

  // Eigen tenant_id maar een lead van iemand anders: de insert-policy eist
  // dat de lead écht bij de eigen tenant hoort.
  const vreemdeLeadEigenTenant = await supabase.from("lead_opvolgmails").insert({
    tenant_id: eigenLead.tenant_id,
    lead_id: vreemdeLead.id,
    onderwerp: "Gekaapte lead-verwijzing",
    tekst: "Eigen tenant_id, vreemde lead_id",
  });
  check(
    "rij hangen aan lead van andere tenant geweigerd",
    !!vreemdeLeadEigenTenant.error,
    vreemdeLeadEigenTenant.error?.code ?? "GEEN FOUT (policy lek!)",
  );

  await admin.from("lead_opvolgmails").delete().eq("id", vreemdeRij.data.id);
} else {
  console.log("ℹ️  geen tweede tenant met lead in de lokale db — isolatietest overgeslagen");
}

// 3. Cascade: lead verwijderen ruimt de opvolghistorie mee op (AVG)
const proefLead = await admin
  .from("leads")
  .insert({ tenant_id: eigenLead.tenant_id, contact_name: "Cascade Test", status: "new" })
  .select("id")
  .maybeSingle();

if (proefLead.data) {
  await admin.from("lead_opvolgmails").insert({
    tenant_id: eigenLead.tenant_id,
    lead_id: proefLead.data.id,
    onderwerp: "Wordt straks mee verwijderd",
    tekst: "Cascade-bewijs",
  });

  await admin.from("leads").delete().eq("id", proefLead.data.id);

  const resten = await admin.from("lead_opvolgmails").select("id").eq("lead_id", proefLead.data.id);
  check(
    "cascade: opvolgmails weg na lead-verwijdering",
    !resten.error && (resten.data?.length ?? 0) === 0,
    `${resten.data?.length ?? "?"} rest(en)`,
  );
} else {
  check("cascade-test kon geen proeflead maken", false, proefLead.error?.message);
}

// Eigen testrij weer opruimen.
if (insert.data?.id) await admin.from("lead_opvolgmails").delete().eq("id", insert.data.id);

process.exit(fouten === 0 ? 0 : 1);
