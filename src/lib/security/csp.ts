/**
 * Content-Security-Policy (OWASP A03/A05).
 *
 * Twee niveaus, omdat een nonce dynamische rendering afdwingt:
 *
 * - STRENG (nonce + 'strict-dynamic') voor /dashboard, /admin en /widget,
 *   gezet in src/proxy.ts. Daar staan persoonsgegevens en komt invoer van
 *   bezoekers binnen; alleen scripts met de nonce van dít request (en wat
 *   die zelf laden, zoals Turnstile) mogen draaien.
 * - BASIS (zonder nonce) voor de statische marketingpagina's, gezet in
 *   next.config.ts. Die blijven zo statisch en snel; ze hebben geen login,
 *   geen formulieren met data en geen gebruikersinvoer om te beschermen.
 *
 * style-src staat bewust op 'unsafe-inline' zonder nonce: React rendert
 * style-attributen (style={{...}}), en die kunnen geen nonce dragen. Met een
 * nonce in style-src negeert de browser 'unsafe-inline' en breekt de opmaak.
 * Style-injectie is een veel kleiner risico dan script-injectie.
 */

const TURNSTILE = "https://challenges.cloudflare.com";

export interface StrengeCspOpties {
  nonce: string;
  /** Wie deze pagina in een iframe mag tonen; leeg = niemand. */
  frameAncestors: string[];
  /** Turnstile (botcheck) laden en zijn iframe toestaan. Alleen de widget. */
  turnstile: boolean;
  /** Origin van Supabase, voor signed URLs van leadfoto's in het dashboard. */
  supabaseOrigin: string | null;
  isDev: boolean;
}

function samenvoegen(directives: Record<string, string[]>): string {
  return Object.entries(directives)
    .map(([naam, bronnen]) => (bronnen.length > 0 ? `${naam} ${bronnen.join(" ")}` : naam))
    .join("; ");
}

/** Origin van een URL, of null als die niet te parsen is (fail-safe: weglaten). */
export function originVan(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function bouwStrengeCsp(opties: StrengeCspOpties): string {
  const { nonce, isDev } = opties;
  const extern = opties.turnstile ? [TURNSTILE] : [];

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // In development gebruikt React eval voor betere foutmeldingen.
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(isDev ? ["'unsafe-eval'"] : []),
    ],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": [
      "'self'",
      "data:",
      "blob:",
      ...(opties.supabaseOrigin ? [opties.supabaseOrigin] : []),
    ],
    "font-src": ["'self'"],
    "connect-src": ["'self'", ...extern, ...(isDev ? ["ws:"] : [])],
    "frame-src": ["'self'", ...extern],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": opties.frameAncestors.length > 0 ? opties.frameAncestors : ["'none'"],
  };
  // Lokaal draait alles op http; upgraden zou de dev-server breken.
  if (!isDev) directives["upgrade-insecure-requests"] = [];

  return samenvoegen(directives);
}

/** Basis-CSP voor statische pagina's: geen nonce mogelijk, wel de vaste grenzen. */
export function bouwBasisCsp(isDev: boolean): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // Next.js plaatst inline bootstrap-scripts in statische HTML.
    "script-src": ["'self'", "'unsafe-inline'", ...(isDev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'"],
    "connect-src": ["'self'", ...(isDev ? ["ws:"] : [])],
    // De demo-pagina toont de eigen widget in een iframe.
    "frame-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  if (!isDev) directives["upgrade-insecure-requests"] = [];
  return samenvoegen(directives);
}

/** Cryptografisch willekeurige nonce per request (base64, 128 bits). */
export function maakNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}
