import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { bouwStrengeCsp, maakNonce, originVan } from "@/lib/security/csp";
import { veiligeAuthCookie } from "@/lib/supabase/cookie-opties";
import { getAllowedFrameAncestors } from "@/lib/widget/allowed-origins";

/**
 * Taken (Next 16 proxy-conventie):
 * 1. Strenge CSP met een nonce per request op /widget, /dashboard en /admin
 *    (src/lib/security/csp.ts). Next.js leest de nonce uit de CSP-header
 *    van het request en zet hem zelf op zijn scripts; de layouts van deze
 *    routes forceren daarvoor dynamische rendering.
 * 2. /widget: frame-ancestors per tenant (de globale X-Frame-Options: DENY
 *    geldt bewust níét voor /widget; deze CSP is de strengere vervanger).
 * 3. /dashboard: sessie verversen en niet-ingelogde gebruikers naar de
 *    loginpagina sturen. Dit is alleen de poort — de échte autorisatie
 *    komt uit RLS.
 * 4. /admin: alleen sessie verversen; de adminguard beslist.
 */
export async function proxy(request: NextRequest) {
  const pad = request.nextUrl.pathname;
  const isWidget = pad.startsWith("/widget");

  const csp = bouwStrengeCsp({
    nonce: maakNonce(),
    frameAncestors: isWidget ? await getAllowedFrameAncestors(pad.split("/")[2] ?? "") : [],
    turnstile: isWidget,
    supabaseOrigin: isWidget ? null : originVan(process.env.NEXT_PUBLIC_SUPABASE_URL),
    isDev: process.env.NODE_ENV === "development",
  });

  /**
   * Een nieuwe "ga door"-response met de CSP op het request. Wordt opnieuw
   * aangeroepen nadat Supabase cookies op het request zette: de headers
   * worden dan vers gekopieerd, zodat zowel de cookies als de CSP meegaan.
   */
  const volgende = () => {
    const headers = new Headers(request.headers);
    headers.set("Content-Security-Policy", csp);
    return NextResponse.next({ request: { headers } });
  };
  const metCsp = (response: NextResponse) => {
    response.headers.set("Content-Security-Policy", csp);
    return response;
  };

  if (isWidget) return metCsp(volgende());

  // /dashboard en /admin: sessie-cookies verversen + toegangspoort.
  let response = volgende();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = volgende();
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, veiligeAuthCookie(options)),
          );
        },
      },
    },
  );

  // getUser() valideert het token bij Supabase — nooit op getSession()
  // vertrouwen in server-code.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // /admin: alleen de sessie verversen. Doorsturen en weigeren doet de
  // adminguard zelf, zodat er maar één plek is die beslist.
  if (pad === "/admin" || pad.startsWith("/admin/")) return metCsp(response);

  const isAuthPagina =
    pad === "/dashboard/login" ||
    pad === "/dashboard/wachtwoord-vergeten" ||
    pad === "/dashboard/wachtwoord-instellen";

  if (!user && !isAuthPagina) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/dashboard/login";
    loginUrl.search = "";
    return NextResponse.redirect(loginUrl);
  }
  if (user && pad === "/dashboard/login") {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/dashboard";
    homeUrl.search = "";
    return NextResponse.redirect(homeUrl);
  }

  return metCsp(response);
}

export const config = {
  matcher: ["/widget/:path*", "/dashboard/:path*", "/admin", "/admin/:path*"],
};
