import { escapeHtml } from "@/lib/email/nieuwe-lead-template";

/**
 * Helpers voor de inline-embed modus.
 *
 * Dezelfde widget-route (`/widget/[tenantKey]`) rendert in twee modi:
 * - bubble (default): zwevend paneel, geopend via de loader-knop.
 * - embed: volledig chatvenster middenin een pagina, zonder sluitknop.
 *
 * De keuze komt uit de query (`?mode=embed`); server-side gevalideerd zodat
 * een onbekende waarde altijd veilig terugvalt op bubble.
 */

export const EMBED_QUERY_WAARDE = "embed";

/** Toegestane iframe-hoogte voor de embed (px). Buiten bereik ⇒ default. */
export const EMBED_HOOGTE_MIN = 360;
export const EMBED_HOOGTE_MAX = 1200;
export const EMBED_HOOGTE_DEFAULT = 640;

export function isEmbedMode(mode: string | string[] | undefined): boolean {
  return mode === EMBED_QUERY_WAARDE;
}

/**
 * Klemt een door de klant opgegeven hoogte binnen veilige grenzen. Ongeldige
 * of ontbrekende waardes geven de default. (De loader `public/embed.js`
 * dupliceert deze logica in plain JS; houd de grenzen in sync.)
 */
export function clampEmbedHoogte(waarde: number | string | null | undefined): number {
  const n = typeof waarde === "string" ? Number.parseInt(waarde, 10) : (waarde ?? NaN);
  if (!Number.isFinite(n)) return EMBED_HOOGTE_DEFAULT;
  return Math.min(EMBED_HOOGTE_MAX, Math.max(EMBED_HOOGTE_MIN, Math.trunc(n)));
}

/**
 * Bouwt de kant-en-klare inline-embed snippet voor in het dashboard.
 *
 * Bevat bewust een statische fallback (mailto) ín de container: die werkt
 * zónder JavaScript en voor screenreaders, en wordt door `embed.js`
 * vervangen door het chat-iframe zodra JavaScript laadt (progressive
 * enhancement). Zo gaat er nooit verkeer verloren — ook niet van betaalde
 * advertentieklikken op een landingspagina.
 */
export function buildEmbedSnippet(opts: {
  appUrl: string;
  tenantKey: string;
  contactEmail: string;
}): string {
  const basis = opts.appUrl.replace(/\/+$/, "");
  const key = escapeHtml(opts.tenantKey);
  const mail = escapeHtml(opts.contactEmail);
  const src = escapeHtml(`${basis}/embed.js`);
  return [
    `<div data-offerte-agent-embed data-tenant-key="${key}">`,
    `  <!-- Statische fallback: werkt zonder JavaScript. Pas de tekst gerust aan. -->`,
    `  <p>Liever direct contact? Mail ons op <a href="mailto:${mail}">${mail}</a>.</p>`,
    `</div>`,
    `<script src="${src}" async></script>`,
  ].join("\n");
}
