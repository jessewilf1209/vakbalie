import { NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/api/origin";
import { checkRateLimits, RATE_LIMITS } from "@/lib/api/rate-limit";
import { registreerEvent } from "@/lib/meting";
import { getOrCreateConversation, saveFoto } from "@/lib/widget/conversation-store";
import { MAX_FOTO_BYTES, MAX_FOTOS_PER_GESPREK, verwerkFoto } from "@/lib/widget/foto";
import { verifySessionToken } from "@/lib/widget/session-token";
import { CHAT_NIET_BESCHIKBAAR, isTenantActief } from "@/lib/widget/tenant-status";

export const dynamic = "force-dynamic";

/**
 * Foto-upload binnen een intakegesprek.
 * Multipart-form met sessionToken + file. Validatie op de échte inhoud
 * (magic bytes), EXIF wordt gestript, bestandsnaam wordt een random UUID.
 * De browser uploadt nooit rechtstreeks naar Storage.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Niet toegestaan" }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Ongeldige aanvraag" }, { status: 400 });
  }

  const sessionToken = form.get("sessionToken");
  const file = form.get("file");
  if (typeof sessionToken !== "string" || !(file instanceof File)) {
    return NextResponse.json({ error: "Ongeldige aanvraag" }, { status: 400 });
  }

  const claims = await verifySessionToken(sessionToken);
  if (!claims) {
    return NextResponse.json({ error: "Sessie verlopen — open de chat opnieuw" }, { status: 401 });
  }

  // De publieke demo slaat nooit foto's op: de mock heeft er niets aan en
  // anonieme uploads vullen anders onze opslag. Vóór elke database-aanroep.
  if (claims.isDemo) {
    return NextResponse.json({ error: "Foto's zijn niet beschikbaar in de demo" }, { status: 403 });
  }

  // Noodrem: ook een nog geldig token stopt zodra de klant inactief is.
  if (!(await isTenantActief(claims.tenantId))) {
    return NextResponse.json({ error: CHAT_NIET_BESCHIKBAAR }, { status: 403 });
  }

  if (
    !(await checkRateLimits([
      {
        sleutel: `foto:sessie:${claims.sessionId}`,
        limiet: RATE_LIMITS.fotosPerSessiePer10Min,
        vensterSeconden: 600,
      },
    ]))
  ) {
    if (!claims.isDemo) await registreerEvent(claims.tenantId, "rate_limit_geweigerd");
    return NextResponse.json({ error: "Rustig aan — probeer het zo weer" }, { status: 429 });
  }

  if (file.size === 0 || file.size > MAX_FOTO_BYTES) {
    return NextResponse.json({ error: "Foto is te groot (max 4 MB)" }, { status: 413 });
  }

  try {
    const conversation = await getOrCreateConversation(claims.sessionId, claims.tenantId);
    if (conversation.status !== "active") {
      return NextResponse.json({ error: "Dit gesprek is al afgerond" }, { status: 409 });
    }
    if (conversation.fotoPaden.length >= MAX_FOTOS_PER_GESPREK) {
      return NextResponse.json(
        { error: `Maximaal ${MAX_FOTOS_PER_GESPREK} foto's per aanvraag` },
        { status: 422 },
      );
    }

    const foto = await verwerkFoto(Buffer.from(await file.arrayBuffer()));
    if (!foto) {
      return NextResponse.json(
        { error: "Alleen JPG-, PNG- of WebP-foto's zijn toegestaan" },
        { status: 415 },
      );
    }

    const { aantal } = await saveFoto(conversation, foto.data, foto.contentType, foto.extensie);
    // Alleen het aantal: geen foto, bestandsnaam of EXIF.
    if (!claims.isDemo) await registreerEvent(claims.tenantId, "foto_geupload");

    return NextResponse.json({ ok: true, aantal, max: MAX_FOTOS_PER_GESPREK });
  } catch (error) {
    console.error("widget/photo mislukt", {
      melding: error instanceof Error ? error.message : "onbekend",
    });
    return NextResponse.json({ error: "Er ging iets mis, probeer het opnieuw" }, { status: 500 });
  }
}
