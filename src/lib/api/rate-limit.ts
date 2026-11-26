import "server-only";
import { createHash } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Rate limiting via Postgres.
 *
 * - IP's worden uitsluitend gehasht opgeslagen (SHA-256 + server-side
 *   salt) en de rijen zijn kortlevend — geen herleidbare IP's in de
 *   database (AVG).
 * - Fail-closed: kan de teller niet worden bijgewerkt, dan weigeren we.
 *   De routes zijn toch al database-afhankelijk; liever even dicht dan
 *   een onbeschermd AI-budget.
 */

export interface RateLimitRegel {
  sleutel: string;
  /** Max aantal aanroepen binnen het venster. */
  limiet: number;
  vensterSeconden: number;
}

/** Platform-defaults; later per tenant/pakket configureerbaar. */
export const RATE_LIMITS = {
  /**
   * Nieuwe sessies per IP per uur. Ruim, want de inline-embed opent een
   * sessie bij elke paginaweergave. Een sessie kost geen AI; de AI-kosten
   * worden begrensd door de bericht-limieten en de dagrem.
   */
  sessiesPerIpPerUur: 60,
  /** Nieuwe gesprekken (eerste bezoekersbericht) per tenant per dag (laag 4). */
  gesprekkenPerTenantPerDag: 200,
  /** Berichten per sessie per minuut. */
  berichtenPerSessiePerMinuut: 10,
  /** Berichten per IP per 10 minuten (dekt sessie-rotatie af). */
  berichtenPerIpPer10Min: 60,
  /** Foto-uploads per sessie per 10 minuten. */
  fotosPerSessiePer10Min: 8,
  /**
   * AI-opvolgvoorstellen per tenant per uur. Dit is een
   * ingelogde dashboardactie, dus geen botbescherming: de grens dient
   * kostenbeheersing en vangt een dubbelklik of loop af.
   */
  opvolgGeneratiesPerTenantPerUur: 30,
  /**
   * Verstuurde opvolgmails per tenant per uur. Elke mail gaat via ons
   * geverifieerde domein naar een derde; zonder grens is een gekaapt of
   * kwaadwillend tenantaccount een spamkanaal dat onze afzenderreputatie
   * (en daarmee de mail van álle klanten) sloopt.
   */
  opvolgmailsPerTenantPerUur: 20,
  /** Testmails vanuit Instellingen per tenant per uur. */
  testmailsPerTenantPerUur: 5,
  /**
   * Inlogpogingen. Per IP én per
   * account: per IP alleen is te omzeilen met veel adressen, per account
   * alleen laat één IP alle accounts afgaan. De accountgrens is ruim genoeg
   * dat een aanvaller iemand niet makkelijk buitensluit.
   */
  loginPogingenPerIpPer15Min: 20,
  loginPogingenPerAccountPer15Min: 10,
  /** MFA-codes per gebruiker per 5 minuten: 6 cijfers raden mag niet lonen. */
  mfaPogingenPerGebruikerPer5Min: 5,
  herstelAanvragenPerIpPerUur: 10,
  herstelAanvragenPerAccountPerUur: 3,
} as const;

/**
 * Client-IP uit de proxy-headers (Vercel zet x-forwarded-for). Alleen voor
 * hashing — wordt nergens rauw gelogd of opgeslagen.
 */
export function getClientIp(request: Request): string {
  return getClientIpUitHeaders(request.headers);
}

/** Zelfde als `getClientIp`, voor server actions (via `headers()`). */
export function getClientIpUitHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return headers.get("x-real-ip") ?? "onbekend";
}

/** SHA-256 met salt afgeleid van het server-secret; nooit het rauwe IP. */
export function hashIp(ip: string): string {
  return hashWaarde("ip", ip);
}

/**
 * Gezouten hash voor een rate-limitsleutel, zodat er geen IP of e-mailadres
 * leesbaar in `rate_limits` staat. `soort` scheidt de naamruimtes.
 */
export function hashWaarde(soort: string, waarde: string): string {
  const salt = process.env.WIDGET_SESSION_SECRET ?? "";
  return createHash("sha256").update(`${salt}:${soort}:${waarde}`).digest("hex").slice(0, 32);
}

/**
 * Controleert alle regels (atomair verhogen + lezen). `true` = toegestaan.
 * Bij een database-fout: fail-closed (`false`).
 */
export async function checkRateLimits(regels: RateLimitRegel[]): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  for (const regel of regels) {
    const { data, error } = await supabase.rpc("verhoog_rate_limit", {
      p_sleutel: regel.sleutel,
      p_venster_seconden: regel.vensterSeconden,
    });
    if (error || typeof data !== "number") {
      console.error("rate-limit-check mislukt", { code: error?.code });
      return false;
    }
    if (data > regel.limiet) {
      // Geen persoonsgegevens in het log: de sleutel bevat alleen hashes/id's.
      console.warn("rate-limit bereikt", { sleutel: regel.sleutel });
      return false;
    }
  }
  return true;
}
