/**
 * Cookieloze bezoekersstatistieken met Plausible (EU-gehost, geen cookies,
 * geen persoonsgegevens opgeslagen). Daardoor is geen cookiebanner nodig.
 * Wel vermelden in de privacyverklaring en de subverwerkerslijst.
 *
 * Aan zetten: NEXT_PUBLIC_PLAUSIBLE_SCRIPT = de bestandsnaam van het
 * site-eigen script uit het Plausible-dashboard, bijvoorbeeld
 * "pa-AbC123xyz.js". Leeg = geen analytics, geen rewrites, geen script.
 *
 * Het script en de events lopen via ons eigen domein (rewrites in
 * next.config.ts, volgens de Vercel-proxygids van Plausible). Zo blijft het
 * eerste-partij-verkeer en is er geen extra host nodig in de CSP.
 *
 * Dit bestand heeft bewust geen imports: next.config.ts laadt het ook.
 */

/** Paden op ons eigen domein. */
export const ANALYTICS_SCRIPT_PAD = "/stats/script.js";
export const ANALYTICS_EVENT_PAD = "/stats/event";

const SCRIPT_PATROON = /^pa-[A-Za-z0-9_-]{4,64}\.js$/;

/**
 * De geconfigureerde scriptnaam, of null als analytics uit staat of de
 * waarde ongeldig is. Een ongeldige waarde zet analytics uit in plaats van
 * een willekeurige URL te proxyen.
 */
export function plausibleScript(waarde = process.env.NEXT_PUBLIC_PLAUSIBLE_SCRIPT): string | null {
  const schoon = waarde?.trim() ?? "";
  return SCRIPT_PATROON.test(schoon) ? schoon : null;
}

/** Rewrites voor next.config.ts; leeg als analytics uit staat. */
export function analyticsRewrites(
  script = plausibleScript(),
): { source: string; destination: string }[] {
  if (!script) return [];
  return [
    { source: ANALYTICS_SCRIPT_PAD, destination: `https://plausible.io/js/${script}` },
    { source: ANALYTICS_EVENT_PAD, destination: "https://plausible.io/api/event" },
  ];
}
