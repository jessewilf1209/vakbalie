import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nieuweIntakeState, type IntakeState } from "@/lib/intake/types";
import { signSessionToken } from "@/lib/widget/session-token";
import type { ConversationRecord } from "@/lib/widget/conversation-store";

const store = {
  getOrCreateConversation: vi.fn<(s: string, t: string) => Promise<ConversationRecord>>(),
  loadGeschiedenis: vi.fn(async () => []),
  saveBeurt: vi.fn(async () => undefined),
  finalizeLead: vi.fn(async () => ({ id: "lead-id-1", nieuw: true })),
  markeerGesprekAfgerond: vi.fn<(id: string) => Promise<void>>(async () => undefined),
};
vi.mock("@/lib/widget/conversation-store", () => ({
  getOrCreateConversation: (s: string, t: string) => store.getOrCreateConversation(s, t),
  loadGeschiedenis: () => store.loadGeschiedenis(),
  markeerGesprekAfgerond: (id: string) => store.markeerGesprekAfgerond(id),
  saveBeurt: (...args: unknown[]) =>
    (store.saveBeurt as unknown as (...a: unknown[]) => Promise<void>)(...args),
  finalizeLead: (...args: unknown[]) =>
    (store.finalizeLead as unknown as (...a: unknown[]) => Promise<unknown>)(...args),
}));

const checkRateLimits = vi.fn(async () => true);
vi.mock("@/lib/api/rate-limit", async (origineel) => ({
  ...(await origineel<typeof import("@/lib/api/rate-limit")>()),
  checkRateLimits: (...args: unknown[]) =>
    (checkRateLimits as unknown as (...a: unknown[]) => Promise<boolean>)(...args),
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
const TENANT_ID = "00000000-0000-0000-0000-000000000001";
const SESSION_ID = "11111111-1111-1111-1111-111111111111";

function conversatie(state?: IntakeState, status = "active" as const): ConversationRecord {
  return {
    id: SESSION_ID,
    tenantId: TENANT_ID,
    status,
    leadId: null,
    state: state ?? nieuweIntakeState(),
    fotoPaden: [],
  };
}

async function maakToken(isDemo = false) {
  return (
    await signSessionToken({
      sessionId: SESSION_ID,
      tenantId: TENANT_ID,
      ...(isDemo ? { isDemo: true } : {}),
    })
  ).token;
}

function maakRequest(body: unknown, origin = ORIGIN) {
  return new Request(`${ORIGIN}/api/widget/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json", origin },
    body: JSON.stringify(body),
  });
}

describe("POST /api/widget/message", () => {
  beforeEach(() => {
    vi.stubEnv("WIDGET_SESSION_SECRET", "x".repeat(48));
    store.getOrCreateConversation.mockReset();
    store.saveBeurt.mockClear();
    store.finalizeLead.mockClear();
    store.markeerGesprekAfgerond.mockClear();
    registreerEvent.mockClear();
    checkRateLimits.mockReset();
    checkRateLimits.mockResolvedValue(true);
    isTenantActief.mockReset();
    isTenantActief.mockResolvedValue(true);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("verwerkt een beurt en slaat beide berichten op", async () => {
    store.getOrCreateConversation.mockResolvedValue(conversatie());
    const res = await POST(
      maakRequest({ sessionToken: await maakToken(), message: "Ik wil een nieuwe tuin" }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(typeof data.reply).toBe("string");
    expect(data.reply.length).toBeGreaterThan(0);
    expect(data.completed).toBe(false);
    expect(store.saveBeurt).toHaveBeenCalledOnce();
    expect(store.finalizeLead).not.toHaveBeenCalled();
  });

  it("rondt een demo-gesprek bij het demo-plafond af zonder lead of mail", async () => {
    const compleet = nieuweIntakeState();
    compleet.velden = {
      plaats: "Zwolle",
      projectType: "aanleg",
      wensen: "nieuwe tuin",
      tuinGrootte: "ca. 100 m2",
      budgetIndicatie: "2500_10000",
      timing: "1_3_maanden",
      contactNaam: "Jan Jansen",
      contactEmail: "jan@voorbeeld.nl",
    };
    compleet.consent = { gegeven: true, tijdstip: new Date().toISOString() };
    // Het volgende bericht is nummer 21: één boven het demo-plafond van 20.
    compleet.aantalBerichten = 20;
    store.getOrCreateConversation.mockResolvedValue(conversatie(compleet));

    const res = await POST(
      maakRequest({ sessionToken: await maakToken(true), message: "nog iets" }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).completed).toBe(true);
    // Afgerond, maar nooit een lead of meting uit de demo.
    expect(store.saveBeurt).toHaveBeenCalledWith(
      SESSION_ID,
      "nog iets",
      expect.any(String),
      expect.anything(),
    );
    expect(store.markeerGesprekAfgerond).toHaveBeenCalledWith(SESSION_ID);
    expect(store.finalizeLead).not.toHaveBeenCalled();
    expect(registreerEvent).not.toHaveBeenCalled();
  });

  it("gebruikt voor de demo een eigen IP-teller met een lagere grens", async () => {
    store.getOrCreateConversation.mockResolvedValue(conversatie());
    await POST(maakRequest({ sessionToken: await maakToken(true), message: "hoi" }));
    const regels = (
      checkRateLimits.mock.calls[0] as unknown as [{ sleutel: string; limiet: number }[]]
    )[0];
    const ipRegel = regels.find((r) => r.sleutel.startsWith("bericht:demo:ip:"));
    expect(ipRegel?.limiet).toBe(30);
    expect(regels.some((r) => r.sleutel.startsWith("bericht:ip:"))).toBe(false);
  });

  it("vraagt om bevestiging (met samenvatting) zodra de intake afrondt — nog géén lead", async () => {
    const bijnaKlaar = nieuweIntakeState();
    bijnaKlaar.velden = {
      plaats: "Zwolle",
      projectType: "aanleg",
      wensen: "nieuwe tuin",
      tuinGrootte: "ca. 100 m2",
      budgetIndicatie: "2500_10000",
      timing: "1_3_maanden",
      contactNaam: "Jan Jansen",
    };
    bijnaKlaar.consent = { gegeven: true, tijdstip: new Date().toISOString() };
    store.getOrCreateConversation.mockResolvedValue(conversatie(bijnaKlaar));

    // Mock-responder leest 'contactEmail' als eerstvolgende onbekende veld.
    const res = await POST(
      maakRequest({ sessionToken: await maakToken(), message: "jan@voorbeeld.nl" }),
    );
    const data = await res.json();
    expect(data.completed).toBe(false);
    expect(data.bevestigen).toBe(true);
    expect(data.samenvatting).toEqual(
      expect.arrayContaining([
        { label: "E-mail", waarde: "jan@voorbeeld.nl" },
        { label: "Budget", waarde: "€ 2.500 tot € 10.000" },
      ]),
    );
    // De lead komt pas ná bevestiging (POST /api/widget/confirm).
    expect(store.finalizeLead).not.toHaveBeenCalled();
  });

  it("stopt een lopend gesprek zodra de klant inactief is (noodrem, 403)", async () => {
    isTenantActief.mockResolvedValue(false);
    const res = await POST(maakRequest({ sessionToken: await maakToken(), message: "Hallo" }));
    expect(res.status).toBe(403);
    expect(isTenantActief).toHaveBeenCalledWith(TENANT_ID);
    expect(store.getOrCreateConversation).not.toHaveBeenCalled();
  });

  it("weigert zonder geldig token (401)", async () => {
    const res = await POST(maakRequest({ sessionToken: "x".repeat(30), message: "hoi" }));
    expect(res.status).toBe(401);
  });

  it("weigert cross-origin (403)", async () => {
    const res = await POST(
      maakRequest({ sessionToken: await maakToken(), message: "hoi" }, "https://kwaad.nl"),
    );
    expect(res.status).toBe(403);
  });

  it("weigert een ongeldige body (400)", async () => {
    const res = await POST(maakRequest({ message: "" }));
    expect(res.status).toBe(400);
  });

  it("weigert een al afgerond gesprek (409)", async () => {
    store.getOrCreateConversation.mockResolvedValue({
      ...conversatie(),
      status: "completed" as never,
    });
    const res = await POST(maakRequest({ sessionToken: await maakToken(), message: "hoi" }));
    expect(res.status).toBe(409);
  });

  describe("daglimiet per tenant", () => {
    const tenantRegels = () =>
      checkRateLimits.mock.calls
        .flatMap((c) => (c as unknown as [{ sleutel: string; limiet: number }[]])[0])
        .filter((r) => r.sleutel.startsWith("gesprekken:"));

    it("telt bij het eerste bericht en weigert met 429 zonder iets op te slaan", async () => {
      store.getOrCreateConversation.mockResolvedValue(conversatie());
      // Eerste aanroep (sessie/IP) mag door, de tenantteller is vol.
      checkRateLimits.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
      const res = await POST(maakRequest({ sessionToken: await maakToken(), message: "Hallo" }));
      expect(res.status).toBe(429);
      expect(tenantRegels()).toEqual([
        expect.objectContaining({ sleutel: `gesprekken:tenant:${TENANT_ID}`, limiet: 200 }),
      ]);
      expect(store.saveBeurt).not.toHaveBeenCalled();
    });

    it("telt een lopend gesprek niet opnieuw mee", async () => {
      const lopend = nieuweIntakeState();
      lopend.aantalBerichten = 3;
      store.getOrCreateConversation.mockResolvedValue(conversatie(lopend));
      await POST(maakRequest({ sessionToken: await maakToken(), message: "Nog iets" }));
      expect(tenantRegels()).toEqual([]);
    });

    it("gebruikt voor de demo een eigen teller", async () => {
      store.getOrCreateConversation.mockResolvedValue(conversatie());
      await POST(maakRequest({ sessionToken: await maakToken(true), message: "Hallo" }));
      expect(tenantRegels()).toEqual([
        expect.objectContaining({ sleutel: `gesprekken:demo:tenant:${TENANT_ID}`, limiet: 100 }),
      ]);
    });
  });

  it("weigert met 429 bij een bereikte rate limit, vóór gesprek/LLM-werk", async () => {
    checkRateLimits.mockResolvedValue(false);
    const res = await POST(maakRequest({ sessionToken: await maakToken(), message: "hoi" }));
    expect(res.status).toBe(429);
    expect(store.getOrCreateConversation).not.toHaveBeenCalled();
  });

  describe("meting per klant", () => {
    it("telt 'gesprek gestart' bij het eerste bezoekersbericht, en daarna niet meer", async () => {
      store.getOrCreateConversation.mockResolvedValue(conversatie());
      await POST(maakRequest({ sessionToken: await maakToken(), message: "Hallo" }));
      expect(registreerEvent).toHaveBeenCalledExactlyOnceWith(TENANT_ID, "gesprek_gestart");

      registreerEvent.mockClear();
      const tweede = nieuweIntakeState();
      tweede.aantalBerichten = 1;
      store.getOrCreateConversation.mockResolvedValue(conversatie(tweede));
      await POST(maakRequest({ sessionToken: await maakToken(), message: "Nog iets" }));
      expect(registreerEvent).not.toHaveBeenCalled();
    });

    it("telt een rate-limitweigering", async () => {
      checkRateLimits.mockResolvedValue(false);
      await POST(maakRequest({ sessionToken: await maakToken(), message: "hoi" }));
      expect(registreerEvent).toHaveBeenCalledExactlyOnceWith(TENANT_ID, "rate_limit_geweigerd");
    });

    it("telt afronden op het gespreksbudget en de nieuwe lead", async () => {
      const vol = nieuweIntakeState();
      vol.aantalBerichten = 1;
      vol.tokens = { input: 10_000_000, output: 10_000_000 };
      store.getOrCreateConversation.mockResolvedValue(conversatie(vol));
      await POST(maakRequest({ sessionToken: await maakToken(), message: "hoi" }));
      expect(registreerEvent).toHaveBeenCalledWith(TENANT_ID, "afgerond_op_budget");
      expect(registreerEvent).not.toHaveBeenCalledWith(TENANT_ID, "lead_aangemaakt");
    });

    it("meet niets voor de demo-tenant", async () => {
      store.getOrCreateConversation.mockResolvedValue(conversatie());
      const demo = (
        await signSessionToken({ sessionId: SESSION_ID, tenantId: TENANT_ID, isDemo: true })
      ).token;
      await POST(maakRequest({ sessionToken: demo, message: "Hallo" }));
      checkRateLimits.mockResolvedValue(false);
      await POST(maakRequest({ sessionToken: demo, message: "Hallo" }));
      expect(registreerEvent).not.toHaveBeenCalled();
    });
  });

  it("geeft een neutrale 500 bij een opslagfout", async () => {
    store.getOrCreateConversation.mockImplementation(() => {
      throw new Error("interne database-fout");
    });
    const res = await POST(maakRequest({ sessionToken: await maakToken(), message: "hoi" }));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toMatch(/database/);
  });
});
