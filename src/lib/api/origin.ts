/**
 * Same-origin-check voor widget-API-routes.
 *
 * De chat draait in een iframe op ÓNZE origin; alle fetches naar de API
 * zijn dus same-origin. Cross-origin browser-requests (bijv. een script op
 * een willekeurige site dat onze API aanroept) worden hiermee geweigerd.
 * Headers zijn vervalsbaar buiten de browser — dit is één laag; rate
 * limiting en Turnstile (stap 8) zijn de volgende.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}
