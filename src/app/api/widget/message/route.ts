import { NextResponse } from "next/server";
import { verstuurLeadNotificatie } from "@/lib/email/notify-lead";
import { isSameOrigin } from "@/lib/api/origin";
import { checkRateLimits, getClientIp, hashIp, RATE_LIMITS } from "@/lib/api/rate-limit";
import { verwerkIntakeBeurt } from "@/lib/intake/engine";
import { bouwSamenvatting } from "@/lib/intake/samenvatting";
import { intakeMockResponder } from "@/lib/intake/mock-responder";
import { hovenierProfiel } from "@/lib/intake/profiel";
import { berekenLeadscore } from "@/lib/leadscore";
import { getLlmProvider, MockLlmProvider } from "@/lib/llm";
import { DEMO_LIMIETEN } from "@/lib/widget/demo";
import { registreerEvent, type EventSoort } from "@/lib/meting";
import {
  finalizeLead,
  getOrCreateConversation,
  loadGeschiedenis,
  markeerGesprekAfgerond,
  saveBeurt,
} from "@/lib/widget/conversation-store";
import { messageRequestSchema } from "@/lib/widget/schemas";
import { verifySessionToken } from "@/lib/widget/session-token";
import { CHAT_NIET_BESCHIKBAAR, isTenantActief } from "@/lib/widget/tenant-status";

export const dynamic = "force-dynamic";

/**
 * Verwerkt één chatbeurt. Autorisatie komt uitsluitend
 * uit het signed sessietoken — de client levert nooit tenant- of
 * gesprek-id's aan. Rate limiting + Turnstile komen hier vóór de
 * verwerking (stap 8).
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
  const parsed = messageRequestSchema.safeParse(body);
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

  // Meting per klant; de demo-tenant telt nergens mee.
  const meet = async (soort: EventSoort) => {
    if (!claims.isDemo) await registreerEvent(claims.tenantId, soort);
  };

  // per sessie én per IP, vóór elke verwerking/LLM-call.
  const ip = getClientIp(request);
  if (
    !(await checkRateLimits([
      {
        sleutel: `bericht:sessie:${claims.sessionId}`,
        limiet: RATE_LIMITS.berichtenPerSessiePerMinuut,
        vensterSeconden: 60,
      },
      claims.isDemo
        ? {
            sleutel: `bericht:demo:ip:${hashIp(ip)}`,
            limiet: DEMO_LIMIETEN.berichtenPerIpPer10Min,
            vensterSeconden: 600,
          }
        : {
            sleutel: `bericht:ip:${hashIp(ip)}`,
            limiet: RATE_LIMITS.berichtenPerIpPer10Min,
            vensterSeconden: 600,
          },
    ]))
  ) {
    await meet("rate_limit_geweigerd");
    return NextResponse.json({ error: "Rustig aan — probeer het zo weer" }, { status: 429 });
  }

  try {
    const conversation = await getOrCreateConversation(claims.sessionId, claims.tenantId);
    if (conversation.status !== "active") {
      return NextResponse.json({ error: "Dit gesprek is al afgerond" }, { status: 409 });
    }

    // daglimiet per tenant, geteld bij het eerste bericht
    // en niet bij het openen van de widget. De inline-embed opent
    // een sessie bij elke paginaweergave; die mogen de limiet niet opmaken.
    if (
      conversation.state.aantalBerichten === 0 &&
      !(await checkRateLimits([
        {
          sleutel: claims.isDemo
            ? `gesprekken:demo:tenant:${claims.tenantId}`
            : `gesprekken:tenant:${claims.tenantId}`,
          limiet: claims.isDemo
            ? DEMO_LIMIETEN.gesprekkenPerDag
            : RATE_LIMITS.gesprekkenPerTenantPerDag,
          vensterSeconden: 86_400,
        },
      ]))
    ) {
      await meet("rate_limit_geweigerd");
      return NextResponse.json(
        { error: "De chat is tijdelijk erg druk — probeer het later opnieuw" },
        { status: 429 },
      );
    }

    const geschiedenis = await loadGeschiedenis(conversation.id);

    // Demo-sessies draaien áltijd op de mock, ook met een echte API-key:
    // de publieke etalage-demo mag nooit tokens (kosten) verbruiken.
    const llm = claims.isDemo
      ? new MockLlmProvider(intakeMockResponder)
      : getLlmProvider(intakeMockResponder);

    const resultaat = await verwerkIntakeBeurt({
      profiel: hovenierProfiel,
      state: conversation.state,
      geschiedenis,
      bezoekersBericht: parsed.data.message,
      llm,
      context: { tenantId: claims.tenantId, conversationId: conversation.id },
      maxBerichten: claims.isDemo ? DEMO_LIMIETEN.maxBerichtenPerGesprek : undefined,
    });

    // Limiet bereikt mét complete intake: direct afronden — er komt geen
    // bevestigingsmoment meer. Anders blijft het gesprek open totdat de
    // bezoeker de samenvatting bevestigt (stap 9.3: het signatuurmoment).
    const directAfronden = resultaat.status === "limiet_bereikt" && resultaat.state.afgerond;

    // Altijd als "active" opslaan: pas finalizeLead rondt af. Faalt die, dan
    // blijft het gesprek open en maakt een nieuwe poging de lead alsnog aan.
    await saveBeurt(
      conversation.id,
      parsed.data.message.slice(0, 2000),
      resultaat.antwoord,
      resultaat.state,
    );

    // Pas na het opslaan, zodat een mislukte beurt niet als gesprek telt.
    // een gesprek begint bij het eerste bericht van de bezoeker.
    if (conversation.state.aantalBerichten === 0 && resultaat.state.aantalBerichten === 1) {
      await meet("gesprek_gestart");
    }
    if (resultaat.limietReden === "dagrem") await meet("dagrem_geweigerd");
    if (resultaat.limietReden === "gespreksbudget") await meet("afgerond_op_budget");

    if (directAfronden) {
      // Demo: afronden zonder lead of mail; uit een publieke demo komt nooit een lead.
      if (claims.isDemo) {
        await markeerGesprekAfgerond(conversation.id);
        return NextResponse.json({ reply: resultaat.antwoord, completed: true });
      }

      const score = berekenLeadscore(
        hovenierProfiel,
        resultaat.state,
        conversation.fotoPaden.length,
      );
      const lead = await finalizeLead(conversation, resultaat.state, score);
      if (lead?.nieuw) await meet("lead_aangemaakt");
      if (lead) await verstuurLeadNotificatie(lead.id);
      return NextResponse.json({ reply: resultaat.antwoord, completed: true });
    }

    if (resultaat.status === "afgerond") {
      // Samenvatting komt uit de gevalideerde staat, nooit uit ruwe
      // LLM-output; de widget rendert dit als platte tekst.
      return NextResponse.json({
        reply: resultaat.antwoord,
        completed: false,
        bevestigen: true,
        samenvatting: bouwSamenvatting(resultaat.state.velden, conversation.fotoPaden.length),
      });
    }

    return NextResponse.json({ reply: resultaat.antwoord, completed: false });
  } catch (error) {
    // Nooit interne details naar de widget; loggen zonder persoonsgegevens.
    console.error("widget/message mislukt", {
      melding: error instanceof Error ? error.message : "onbekend",
    });
    return NextResponse.json({ error: "Er ging iets mis, probeer het opnieuw" }, { status: 500 });
  }
}
