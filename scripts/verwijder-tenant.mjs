/**
 * Een klant (tenant) volledig verwijderen bij opzegging: foto's, aanvragen,
 * gesprekken, opvolgmails, meetdata en de accounts die alleen bij deze
 * klant hoorden. Logica: src/lib/beheer/tenant-verwijderen.ts.
 * Bewust geen knop in /admin: onomkeerbaar.
 *
 * Stappen:
 *   1. Zet de klant in /admin op "inactief" (de widget stopt dan direct).
 *   2. Droogloop, toont wat er verdwijnt:
 *        node scripts/verwijder-tenant.mjs --id <tenant-uuid>
 *   3. Echt verwijderen, met de exacte klantnaam als bevestiging:
 *        node scripts/verwijder-tenant.mjs --id <tenant-uuid> --echt --bevestig "Groen & Co Hoveniers"
 *
 * Moet je nog factureren? Exporteer eerst het verbruik (scripts/kosten-per-klant.sql):
 * de meetdata gaat mee weg.
 *
 * Vereist Node 23.6 of nieuwer (laadt het TypeScript-bestand rechtstreeks).
 * Doel en sleutels zoals bij maak-tenant.mjs: standaard lokaal uit
 * .env.local, productie via SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY in de
 * omgeving van deze ene aanroep. De key wordt nooit geprint, en er worden
 * geen namen van aanvragers of e-mailadressen getoond.
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import {
  planTenantVerwijdering,
  verwijderTenant,
  VerwijderFout,
} from "../src/lib/beheer/tenant-verwijderen.ts";

const { values } = parseArgs({
  options: {
    id: { type: "string" },
    bevestig: { type: "string" },
    echt: { type: "boolean", default: false },
  },
});

function leesEnvLocal() {
  const pad = new URL("../.env.local", import.meta.url);
  if (!existsSync(pad)) return {};
  return Object.fromEntries(
    readFileSync(pad, "utf8")
      .split("\n")
      .filter((r) => r.includes("=") && !r.trim().startsWith("#"))
      .map((r) => [r.slice(0, r.indexOf("=")).trim(), r.slice(r.indexOf("=") + 1).trim()]),
  );
}

async function voer() {
  if (!values.id || !/^[0-9a-f-]{36}$/i.test(values.id)) {
    console.error("Verplicht: --id <tenant-uuid>. Zie de uitleg bovenin het script.");
    return 1;
  }
  if (values.echt && !values.bevestig) {
    console.error('Met --echt is ook --bevestig "<exacte klantnaam>" verplicht.');
    return 1;
  }

  const lokaal = leesEnvLocal();
  const url = process.env.SUPABASE_URL ?? lokaal.NEXT_PUBLIC_SUPABASE_URL;
  const sleutel = process.env.SUPABASE_SERVICE_ROLE_KEY ?? lokaal.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !sleutel) {
    console.error("SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY ontbreken.");
    return 1;
  }
  console.log(
    `Doel: ${new URL(url).host}${values.echt ? "" : "  (droogloop: er verandert niets)"}`,
  );

  const supabase = createClient(url, sleutel, { auth: { persistSession: false } });
  try {
    const plan = await planTenantVerwijdering(supabase, values.id);
    console.log(`Klant: ${plan.naam} (status: ${plan.status})`);
    console.log(
      `Verdwijnt: ${plan.aantalLeads} aanvragen, ${plan.aantalGesprekken} gesprekken, ${plan.fotoPaden.length} foto's,`,
    );
    console.log(
      `           ${plan.teVerwijderenGebruikers.length} account(s) die alleen bij deze klant horen, en de meetdata.`,
    );
    console.log(
      `Blijft:    ${plan.aantalBlijvendeGebruikers} account(s) die ook elders lid zijn of beheeraccount zijn.`,
    );
    if (plan.status !== "inactive") {
      console.log(
        'Let op: de klant staat niet op inactief. Zet hem eerst in /admin op "inactief".',
      );
    }
    if (!values.echt) return 0;

    await verwijderTenant(supabase, values.id, values.bevestig, { adminId: null, bron: "script" });
    console.log("Verwijderd. De actie staat in admin_audit (tenant_verwijderd).");
    return 0;
  } catch (fout) {
    console.error(fout instanceof VerwijderFout ? fout.message : "Verwijderen mislukt.");
    return 1;
  }
}

process.exitCode = await voer();
