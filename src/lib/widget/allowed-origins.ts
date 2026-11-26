/**
 * Frame-ancestors voor de widget-route.
 *
 * De widget-pagina mag — anders dan de rest van de app (X-Frame-Options:
 * DENY) — wél in een iframe, maar uitsluitend op origins die de tenant
 * heeft geregistreerd (tenants.allowed_origins). Buiten productie zijn
 * lokale origins toegestaan voor de embed-testpagina.
 *
 * Veilige default: bij een onbekende key, inactieve tenant of database-fout
 * valt dit terug op alleen 'self' — embedding op derden-sites staat dan dicht.
 */
import { findTenantByWidgetKey } from "./tenant-lookup";

/**
 * Alleen exacte http(s)-origins uit de database accepteren; alles met
 * spaties, puntkomma's of paden zou de CSP-header kunnen manipuleren.
 */
const CSP_ORIGIN_PATTERN = /^https?:\/\/[a-z0-9.-]+(:\d{1,5})?$/i;

export function isValidCspOrigin(origin: string): boolean {
  return CSP_ORIGIN_PATTERN.test(origin);
}

export async function getAllowedFrameAncestors(tenantKey: string): Promise<string[]> {
  const devOrigins =
    process.env.NODE_ENV !== "production" ? ["http://localhost:*", "http://127.0.0.1:*"] : [];

  let tenantOrigins: string[] = [];
  try {
    const tenant = await findTenantByWidgetKey(tenantKey);
    tenantOrigins = (tenant?.allowedOrigins ?? []).filter(isValidCspOrigin);
  } catch {
    // Database onbereikbaar/niet geconfigureerd: veilige default.
  }

  return ["'self'", ...tenantOrigins, ...devOrigins];
}
