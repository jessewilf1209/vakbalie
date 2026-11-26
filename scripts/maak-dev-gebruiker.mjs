/**
 * Maakt een lokale dashboard-testgebruiker aan en koppelt die aan de
 * seed-tenant "Groen & Co Hoveniers" (uitnodiging-only: accounts ontstaan
 * alleen via admin).
 *
 * ALLEEN voor de lokale stack:  node scripts/maak-dev-gebruiker.mjs
 * Leest .env.local; weigert te draaien tegen niet-lokale URL's.
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

const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const EMAIL = "dev@offerte-agent.test";
const WACHTWOORD = "lokaal-dev-wachtwoord-123";
const TENANT_ID = "00000000-0000-0000-0000-000000000001";

const { data: created, error } = await admin.auth.admin.createUser({
  email: EMAIL,
  password: WACHTWOORD,
  email_confirm: true,
});

let userId = created?.user?.id;
if (error) {
  if (!`${error.message}`.includes("already")) {
    console.error("Aanmaken mislukt:", error.message);
    process.exit(1);
  }
  const { data: lijst } = await admin.auth.admin.listUsers();
  userId = lijst.users.find((u) => u.email === EMAIL)?.id;
}

const { error: koppelFout } = await admin
  .from("tenant_users")
  .upsert(
    { tenant_id: TENANT_ID, user_id: userId, role: "owner" },
    { onConflict: "tenant_id,user_id" },
  );
if (koppelFout) {
  console.error("Koppelen mislukt:", koppelFout.message);
  process.exit(1);
}

console.log(`Dev-gebruiker klaar: ${EMAIL} / ${WACHTWOORD} (gekoppeld aan Groen & Co)`);
