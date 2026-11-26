import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SESSION_TTL_SECONDS, signSessionToken, verifySessionToken } from "./session-token";

const GELDIG_SECRET = "x".repeat(48);
const claims = {
  sessionId: "11111111-1111-1111-1111-111111111111",
  tenantId: "00000000-0000-0000-0000-000000000001",
};

describe("widget-sessietokens", () => {
  beforeEach(() => vi.stubEnv("WIDGET_SESSION_SECRET", GELDIG_SECRET));
  afterEach(() => vi.unstubAllEnvs());

  it("ondertekent en verifieert een roundtrip", async () => {
    const { token, expiresAt } = await signSessionToken(claims);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + SESSION_TTL_SECONDS * 1000 + 1000);
    expect(await verifySessionToken(token)).toEqual(claims);
  });

  it("bewaart de demo-vlag door een roundtrip", async () => {
    const { token } = await signSessionToken({ ...claims, isDemo: true });
    expect(await verifySessionToken(token)).toEqual({ ...claims, isDemo: true });
  });

  it("laat isDemo weg uit normale tokens (geen claim-vervuiling)", async () => {
    const { token } = await signSessionToken({ ...claims, isDemo: false });
    const resultaat = await verifySessionToken(token);
    expect(resultaat).toEqual(claims);
    expect(resultaat).not.toHaveProperty("isDemo");
  });

  it("wijst een vervalst token af", async () => {
    const { token } = await signSessionToken(claims);
    const [header, payload] = token.split(".");
    // Andere tenant-id in de payload smokkelen zonder opnieuw te tekenen.
    const vervalst = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    vervalst.tenantId = "99999999-9999-9999-9999-999999999999";
    const nepPayload = Buffer.from(JSON.stringify(vervalst)).toString("base64url");
    const nepToken = `${header}.${nepPayload}.${token.split(".")[2]}`;
    expect(await verifySessionToken(nepToken)).toBeNull();
  });

  it("wijst een token met een ander secret af", async () => {
    const { token } = await signSessionToken(claims);
    vi.stubEnv("WIDGET_SESSION_SECRET", "y".repeat(48));
    expect(await verifySessionToken(token)).toBeNull();
  });

  it("wijst onzin-tokens af zonder te gooien", async () => {
    expect(await verifySessionToken("")).toBeNull();
    expect(await verifySessionToken("a.b.c")).toBeNull();
  });

  it("weigert te ondertekenen zonder (of met te kort) secret", async () => {
    vi.stubEnv("WIDGET_SESSION_SECRET", "te-kort");
    await expect(signSessionToken(claims)).rejects.toThrow(/WIDGET_SESSION_SECRET/);
  });
});
