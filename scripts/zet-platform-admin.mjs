/**
 * Beheert het platform-admin-account.
 *
 * Gebruik (standaard een droogloop; pas met --echt verandert er iets):
 *
 *   node scripts/zet-platform-admin.mjs <email>                 vlag zetten
 *   node scripts/zet-platform-admin.mjs <email> --uitnodigen    account eerst uitnodigen
 *   node scripts/zet-platform-admin.mjs <email> --intrekken     vlag intrekken
 *   node scripts/zet-platform-admin.mjs <email> --mfa-reset     MFA-factoren wissen (telefoon kwijt)
 *   ... --echt                                                  daadwerkelijk uitvoeren
 *
 * Doel: standaard de lokale stack uit .env.local. Voor productie zet je
 * SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY in de omgeving van deze ene
 * aanroep; de key komt nooit in een bestand en wordt nooit geprint.
 *
 * Het admin-account mag geen lid zijn van een tenant. Het script weigert
 * dan, en is_platform_admin() zou zo'n account sowieso afwijzen.
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";

const args = process.argv.slice(2);
const email = args
  .find((a) => !a.startsWith("--"))
  ?.trim()
  .toLowerCase();
const echt = args.includes("--echt");
const intrekken = args.includes("--intrekken");
const mfaReset = args.includes("--mfa-reset");
const uitnodigen = args.includes("--uitnodigen");

if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error(
    "Gebruik: node scripts/zet-platform-admin.mjs <email> [--uitnodigen|--intrekken|--mfa-reset] [--echt]",
  );
  process.exit(1);
}
if ([intrekken, mfaReset, uitnodigen].filter(Boolean).length > 1) {
  console.error("Kies één actie tegelijk.");
  process.exit(1);
}

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

const lokaal = leesEnvLocal();
const url = process.env.SUPABASE_URL ?? lokaal.NEXT_PUBLIC_SUPABASE_URL;
const sleutel = process.env.SUPABASE_SERVICE_ROLE_KEY ?? lokaal.SUPABASE_SERVICE_ROLE_KEY;
const appUrl = process.env.APP_URL ?? lokaal.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
if (!url || !sleutel) {
  console.error("SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY ontbreken.");
  process.exit(1);
}

console.log(`Doel: ${new URL(url).host}${echt ? "" : "  (droogloop: er verandert niets)"}`);

const supabase = createClient(url, sleutel, { auth: { persistSession: false } });

async function zoekGebruiker() {
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`gebruikers ophalen mislukt: ${error.message}`);
    const gevonden = data.users.find((u) => u.email?.toLowerCase() === email);
    if (gevonden || data.users.length < 1000) return gevonden ?? null;
  }
  return null;
}

// process.exitCode in plaats van process.exit(): dat laatste breekt op Windows
// soms af terwijl netwerkhandles nog sluiten.
async function voer() {
  let gebruiker = await zoekGebruiker();

  if (!gebruiker) {
    if (!uitnodigen) {
      console.error("Geen account met dit adres. Gebruik --uitnodigen om het aan te maken.");
      return 1;
    }
    if (!echt) {
      console.log(`Zou ${email} uitnodigen en daarna de adminvlag zetten.`);
      return 0;
    }
    const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${appUrl}/auth/confirm?next=/dashboard/wachtwoord-instellen`,
    });
    if (error) {
      console.error("Uitnodigen mislukt:", error.message);
      return 1;
    }
    gebruiker = data.user;
    console.log("Uitnodiging verstuurd. Na het instellen van het wachtwoord: ga naar /admin.");
  }

  const { count: lidmaatschappen, error: lidFout } = await supabase
    .from("tenant_users")
    .select("id", { count: "exact", head: true })
    .eq("user_id", gebruiker.id);
  if (lidFout) {
    console.error("Tenantkoppeling controleren mislukt:", lidFout.message);
    return 1;
  }
  if ((lidmaatschappen ?? 0) > 0 && !intrekken && !mfaReset) {
    console.error(
      "Weigert: dit account is lid van een tenant. Gebruik een apart adres voor beheer.",
    );
    return 1;
  }

  if (mfaReset) {
    const { data, error } = await supabase.auth.admin.mfa.listFactors({ userId: gebruiker.id });
    if (error) {
      console.error("Factoren ophalen mislukt:", error.message);
      return 1;
    }
    console.log(`${data.factors.length} MFA-factor(en) gevonden.`);
    if (!echt) return 0;
    for (const factor of data.factors) {
      const { error: wisFout } = await supabase.auth.admin.mfa.deleteFactor({
        id: factor.id,
        userId: gebruiker.id,
      });
      if (wisFout) {
        console.error("Wissen mislukt:", wisFout.message);
        return 1;
      }
    }
    console.log("Gewist. Bij de volgende login stel je MFA opnieuw in.");
    return 0;
  }

  const nieuw = !intrekken;
  const huidig = gebruiker.app_metadata?.platform_admin === true;
  console.log(`Adminvlag nu: ${huidig ? "aan" : "uit"}, wordt: ${nieuw ? "aan" : "uit"}.`);
  if (!echt || huidig === nieuw) return 0;

  // Expliciet false bij intrekken: is_platform_admin() eist precies true.
  const { error } = await supabase.auth.admin.updateUserById(gebruiker.id, {
    app_metadata: { ...gebruiker.app_metadata, platform_admin: nieuw },
  });
  if (error) {
    console.error("Bijwerken mislukt:", error.message);
    return 1;
  }
  console.log("Klaar. Intrekken werkt direct: de database leest de vlag live.");
  return 0;
}

process.exitCode = await voer();
