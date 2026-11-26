import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RateLimitRegel } from "@/lib/api/rate-limit";
import type { WidgetTenant } from "@/lib/widget/tenant-lookup";

// Tenant-lookup mocken: de route-logica wordt getest, niet de database.
const findTenantByWidgetKey = vi.fn<(key: string) => Promise<WidgetTenant | null>>();
vi.mock("@/lib/widget/tenant-lookup", () => ({
  findTenantByWidgetKey: (key: string) => findTenantByWidgetKey(key),
}));

// Rate limiting standaard doorlaten; per test overschrijfbaar.
const checkRateLimits = vi.fn<(regels: RateLimitRegel[]) => Promise<boolean>>(async () => true);
vi.mock("@/lib/api/rate-limit", async (origineel) => ({
  ...(await origineel<typeof import("@/lib/api/rate-limit")>()),
  checkRateLimits: (...args: unknown[]) =>
    (checkRateLimits as unknown as (...a: unknown[]) => Promise<boolean>)(...args),
}));

import { POST } from "./route";

const ORIGIN = "http://localhost:3000";

function maakRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request(`${ORIGIN}/api/widget/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json", origin: ORIGIN, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const actieveTenant: WidgetTenant = {
  id: "00000000-0000-0000-0000-000000000001",
  name: "Groen & Co Hoveniers",
  status: "active",
  allowedOrigins: ["http://localhost:8080"],
  widgetKleur: "#1f6f43",
  welkomsttekst: "Welkom bij Groen & Co!",
  privacyUrl: null,
};

describe("POST /api/widget/session", () => {
  beforeEach(() => {
    vi.stubEnv("WIDGET_SESSION_SECRET", "x".repeat(48));
    findTenantByWidgetKey.mockReset();
    checkRateLimits.mockReset();
    checkRateLimits.mockResolvedValue(true);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("geeft een sessietoken voor een geldige key en origin", async () => {
    findTenantByWidgetKey.mockResolvedValue(actieveTenant);
    const res = await POST(maakRequest({ tenantKey: "wk_test_1234567890abcdef" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.sessionToken).toMatch(/^eyJ/);
    expect(data.tenantName).toBe("Groen & Co Hoveniers");
    expect(data.widgetKleur).toBe("#1f6f43");
    expect(data.welkomsttekst).toBe("Welkom bij Groen & Co!");
    expect(new Date(data.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("gebruikt de gewone limieten en markeert de sessie niet als demo", async () => {
    findTenantByWidgetKey.mockResolvedValue(actieveTenant);
    const res = await POST(maakRequest({ tenantKey: "wk_test_1234567890abcdef" }));
    expect((await res.json()).demo).toBe(false);

    const [ipRegel] = checkRateLimits.mock.calls[0]![0];
    expect(ipRegel).toMatchObject({ limiet: 60 });
    expect(ipRegel!.sleutel).toMatch(/^sessie:ip:/);
    // De daglimiet per tenant telt pas bij het eerste bericht, niet hier.
    expect(checkRateLimits).toHaveBeenCalledOnce();
  });

  it("past voor de demo-tenant strengere limieten en eigen tellers toe", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_TENANT_KEY", "wk_test_1234567890abcdef");
    findTenantByWidgetKey.mockResolvedValue(actieveTenant);
    const res = await POST(maakRequest({ tenantKey: "wk_test_1234567890abcdef" }));
    expect(res.status).toBe(200);
    expect((await res.json()).demo).toBe(true);

    const [ipRegel] = checkRateLimits.mock.calls[0]![0];
    expect(ipRegel).toMatchObject({ limiet: 5, vensterSeconden: 3600 });
    expect(ipRegel!.sleutel).toMatch(/^sessie:demo:ip:/);
  });

  it("weigert cross-origin requests (403)", async () => {
    findTenantByWidgetKey.mockResolvedValue(actieveTenant);
    const res = await POST(
      maakRequest({ tenantKey: "wk_test_1234567890abcdef" }, { origin: "https://kwaadwillend.nl" }),
    );
    expect(res.status).toBe(403);
  });

  it("weigert requests zonder Origin-header (403)", async () => {
    const req = new Request(`${ORIGIN}/api/widget/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantKey: "wk_test_1234567890abcdef" }),
    });
    expect((await POST(req)).status).toBe(403);
  });

  it("weigert een body die geen geldige JSON is (400)", async () => {
    expect((await POST(maakRequest("{geen json"))).status).toBe(400);
  });

  it("weigert een key met verkeerd formaat (400), zonder database-lookup", async () => {
    const res = await POST(maakRequest({ tenantKey: "verkeerd-formaat" }));
    expect(res.status).toBe(400);
    expect(findTenantByWidgetKey).not.toHaveBeenCalled();
  });

  it("geeft een neutrale 404 voor een onbekende key", async () => {
    findTenantByWidgetKey.mockResolvedValue(null);
    const res = await POST(maakRequest({ tenantKey: "wk_onbekend_9876543210fedcba" }));
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(JSON.stringify(data)).not.toMatch(/tenant|database|sql/i);
  });

  it("weigert met 429 wanneer de rate limit is bereikt, vóór de tenant-lookup", async () => {
    checkRateLimits.mockResolvedValue(false);
    const res = await POST(maakRequest({ tenantKey: "wk_test_1234567890abcdef" }));
    expect(res.status).toBe(429);
    expect(findTenantByWidgetKey).not.toHaveBeenCalled();
  });

  it("eist een Turnstile-token zodra de feature actief is (403)", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "geheim");
    findTenantByWidgetKey.mockResolvedValue(actieveTenant);
    const res = await POST(maakRequest({ tenantKey: "wk_test_1234567890abcdef" }));
    expect(res.status).toBe(403);
    expect(findTenantByWidgetKey).not.toHaveBeenCalled();
  });

  it("geeft een neutrale 500 bij een database-fout", async () => {
    findTenantByWidgetKey.mockRejectedValue(new Error("interne fout"));
    const res = await POST(maakRequest({ tenantKey: "wk_test_1234567890abcdef" }));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(JSON.stringify(data)).not.toMatch(/interne fout/);
  });
});
