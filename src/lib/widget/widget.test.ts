import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WidgetTenant } from "./tenant-lookup";

const findTenantByWidgetKey = vi.fn<(key: string) => Promise<WidgetTenant | null>>();
vi.mock("./tenant-lookup", () => ({
  findTenantByWidgetKey: (key: string) => findTenantByWidgetKey(key),
}));

import { isSameOrigin } from "@/lib/api/origin";
import { getAllowedFrameAncestors, isValidCspOrigin } from "./allowed-origins";
import { isValidTenantKeyFormat } from "./tenant-key";

describe("isValidTenantKeyFormat", () => {
  it("accepteert een correcte widget-key", () => {
    expect(isValidTenantKeyFormat("wk_test_1234567890abcdef")).toBe(true);
  });

  it.each([
    ["leeg", ""],
    ["zonder prefix", "test_1234567890abcdef"],
    ["te kort", "wk_kort"],
    ["met onveilige tekens", "wk_<script>alert(1)</script>"],
    ["een kale uuid zonder prefix", "550e8400-e29b-41d4-a716-446655440000"],
    ["te lang", "wk_" + "a".repeat(65)],
  ])("wijst af: %s", (_label, key) => {
    expect(isValidTenantKeyFormat(key)).toBe(false);
  });
});

describe("getAllowedFrameAncestors", () => {
  beforeEach(() => {
    // Let op de accolades: zonder blok retourneert de arrow de mock zelf en
    // registreert vitest die als teardown-hook (die dan ook echt wordt
    // aangeroepen — inclusief gemockte fouten).
    findTenantByWidgetKey.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const tenant: WidgetTenant = {
    id: "00000000-0000-0000-0000-000000000001",
    name: "Groen & Co",
    status: "active",
    allowedOrigins: ["https://klant.nl", "http://localhost:8080"],
    widgetKleur: "#1f6f43",
    welkomsttekst: null,
    privacyUrl: null,
  };

  it("combineert 'self', tenant-origins en dev-origins buiten productie", async () => {
    findTenantByWidgetKey.mockResolvedValue(tenant);
    const ancestors = await getAllowedFrameAncestors("wk_test_1234567890abcdef");
    expect(ancestors).toContain("'self'");
    expect(ancestors).toContain("https://klant.nl");
    expect(ancestors).toContain("http://localhost:*");
  });

  it("geeft in productie alleen 'self' + tenant-origins", async () => {
    vi.stubEnv("NODE_ENV", "production");
    findTenantByWidgetKey.mockResolvedValue(tenant);
    const ancestors = await getAllowedFrameAncestors("wk_test_1234567890abcdef");
    expect(ancestors).toEqual(["'self'", "https://klant.nl", "http://localhost:8080"]);
  });

  it("valt terug op alleen 'self' bij onbekende tenant in productie", async () => {
    vi.stubEnv("NODE_ENV", "production");
    findTenantByWidgetKey.mockResolvedValue(null);
    expect(await getAllowedFrameAncestors("wk_onbekend_0123456789abcdef")).toEqual(["'self'"]);
  });

  it("valt terug op een veilige default bij een database-fout", async () => {
    findTenantByWidgetKey.mockImplementation(() => {
      throw new Error("db kapot");
    });
    const ancestors = await getAllowedFrameAncestors("wk_test_1234567890abcdef");
    // Geen tenant-origins; alleen 'self' + dev-origins (test draait niet in productie).
    expect(ancestors.filter((a) => !a.startsWith("http://localhost"))).toEqual([
      "'self'",
      "http://127.0.0.1:*",
    ]);
  });

  it("filtert origins die de CSP-header zouden kunnen manipuleren", async () => {
    vi.stubEnv("NODE_ENV", "production");
    findTenantByWidgetKey.mockResolvedValue({
      ...tenant,
      allowedOrigins: [
        "https://klant.nl",
        "https://evil.nl; script-src *",
        "javascript:alert(1)",
        "https://pad.nl/route",
      ],
    });
    expect(await getAllowedFrameAncestors("wk_test_1234567890abcdef")).toEqual([
      "'self'",
      "https://klant.nl",
    ]);
  });
});

describe("isValidCspOrigin", () => {
  it.each(["https://klant.nl", "http://localhost:8080", "https://sub.klant.nl:8443"])(
    "accepteert %s",
    (origin) => expect(isValidCspOrigin(origin)).toBe(true),
  );

  it.each(["klant.nl", "https://klant.nl/pad", "https://a.nl b.nl", "ftp://x.nl", ""])(
    "wijst af: %s",
    (origin) => expect(isValidCspOrigin(origin)).toBe(false),
  );
});

describe("isSameOrigin", () => {
  it("accepteert een request met dezelfde origin", () => {
    const req = new Request("http://localhost:3000/api/widget/session", {
      method: "POST",
      headers: { origin: "http://localhost:3000" },
    });
    expect(isSameOrigin(req)).toBe(true);
  });

  it.each([
    ["andere origin", "https://kwaadwillend.nl"],
    ["andere poort", "http://localhost:8080"],
    ["null-origin (file://)", "null"],
  ])("weigert %s", (_label, origin) => {
    const req = new Request("http://localhost:3000/api/widget/session", {
      method: "POST",
      headers: { origin },
    });
    expect(isSameOrigin(req)).toBe(false);
  });

  it("weigert zonder Origin-header", () => {
    const req = new Request("http://localhost:3000/api/widget/session", { method: "POST" });
    expect(isSameOrigin(req)).toBe(false);
  });
});
