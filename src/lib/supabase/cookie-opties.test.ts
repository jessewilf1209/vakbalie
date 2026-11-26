import { afterEach, describe, expect, it, vi } from "vitest";
import { SESSIE_MAX_LEEFTIJD_SECONDEN, veiligeAuthCookie } from "./cookie-opties";

describe("veiligeAuthCookie", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("maakt het cookie HttpOnly en SameSite=Lax", () => {
    const o = veiligeAuthCookie({ httpOnly: false, sameSite: "none", path: "/" });
    expect(o.httpOnly).toBe(true);
    expect(o.sameSite).toBe("lax");
  });

  it("begrenst de 400 dagen van @supabase/ssr tot 7 dagen", () => {
    expect(veiligeAuthCookie({ maxAge: 400 * 24 * 60 * 60 }).maxAge).toBe(
      SESSIE_MAX_LEEFTIJD_SECONDEN,
    );
  });

  it("laat verwijderen (maxAge 0) intact", () => {
    expect(veiligeAuthCookie({ maxAge: 0 }).maxAge).toBe(0);
  });

  it("zet Secure alleen in productie", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(veiligeAuthCookie({}).secure).toBe(true);
    vi.stubEnv("NODE_ENV", "development");
    expect(veiligeAuthCookie({}).secure).toBe(false);
  });
});
