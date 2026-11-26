import type { CookieOptions } from "@supabase/ssr";

/**
 * Sessie verloopt na 7 dagen zonder activiteit. Supabase ververst het token
 * ongeveer elk uur en zet het cookie dan opnieuw, dus wie actief is blijft
 * ingelogd. De standaard van @supabase/ssr is 400 dagen; te lang voor een
 * dashboard met klantgegevens.
 */
export const SESSIE_MAX_LEEFTIJD_SECONDEN = 7 * 24 * 60 * 60;

/**
 * Harde instellingen voor de auth-cookies van Supabase, toegepast in elke
 * setAll-callback (server.ts, proxy.ts, auth/confirm).
 *
 * - httpOnly: deze app heeft geen Supabase-client in de browser; alleen de
 *   server leest de sessie. Zo kan een eventueel XSS-lek het token niet
 *   uitlezen. (Standaard van @supabase/ssr: false.)
 * - secure: alleen over HTTPS in productie. Browsers staan Secure-cookies
 *   op http://localhost toe, maar `next dev` laten we vrij.
 * - maxAge: begrensd tot SESSIE_MAX_LEEFTIJD_SECONDEN. De bibliotheek zet
 *   zelf altijd 400 dagen, ook als je cookieOptions meegeeft. Een maxAge
 *   van 0 (cookie verwijderen) blijft 0.
 */
export function veiligeAuthCookie(opties: CookieOptions = {}): CookieOptions {
  const maxAge =
    opties.maxAge === 0
      ? 0
      : Math.min(opties.maxAge ?? SESSIE_MAX_LEEFTIJD_SECONDEN, SESSIE_MAX_LEEFTIJD_SECONDEN);
  return {
    ...opties,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: opties.path ?? "/",
    maxAge,
  };
}
