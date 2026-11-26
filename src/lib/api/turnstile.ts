import "server-only";

/**
 * Cloudflare Turnstile, achter een feature-flag: zonder
 * TURNSTILE_SECRET_KEY staat de check uit en bouwt/test alles zonder
 * Cloudflare-account. Mét key wordt een geldig token verplicht vóór de
 * eerste LLM-call (sessie-uitgifte) — beschermt het AI-budget tegen bots.
 */

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export function turnstileActief(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY);
}

/** `true` = mens (of check staat uit). Fail-closed bij verificatiefouten. */
export async function verifyTurnstileToken(
  token: string | undefined,
  ip: string,
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // feature-flag uit

  if (!token) return false;

  try {
    const params = new URLSearchParams({ secret, response: token });
    if (ip !== "onbekend") params.set("remoteip", ip);

    const res = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    });
    if (!res.ok) return false;
    const data: { success?: boolean } = await res.json();
    return data.success === true;
  } catch {
    return false;
  }
}
