import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ rpc }),
}));

import { checkRateLimits, getClientIp, hashIp } from "./rate-limit";
import { turnstileActief, verifyTurnstileToken } from "./turnstile";

describe("hashIp", () => {
  beforeEach(() => {
    vi.stubEnv("WIDGET_SESSION_SECRET", "x".repeat(48));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is deterministisch en bevat het rauwe IP niet", () => {
    const hash = hashIp("203.0.113.7");
    expect(hash).toBe(hashIp("203.0.113.7"));
    expect(hash).not.toContain("203");
    expect(hash).toMatch(/^[a-f0-9]{32}$/);
  });

  it("verandert met de salt (ander secret = andere hash)", () => {
    const a = hashIp("203.0.113.7");
    vi.stubEnv("WIDGET_SESSION_SECRET", "y".repeat(48));
    expect(hashIp("203.0.113.7")).not.toBe(a);
  });
});

describe("getClientIp", () => {
  it("pakt het eerste IP uit x-forwarded-for", () => {
    const req = new Request("http://x", {
      headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" },
    });
    expect(getClientIp(req)).toBe("203.0.113.7");
  });

  it("valt terug op 'onbekend' zonder headers", () => {
    expect(getClientIp(new Request("http://x"))).toBe("onbekend");
  });
});

describe("checkRateLimits", () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it("staat toe onder de limiet en weigert erboven", async () => {
    rpc.mockResolvedValue({ data: 5, error: null });
    expect(await checkRateLimits([{ sleutel: "test", limiet: 10, vensterSeconden: 60 }])).toBe(
      true,
    );

    rpc.mockResolvedValue({ data: 11, error: null });
    expect(await checkRateLimits([{ sleutel: "test", limiet: 10, vensterSeconden: 60 }])).toBe(
      false,
    );
  });

  it("controleert álle regels (één overschrijding = weigeren)", async () => {
    rpc
      .mockResolvedValueOnce({ data: 1, error: null })
      .mockResolvedValueOnce({ data: 999, error: null });
    expect(
      await checkRateLimits([
        { sleutel: "a", limiet: 10, vensterSeconden: 60 },
        { sleutel: "b", limiet: 10, vensterSeconden: 60 },
      ]),
    ).toBe(false);
  });

  it("is fail-closed bij een database-fout", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "08000" } });
    expect(await checkRateLimits([{ sleutel: "test", limiet: 10, vensterSeconden: 60 }])).toBe(
      false,
    );
  });
});

describe("turnstile (feature-flag)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("staat alles toe wanneer de flag uit staat", async () => {
    expect(turnstileActief()).toBe(false);
    expect(await verifyTurnstileToken(undefined, "1.2.3.4")).toBe(true);
  });

  it("eist een token zodra de secret key er is", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "geheim");
    expect(turnstileActief()).toBe(true);
    expect(await verifyTurnstileToken(undefined, "1.2.3.4")).toBe(false);
  });

  it("accepteert alleen een door Cloudflare bevestigd token", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "geheim");
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ success: true }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    expect(await verifyTurnstileToken("token123", "1.2.3.4")).toBe(true);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ success: false }), { status: 200 })),
    );
    expect(await verifyTurnstileToken("token123", "1.2.3.4")).toBe(false);
  });

  it("is fail-closed bij netwerkfouten", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "geheim");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("netwerk weg");
      }),
    );
    expect(await verifyTurnstileToken("token123", "1.2.3.4")).toBe(false);
  });
});
