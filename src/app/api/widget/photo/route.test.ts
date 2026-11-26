import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nieuweIntakeState } from "@/lib/intake/types";
import { signSessionToken } from "@/lib/widget/session-token";
import type { ConversationRecord } from "@/lib/widget/conversation-store";

const store = {
  getOrCreateConversation: vi.fn<() => Promise<ConversationRecord>>(),
  saveFoto: vi.fn(async () => ({ pad: "t/c/x.jpg", aantal: 1 })),
};
vi.mock("@/lib/widget/conversation-store", () => ({
  getOrCreateConversation: () => store.getOrCreateConversation(),
  saveFoto: (...args: unknown[]) =>
    (store.saveFoto as unknown as (...a: unknown[]) => Promise<unknown>)(...args),
}));

const checkRateLimits = vi.fn(async () => true);
vi.mock("@/lib/api/rate-limit", async (origineel) => ({
  ...(await origineel<typeof import("@/lib/api/rate-limit")>()),
  checkRateLimits: (...args: unknown[]) =>
    (checkRateLimits as unknown as (...a: unknown[]) => Promise<boolean>)(...args),
}));

const isTenantActief = vi.fn<(tenantId: string) => Promise<boolean>>(async () => true);
vi.mock("@/lib/widget/tenant-status", () => ({
  CHAT_NIET_BESCHIKBAAR: "Deze chat is niet beschikbaar.",
  isTenantActief: (tenantId: string) => isTenantActief(tenantId),
}));

import { POST } from "./route";

const ORIGIN = "http://localhost:3000";

function conversatie(fotoPaden: string[] = []): ConversationRecord {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    tenantId: "00000000-0000-0000-0000-000000000001",
    status: "active",
    leadId: null,
    state: nieuweIntakeState(),
    fotoPaden,
  };
}

async function maakRequest(opties: {
  token?: string;
  bestand?: Buffer;
  origin?: string;
  isDemo?: boolean;
}) {
  const token =
    opties.token ??
    (
      await signSessionToken({
        sessionId: "11111111-1111-1111-1111-111111111111",
        tenantId: "00000000-0000-0000-0000-000000000001",
        ...(opties.isDemo ? { isDemo: true } : {}),
      })
    ).token;
  const form = new FormData();
  form.append("sessionToken", token);
  if (opties.bestand) {
    form.append(
      "file",
      new File([new Uint8Array(opties.bestand)], "tuin.jpg", { type: "image/jpeg" }),
    );
  }
  return new Request(`${ORIGIN}/api/widget/photo`, {
    method: "POST",
    headers: { origin: opties.origin ?? ORIGIN },
    body: form,
  });
}

async function testJpeg(): Promise<Buffer> {
  return sharp({ create: { width: 20, height: 20, channels: 3, background: "#4a4" } })
    .jpeg()
    .toBuffer();
}

describe("POST /api/widget/photo", () => {
  beforeEach(() => {
    vi.stubEnv("WIDGET_SESSION_SECRET", "x".repeat(48));
    store.getOrCreateConversation.mockReset();
    store.saveFoto.mockClear();
    checkRateLimits.mockReset();
    checkRateLimits.mockResolvedValue(true);
    isTenantActief.mockReset();
    isTenantActief.mockResolvedValue(true);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("slaat nooit een foto op in de publieke demo (403), vóór elke database-aanroep", async () => {
    const res = await POST(await maakRequest({ bestand: await testJpeg(), isDemo: true }));
    expect(res.status).toBe(403);
    expect(store.getOrCreateConversation).not.toHaveBeenCalled();
    expect(store.saveFoto).not.toHaveBeenCalled();
    expect(checkRateLimits).not.toHaveBeenCalled();
  });

  it("accepteert een geldige foto en geeft het aantal terug", async () => {
    store.getOrCreateConversation.mockResolvedValue(conversatie());
    const res = await POST(await maakRequest({ bestand: await testJpeg() }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.aantal).toBe(1);
    expect(store.saveFoto).toHaveBeenCalledOnce();
  });

  it("weigert een bestand dat geen echte afbeelding is (415)", async () => {
    store.getOrCreateConversation.mockResolvedValue(conversatie());
    const res = await POST(
      await maakRequest({ bestand: Buffer.from("<html>nep afbeelding</html>") }),
    );
    expect(res.status).toBe(415);
    expect(store.saveFoto).not.toHaveBeenCalled();
  });

  it("weigert boven het fotoplafond (422)", async () => {
    store.getOrCreateConversation.mockResolvedValue(conversatie(["a", "b", "c", "d", "e"]));
    const res = await POST(await maakRequest({ bestand: await testJpeg() }));
    expect(res.status).toBe(422);
  });

  it("weigert uploads zodra de klant inactief is (noodrem, 403)", async () => {
    isTenantActief.mockResolvedValue(false);
    const res = await POST(await maakRequest({ bestand: await testJpeg() }));
    expect(res.status).toBe(403);
    expect(store.saveFoto).not.toHaveBeenCalled();
  });

  it("weigert zonder geldig token (401)", async () => {
    const res = await POST(
      await maakRequest({ token: "ongeldig-token-xxxxxxxxxxxx", bestand: await testJpeg() }),
    );
    expect(res.status).toBe(401);
  });

  it("weigert cross-origin (403)", async () => {
    const res = await POST(
      await maakRequest({ bestand: await testJpeg(), origin: "https://kwaad.nl" }),
    );
    expect(res.status).toBe(403);
  });

  it("weigert een aanvraag zonder bestand (400)", async () => {
    store.getOrCreateConversation.mockResolvedValue(conversatie());
    const res = await POST(await maakRequest({}));
    expect(res.status).toBe(400);
  });
});
