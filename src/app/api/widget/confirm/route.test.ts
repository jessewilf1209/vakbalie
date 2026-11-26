import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nieuweIntakeState, type IntakeState } from "@/lib/intake/types";
import { signSessionToken } from "@/lib/widget/session-token";
import type { ConversationRecord } from "@/lib/widget/conversation-store";

const store = {
  getOrCreateConversation: vi.fn<() => Promise<ConversationRecord>>(),
  finalizeLead: vi.fn(async () => ({ id: "lead-id-1", nieuw: true })),
  markeerGesprekAfgerond: vi.fn<(conversationId: string) => Promise<void>>(async () => undefined),
};
vi.mock("@/lib/widget/conversation-store", () => ({
  getOrCreateConversation: () => store.getOrCreateConversation(),
  markeerGesprekAfgerond: (conversationId: string) => store.markeerGesprekAfgerond(conversationId),
  finalizeLead: (...args: unknown[]) =>
    (store.finalizeLead as unknown as (...a: unknown[]) => Promise<unknown>)(...args),
}));

const checkRateLimits = vi.fn(async () => true);
vi.mock("@/lib/api/rate-limit", async (origineel) => ({
  ...(await origineel<typeof import("@/lib/api/rate-limit")>()),
  checkRateLimits: (...args: unknown[]) =>
    (checkRateLimits as unknown as (...a: unknown[]) => Promise<boolean>)(...args),
}));

const verstuurLeadNotificatie = vi.fn<(leadId: string) => Promise<void>>(async () => undefined);
vi.mock("@/lib/email/notify-lead", () => ({
  verstuurLeadNotificatie: (leadId: string) => verstuurLeadNotificatie(leadId),
}));

const registreerEvent = vi.fn<(tenantId: string, soort: string) => Promise<void>>(
  async () => undefined,
);
vi.mock("@/lib/meting", () => ({
  registreerEvent: (tenantId: string, soort: string) => registreerEvent(tenantId, soort),
}));

const isTenantActief = vi.fn<(tenantId: string) => Promise<boolean>>(async () => true);
vi.mock("@/lib/widget/tenant-status", () => ({
  CHAT_NIET_BESCHIKBAAR: "Deze chat is niet beschikbaar.",
  isTenantActief: (tenantId: string) => isTenantActief(tenantId),
}));

import { POST } from "./route";

const ORIGIN = "http://localhost:3000";

function afgerondeStaat(): IntakeState {
  const state = nieuweIntakeState();
  state.velden = {
    plaats: "Zwolle",
    projectType: "aanleg",
    wensen: "nieuwe tuin",
    timing: "binnen_1_maand",
    budgetIndicatie: "10000_plus",
    contactNaam: "Jan",
    contactEmail: "jan@voorbeeld.nl",
  };
  state.consent = { gegeven: true, tijdstip: new Date().toISOString() };
  state.afgerond = true;
  return state;
}

function conversatie(
  state: IntakeState,
  status: "active" | "completed" = "active",
): ConversationRecord {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    tenantId: "00000000-0000-0000-0000-000000000001",
    status,
    leadId: null,
    state,
    fotoPaden: ["a.jpg"],
  };
}

async function maakRequest(isDemo = false) {
  const { token } = await signSessionToken({
    sessionId: "11111111-1111-1111-1111-111111111111",
    tenantId: "00000000-0000-0000-0000-000000000001",
    ...(isDemo ? { isDemo: true } : {}),
  });
  return new Request(`${ORIGIN}/api/widget/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ sessionToken: token }),
  });
}

describe("POST /api/widget/confirm", () => {
  beforeEach(() => {
    vi.stubEnv("WIDGET_SESSION_SECRET", "x".repeat(48));
    store.getOrCreateConversation.mockReset();
    store.finalizeLead.mockClear();
    store.markeerGesprekAfgerond.mockClear();
    verstuurLeadNotificatie.mockClear();
    registreerEvent.mockClear();
    checkRateLimits.mockReset();
    checkRateLimits.mockResolvedValue(true);
    isTenantActief.mockReset();
    isTenantActief.mockResolvedValue(true);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("maakt de lead aan bij een afgeronde intake", async () => {
    store.getOrCreateConversation.mockResolvedValue(conversatie(afgerondeStaat()));
    const res = await POST(await maakRequest());
    expect(res.status).toBe(200);
    expect((await res.json()).completed).toBe(true);
    expect(store.finalizeLead).toHaveBeenCalledOnce();
    expect(verstuurLeadNotificatie).toHaveBeenCalledWith("lead-id-1");
    expect(registreerEvent).toHaveBeenCalledExactlyOnceWith(expect.any(String), "lead_aangemaakt");
  });

  it("rondt een demo-gesprek af zonder lead, mail of meting", async () => {
    store.getOrCreateConversation.mockResolvedValue(conversatie(afgerondeStaat()));
    const res = await POST(await maakRequest(true));
    expect(res.status).toBe(200);
    expect((await res.json()).completed).toBe(true);
    expect(store.markeerGesprekAfgerond).toHaveBeenCalledWith(
      "11111111-1111-1111-1111-111111111111",
    );
    expect(store.finalizeLead).not.toHaveBeenCalled();
    expect(verstuurLeadNotificatie).not.toHaveBeenCalled();
    expect(registreerEvent).not.toHaveBeenCalled();
  });

  it("telt een lead die al bestond (race of retry) niet nog een keer", async () => {
    store.finalizeLead.mockResolvedValueOnce({ id: "lead-id-1", nieuw: false });
    store.getOrCreateConversation.mockResolvedValue(conversatie(afgerondeStaat()));
    await POST(await maakRequest());
    expect(registreerEvent).not.toHaveBeenCalled();
  });

  it("is idempotent: een al afgerond gesprek geeft 200 zonder nieuwe lead", async () => {
    store.getOrCreateConversation.mockResolvedValue(conversatie(afgerondeStaat(), "completed"));
    const res = await POST(await maakRequest());
    expect(res.status).toBe(200);
    expect(store.finalizeLead).not.toHaveBeenCalled();
  });

  it("weigert bevestiging van een onvolledige intake (409)", async () => {
    store.getOrCreateConversation.mockResolvedValue(conversatie(nieuweIntakeState()));
    const res = await POST(await maakRequest());
    expect(res.status).toBe(409);
    expect(store.finalizeLead).not.toHaveBeenCalled();
  });

  it("maakt geen lead aan zodra de klant inactief is (noodrem, 403)", async () => {
    isTenantActief.mockResolvedValue(false);
    const res = await POST(await maakRequest());
    expect(res.status).toBe(403);
    expect(store.finalizeLead).not.toHaveBeenCalled();
  });

  it("weigert zonder geldig token (401)", async () => {
    const res = await POST(
      new Request(`${ORIGIN}/api/widget/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json", origin: ORIGIN },
        body: JSON.stringify({ sessionToken: "x".repeat(30) }),
      }),
    );
    expect(res.status).toBe(401);
  });
});
