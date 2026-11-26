import { jwtVerify, SignJWT } from "jose";

/**
 * Signed sessietoken voor widget-gesprekken.
 *
 * Bindt session-id + tenant-id zodat niemand andermans gesprek kan
 * voortzetten: elk bericht-request moet dit token meesturen en de server
 * vertrouwt uitsluitend de claims uit het geverifieerde token — nooit
 * client-aangeleverde tenant- of sessie-id's.
 */

const ISSUER = "offerte-agent";
const AUDIENCE = "widget";
/** Korte TTL: een intakegesprek duurt minuten, geen uren. */
export const SESSION_TTL_SECONDS = 30 * 60;

export interface WidgetSessionClaims {
  /** Random sessie-id; stap 6 koppelt hier de conversation aan. */
  sessionId: string;
  tenantId: string;
  /**
   * Demo-sessie (etalagesite /demo): forceert de mock-LLM, ook als er een
   * echte ANTHROPIC_API_KEY is. Server-side gezet in de sessie-route en
   * meegetekend in het token, zodat de client het niet kan vervalsen.
   * Alleen aanwezig wanneer true (houdt bestaande tokens/claims ongewijzigd).
   */
  isDemo?: boolean;
}

function getSecret(): Uint8Array {
  const secret = process.env.WIDGET_SESSION_SECRET;
  // Bewust geen fallback-secret: liever hard falen dan ondertekenen met
  // een voorspelbare waarde.
  if (!secret || secret.length < 32) {
    throw new Error("WIDGET_SESSION_SECRET ontbreekt of is korter dan 32 tekens.");
  }
  return new TextEncoder().encode(secret);
}

export async function signSessionToken(
  claims: WidgetSessionClaims,
): Promise<{ token: string; expiresAt: Date }> {
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  const token = await new SignJWT({
    sessionId: claims.sessionId,
    tenantId: claims.tenantId,
    // Alleen meetekenen wanneer het echt een demo-sessie is, zodat normale
    // tokens bit-voor-bit identiek blijven.
    ...(claims.isDemo === true ? { isDemo: true } : {}),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(getSecret());
  return { token, expiresAt };
}

/** Geeft de claims terug, of `null` bij elk ongeldig/verlopen token. */
export async function verifySessionToken(token: string): Promise<WidgetSessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ["HS256"],
    });
    if (typeof payload.sessionId !== "string" || typeof payload.tenantId !== "string") {
      return null;
    }
    const result: WidgetSessionClaims = {
      sessionId: payload.sessionId,
      tenantId: payload.tenantId,
    };
    if (payload.isDemo === true) result.isDemo = true;
    return result;
  } catch {
    // Verlopen, vervalst of onleesbaar: behandel identiek (geen detail-lek).
    return null;
  }
}
