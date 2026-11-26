/**
 * Nieuwe klant aanmaken. Zelfde logica
 * als "Nieuwe klant" in /admin: src/lib/beheer/tenantbeheer.ts.
 *
 * Gebruik (standaard een droogloop; pas met --echt gebeurt er iets):
 *
 *   node scripts/maak-tenant.mjs \
 *     --naam "Groen & Co Hoveniers" \
 *     --contact info@groenco.nl \
 *     --eigenaar jan@groenco.nl \
 *     --domeinen "https://groenco.nl,https://www.groenco.nl" \
 *     [--status trial|active] [--echt]
 *
 * Vereist Node 23.6 of nieuwer (laadt het TypeScript-bestand rechtstreeks).
 * Doel en sleutels zoals bij zet-platform-admin.mjs: standaard lokaal uit
 * .env.local, productie via SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY in de
 * omgeving van deze ene aanroep. De key wordt nooit geprint.
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { BeheerFout, maakTenant, normaliseerOrigins } from "../src/lib/beheer/tenantbeheer.ts";

const { values } = parseArgs({
  options: {
    naam: { type: "string" },
    contact: { type: "string" },
    eigenaar: { type: "string" },
    domeinen: { type: "string", default: "" },
    status: { type: "string", default: "trial" },
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
  if (!values.naam || !values.contact || !values.eigenaar) {
    console.error("Verplicht: --naam, --contact en --eigenaar. Zie de uitleg bovenin het script.");
    return 1;
  }

  const lokaal = leesEnvLocal();
  const url = process.env.SUPABASE_URL ?? lokaal.NEXT_PUBLIC_SUPABASE_URL;
  const sleutel = process.env.SUPABASE_SERVICE_ROLE_KEY ?? lokaal.SUPABASE_SERVICE_ROLE_KEY;
  const appUrl = process.env.APP_URL ?? lokaal.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  if (!url || !sleutel) {
    console.error("SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY ontbreken.");
    return 1;
  }

  console.log(
    `Doel: ${new URL(url).host}${values.echt ? "" : "  (droogloop: er verandert niets)"}`,
  );

  const origins = normaliseerOrigins(values.domeinen, { staLokaalToe: false });
  for (const w of origins.waarschuwingen) console.warn(`Let op: ${w}`);
  if (!origins.ok) {
    for (const f of origins.fouten) console.error(f);
    return 1;
  }
  console.log(`Klant: ${values.naam} (${values.status}), eigenaar ${values.eigenaar}`);
  console.log(`Domeinen: ${origins.origins.join(", ") || "(geen; de widget werkt dan nergens)"}`);
  if (!values.echt) return 0;

  const supabase = createClient(url, sleutel, { auth: { persistSession: false } });
  try {
    const r = await maakTenant(
      supabase,
      {
        naam: values.naam,
        contactEmail: values.contact,
        eigenaarEmail: values.eigenaar,
        status: values.status,
        origins: origins.origins,
      },
      {
        adminId: null,
        bron: "script",
        uitnodigingRedirect: `${appUrl}/auth/confirm?next=/dashboard/wachtwoord-instellen`,
      },
    );
    console.log(
      `Aangemaakt: ${r.tenantId}. ${r.uitgenodigd ? "Uitnodiging verstuurd." : "Bestaand account gekoppeld."}`,
    );
    return 0;
  } catch (fout) {
    console.error(fout instanceof BeheerFout ? fout.message : "Aanmaken mislukt.");
    return 1;
  }
}

process.exitCode = await voer();
