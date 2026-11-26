import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { veiligInternDoel } from "@/lib/api/redirect";
import { veiligeAuthCookie } from "@/lib/supabase/cookie-opties";

/**
 * Landingsplek van auth-links uit e-mails (uitnodiging, wachtwoordherstel).
 * Route handler omdat alleen hier cookies gezet kunnen worden.
 *
 * Twee vormen:
 * 1. `token_hash` + `type` (voorkeur). Werkt op elk apparaat en ook voor
 *    uitnodigingen via de admin-API, die geen PKCE-code kunnen meesturen.
 *    Vereist dat de mailtemplates in Supabase naar
 *    `/auth/confirm?token_hash={{ .TokenHash }}&type=...` linken (zie
 *    supabase/templates/).
 * 2. `code` (PKCE). Werkt alleen in dezelfde browser waarin de link is
 *    aangevraagd; blijft ondersteund voor links die al verstuurd zijn.
 */
const TOEGESTANE_TYPES: readonly EmailOtpType[] = ["invite", "recovery", "email", "email_change"];

function isToegestaanType(type: string | null): type is EmailOtpType {
  return type !== null && (TOEGESTANE_TYPES as readonly string[]).includes(type);
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const type = params.get("type");

  // Uitnodiging en herstel landen standaard op "wachtwoord instellen".
  const standaardDoel =
    type === "invite" || type === "recovery" ? "/dashboard/wachtwoord-instellen" : "/dashboard";
  // Alleen interne paden als doel, geen open redirect.
  const doelUrl = veiligInternDoel(params.get("next"), request.nextUrl.origin, standaardDoel);
  const foutUrl = new URL("/dashboard/login?fout=link", request.nextUrl.origin);

  const metToken = tokenHash !== null && isToegestaanType(type);
  if (!metToken && !code) {
    return NextResponse.redirect(new URL("/dashboard/login", request.nextUrl.origin));
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, veiligeAuthCookie(options)),
          );
        },
      },
    },
  );

  const { error } = metToken
    ? await supabase.auth.verifyOtp({ type: type as EmailOtpType, token_hash: tokenHash! })
    : await supabase.auth.exchangeCodeForSession(code!);

  if (error) return NextResponse.redirect(foutUrl);
  return NextResponse.redirect(doelUrl);
}
