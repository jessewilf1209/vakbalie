import { NextResponse } from "next/server";
import { verstuurLeadNotificatie } from "@/lib/email/notify-lead";
import { isSameOrigin } from "@/lib/api/origin";
import { checkRateLimits, RATE_LIMITS } from "@/lib/api/rate-limit";
import { hovenierProfiel } from "@/lib/intake/profiel";
import { berekenLeadscore } from "@/lib/leadscore";
import { registreerEvent } from "@/lib/meting";
import {
  finalizeLead,
  getOrCreateConversation,
  markeerGesprekAfgerond,
} from "@/lib/widget/conversation-store";
import { confirmRequestSchema } from "@/lib/widget/schemas";
import { verifySessionToken } from "@/lib/widget/session-token";
import { CHAT_NIET_BESCHIKBAAR, isTenantActief } from "@/lib/widget/tenant-status";

export const dynamic = "force-dynamic";

/**
 * Bevestiging van de samenvatting (stap 9.3): pas hier wordt de lead
 * definitief aangemaakt. Idempotent — nogmaals bevestigen levert nooit een
 * tweede lead op (unieke conversation_id in de database).
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
  const parsed = confirmRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ongeldige aanvraag" }, { status: 400 });
  }

  const claims = await verifySessionToken(parsed.data.sessionToken);
  if (!claims) {
    return NextResponse.json({ error: "Sessie verlopen — open de chat opnieuw" }, { status: 401 });
  }

  // Noodrem: ook een nog geldig token stopt zodra de klant inactief is.
  if (!(await isTenantActief(claims.tenantId))) {
    return NextResponse.json({ error: CHAT_NIET_BESCHIKBAAR }, { status: 403 });
  }

  if (
    !(await checkRateLimits([
      {
        sleutel: `bevestig:sessie:${claims.sessionId}`,
        limiet: RATE_LIMITS.berichtenPerSessiePerMinuut,
        vensterSeconden: 60,
      },
    ]))
  ) {
    return NextResponse.json({ error: "Rustig aan — probeer het zo weer" }, { status: 429 });
  }

  try {
    const conversation = await getOrCreateConversation(claims.sessionId, claims.tenantId);

    // Al afgerond (dubbelklik/retry): zelfde antwoord, geen tweede lead.
    if (conversation.status === "completed") {
      return NextResponse.json({ completed: true });
    }
    if (!conversation.state.afgerond) {
      return NextResponse.json({ error: "De aanvraag is nog niet compleet" }, { status: 409 });
    }

    // Demo: afronden zonder lead en zonder mail.
    if (claims.isDemo) {
      await markeerGesprekAfgerond(conversation.id);
      return NextResponse.json({ completed: true });
    }

    const score = berekenLeadscore(
      hovenierProfiel,
      conversation.state,
      conversation.fotoPaden.length,
    );
    const lead = await finalizeLead(conversation, conversation.state, score);
    // Meting per klant; de demo-tenant telt nergens mee.
    if (lead?.nieuw && !claims.isDemo) await registreerEvent(claims.tenantId, "lead_aangemaakt");

    // Mail-falen breekt de flow nooit; de functie vangt alles zelf af.
    if (lead) await verstuurLeadNotificatie(lead.id);

    return NextResponse.json({ completed: true });
  } catch (error) {
    console.error("widget/confirm mislukt", {
      melding: error instanceof Error ? error.message : "onbekend",
    });
    return NextResponse.json({ error: "Er ging iets mis, probeer het opnieuw" }, { status: 500 });
  }
}
