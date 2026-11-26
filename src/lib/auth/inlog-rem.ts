import "server-only";
import { headers } from "next/headers";
import {
  checkRateLimits,
  getClientIpUitHeaders,
  hashIp,
  hashWaarde,
  RATE_LIMITS,
} from "@/lib/api/rate-limit";

/**
 * Eigen rem op inlogpogingen, vóór
 * Supabase Auth wordt aangeroepen. Supabase heeft zelf een limiet per IP,
 * maar onze server roept Supabase aan, dus die limiet ziet vooral het IP van
 * Vercel. Fail-closed, net als de andere rate limits.
 *
 * Sleutels bevatten alleen gezouten hashes: geen IP of e-mailadres in de
 * database.
 */
const VIJFTIEN_MINUTEN = 900;
const VIJF_MINUTEN = 300;

export async function inlogPogingToegestaan(email: string): Promise<boolean> {
  const ip = getClientIpUitHeaders(await headers());
  return checkRateLimits([
    {
      sleutel: `login:ip:${hashIp(ip)}`,
      limiet: RATE_LIMITS.loginPogingenPerIpPer15Min,
      vensterSeconden: VIJFTIEN_MINUTEN,
    },
    {
      sleutel: `login:account:${hashWaarde("email", email.trim().toLowerCase())}`,
      limiet: RATE_LIMITS.loginPogingenPerAccountPer15Min,
      vensterSeconden: VIJFTIEN_MINUTEN,
    },
  ]);
}

/**
 * Rem op wachtwoord-vergeten-aanvragen. Zonder rem kan iemand via ons
 * formulier een mailbox volspammen en de verzendreputatie van het domein
 * schaden. Supabase heeft een eigen limiet, maar die geldt per project,
 * niet per adres.
 */
export async function herstelAanvraagToegestaan(email: string): Promise<boolean> {
  const ip = getClientIpUitHeaders(await headers());
  return checkRateLimits([
    {
      sleutel: `herstel:ip:${hashIp(ip)}`,
      limiet: RATE_LIMITS.herstelAanvragenPerIpPerUur,
      vensterSeconden: 3600,
    },
    {
      sleutel: `herstel:account:${hashWaarde("email", email.trim().toLowerCase())}`,
      limiet: RATE_LIMITS.herstelAanvragenPerAccountPerUur,
      vensterSeconden: 3600,
    },
  ]);
}

/** Rem op het invoeren van MFA-codes, per gebruiker. */
export async function mfaPogingToegestaan(userId: string): Promise<boolean> {
  return checkRateLimits([
    {
      sleutel: `mfa:gebruiker:${userId}`,
      limiet: RATE_LIMITS.mfaPogingenPerGebruikerPer5Min,
      vensterSeconden: VIJF_MINUTEN,
    },
  ]);
}
