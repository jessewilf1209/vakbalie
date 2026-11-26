import { NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/api/origin";
import { checkRateLimits, getClientIp, hashIp, RATE_LIMITS } from "@/lib/api/rate-limit";
import { verifyTurnstileToken } from "@/lib/api/turnstile";
import { DEMO_LIMIETEN, isDemoTenantKey } from "@/lib/widget/demo";
import { sessionRequestSchema } from "@/lib/widget/schemas";
import { signSessionToken } from "@/lib/widget/session-token";
import { findTenantByWidgetKey } from "@/lib/widget/tenant-lookup";

export const dynamic = "force-dynamic";

/**
 * Start een widget-sessie. Volgorde van de poortwachters:
 * origin → botcheck (Turnstile, indien actief) → rate limit per IP →
 * tenant-check → pas dán een token. Foutantwoorden blijven neutraal en
 * uniform. De daglimiet per tenant (laag 4) telt pas bij het eerste bericht,
 * in de bericht-route: een geopende widget is nog geen gesprek.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Niet toegestaan" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige aanvraag" }, { status: 400 });
  }

  const parsed = sessionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ongeldige aanvraag" }, { status: 400 });
  }

  const ip = getClientIp(request);
  // De demo-tenant krijgt eigen, strengere limieten en eigen tellers
  // (sleutels met "demo", zodat ze in de logs te herkennen zijn).
  const isDemo = isDemoTenantKey(parsed.data.tenantKey);

  // Botbescherming vóór alles wat kosten of database-werk veroorzaakt.
  if (!(await verifyTurnstileToken(parsed.data.turnstileToken, ip))) {
    return NextResponse.json(
      { error: "Verificatie mislukt — probeer het opnieuw" },
      { status: 403 },
    );
  }

  if (
    !(await checkRateLimits([
      isDemo
        ? {
            sleutel: `sessie:demo:ip:${hashIp(ip)}`,
            limiet: DEMO_LIMIETEN.sessiesPerIpPerUur,
            vensterSeconden: 3600,
          }
        : {
            sleutel: `sessie:ip:${hashIp(ip)}`,
            limiet: RATE_LIMITS.sessiesPerIpPerUur,
            vensterSeconden: 3600,
          },
    ]))
  ) {
    return NextResponse.json(
      { error: "Te veel aanvragen — probeer het later opnieuw" },
      { status: 429 },
    );
  }

  let tenant;
  try {
    tenant = await findTenantByWidgetKey(parsed.data.tenantKey);
  } catch {
    return NextResponse.json(
      { error: "Er ging iets mis, probeer het later opnieuw" },
      { status: 500 },
    );
  }
  if (!tenant) {
    return NextResponse.json({ error: "Deze chat is niet beschikbaar" }, { status: 404 });
  }

  const { token, expiresAt } = await signSessionToken({
    sessionId: crypto.randomUUID(),
    tenantId: tenant.id,
    // Demo-sessie van de etalagesite: forceert verderop de mock-LLM.
    isDemo,
  });

  return NextResponse.json({
    sessionToken: token,
    // De widget verbergt functies die de demo niet heeft (foto-upload).
    demo: isDemo,
    expiresAt: expiresAt.toISOString(),
    tenantName: tenant.name,
    // Theming (stap 9): kleur is server-side gevalideerd als hex-waarde.
    widgetKleur: tenant.widgetKleur,
    welkomsttekst: tenant.welkomsttekst,
    privacyUrl: tenant.privacyUrl,
  });
}
