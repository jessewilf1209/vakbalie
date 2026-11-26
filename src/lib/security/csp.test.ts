import { describe, expect, it } from "vitest";
import { bouwBasisCsp, bouwStrengeCsp, maakNonce, originVan } from "./csp";

/** CSP-string → { directive: [bronnen] } voor leesbare asserts. */
function parse(csp: string): Record<string, string[]> {
  return Object.fromEntries(
    csp.split(";").map((deel) => {
      const [naam, ...bronnen] = deel.trim().split(/\s+/);
      return [naam, bronnen];
    }),
  );
}

const basis = {
  nonce: "abc123==",
  frameAncestors: [] as string[],
  turnstile: false,
  supabaseOrigin: "https://xyz.supabase.co",
  isDev: false,
};

describe("bouwStrengeCsp", () => {
  it("staat alleen scripts met de nonce toe, zonder unsafe-inline of eval", () => {
    const d = parse(bouwStrengeCsp(basis));
    expect(d["script-src"]).toEqual(["'self'", "'nonce-abc123=='", "'strict-dynamic'"]);
    expect(d["script-src"]).not.toContain("'unsafe-inline'");
    expect(d["script-src"]).not.toContain("'unsafe-eval'");
  });

  it("sluit plugins, base-tag-kaping en externe formulierdoelen uit", () => {
    const d = parse(bouwStrengeCsp(basis));
    expect(d["object-src"]).toEqual(["'none'"]);
    expect(d["base-uri"]).toEqual(["'self'"]);
    expect(d["form-action"]).toEqual(["'self'"]);
    expect(d).toHaveProperty("upgrade-insecure-requests");
  });

  it("verbiedt framing zonder opgegeven frame-ancestors (dashboard/admin)", () => {
    expect(parse(bouwStrengeCsp(basis))["frame-ancestors"]).toEqual(["'none'"]);
  });

  it("neemt de frame-ancestors van de tenant over (widget)", () => {
    const d = parse(
      bouwStrengeCsp({ ...basis, frameAncestors: ["'self'", "https://klant.nl"], turnstile: true }),
    );
    expect(d["frame-ancestors"]).toEqual(["'self'", "https://klant.nl"]);
  });

  it("staat Turnstile alleen toe als dat gevraagd wordt", () => {
    expect(parse(bouwStrengeCsp(basis))["frame-src"]).toEqual(["'self'"]);
    const d = parse(bouwStrengeCsp({ ...basis, turnstile: true }));
    expect(d["frame-src"]).toContain("https://challenges.cloudflare.com");
    expect(d["connect-src"]).toContain("https://challenges.cloudflare.com");
  });

  it("staat foto's van Supabase toe in img-src", () => {
    expect(parse(bouwStrengeCsp(basis))["img-src"]).toContain("https://xyz.supabase.co");
    expect(parse(bouwStrengeCsp({ ...basis, supabaseOrigin: null }))["img-src"]).toEqual([
      "'self'",
      "data:",
      "blob:",
    ]);
  });

  it("voegt in development alleen eval en websockets toe, en upgradet niet naar https", () => {
    const d = parse(bouwStrengeCsp({ ...basis, isDev: true }));
    expect(d["script-src"]).toContain("'unsafe-eval'");
    expect(d["connect-src"]).toContain("ws:");
    expect(d).not.toHaveProperty("upgrade-insecure-requests");
  });
});

describe("bouwBasisCsp", () => {
  it("verbiedt framing, plugins en externe bronnen", () => {
    const d = parse(bouwBasisCsp(false));
    expect(d["default-src"]).toEqual(["'self'"]);
    expect(d["frame-ancestors"]).toEqual(["'none'"]);
    expect(d["object-src"]).toEqual(["'none'"]);
    expect(d["script-src"]).not.toContain("'unsafe-eval'");
  });
});

describe("originVan", () => {
  it("geeft alleen de origin terug, of null bij onzin", () => {
    expect(originVan("https://xyz.supabase.co/rest/v1")).toBe("https://xyz.supabase.co");
    expect(originVan(undefined)).toBeNull();
    expect(originVan("geen url")).toBeNull();
  });
});

describe("maakNonce", () => {
  it("is base64, 128 bits, en elke keer anders", () => {
    const a = maakNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(maakNonce()).not.toBe(a);
  });
});
