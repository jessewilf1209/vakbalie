import { beforeEach, describe, expect, it, vi } from "vitest";

let status = "geen_sessie";
vi.mock("@/lib/admin/toegang", () => ({ adminStatus: async () => status }));

const inlogPogingToegestaan = vi.fn(async () => true);
const mfaPogingToegestaan = vi.fn(async () => true);
vi.mock("@/lib/auth/inlog-rem", () => ({
  inlogPogingToegestaan: () => inlogPogingToegestaan(),
  mfaPogingToegestaan: () => mfaPogingToegestaan(),
}));

const auth = {
  signInWithPassword: vi.fn(async () => ({ error: null })),
  getUser: vi.fn(async () => ({ data: { user: { id: "a0000000-0000-0000-0000-00000000000a" } } })),
  mfa: {
    listFactors: vi.fn(async () => ({
      data: {
        all: [{ id: "oud", factor_type: "totp", status: "unverified" }],
        totp: [{ id: "3f0b4c6e-8a1d-4e2f-9b3c-5d6e7f8a9b0c", status: "verified" }],
      },
    })),
    unenroll: vi.fn(async () => ({ error: null })),
    enroll: vi.fn(async () => ({
      data: {
        id: "3f0b4c6e-8a1d-4e2f-9b3c-5d6e7f8a9b0c",
        totp: { qr_code: "<svg/>", secret: "GEHEIM" },
      },
      error: null,
    })),
    challengeAndVerify: vi.fn(async () => ({ error: null as unknown })),
  },
};
vi.mock("@/lib/supabase/server", () => ({ getSupabaseServer: async () => ({ auth }) }));

class Doorgestuurd extends Error {
  constructor(public readonly naar: string) {
    super(naar);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (naar: string) => {
    throw new Doorgestuurd(naar);
  },
}));

const { adminLoginActie, bevestigMfaInstellenActie, startMfaInstellenActie, verifieerMfaActie } =
  await import("./acties");

function form(velden: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(velden)) f.set(k, v);
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
  inlogPogingToegestaan.mockResolvedValue(true);
  mfaPogingToegestaan.mockResolvedValue(true);
});

describe("adminLoginActie", () => {
  const geldig = { email: "admin@vakbalie.test", wachtwoord: "lang-genoeg-wachtwoord" };

  it("roept Supabase niet aan als de inlogrem dicht is", async () => {
    inlogPogingToegestaan.mockResolvedValue(false);
    await expect(adminLoginActie(form(geldig))).rejects.toMatchObject({
      naar: "/admin/login?fout=pogingen",
    });
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("geeft een neutrale fout bij een verkeerd wachtwoord", async () => {
    auth.signInWithPassword.mockResolvedValueOnce({ error: { message: "x" } } as never);
    await expect(adminLoginActie(form(geldig))).rejects.toMatchObject({
      naar: "/admin/login?fout=1",
    });
  });

  it("laat de guard de volgende stap kiezen na een geslaagde login", async () => {
    await expect(adminLoginActie(form(geldig))).rejects.toMatchObject({ naar: "/admin" });
  });
});

describe("MFA instellen", () => {
  it("weigert een nieuwe factor als er al een geverifieerde is", async () => {
    status = "mfa_verifieren";
    const stap = await startMfaInstellenActie();
    expect(stap.stap).toBe("start");
    expect(auth.mfa.enroll).not.toHaveBeenCalled();
  });

  it("ruimt halve pogingen op en toont de QR-code", async () => {
    status = "mfa_instellen";
    const stap = await startMfaInstellenActie();
    expect(auth.mfa.unenroll).toHaveBeenCalledExactlyOnceWith({ factorId: "oud" });
    expect(stap).toMatchObject({ stap: "scannen", geheim: "GEHEIM" });
    if (stap.stap === "scannen") expect(stap.qr.startsWith("data:image/svg+xml")).toBe(true);
  });

  it("controleert de code niet als de MFA-rem dicht is", async () => {
    status = "mfa_instellen";
    mfaPogingToegestaan.mockResolvedValue(false);
    const vorige = { stap: "scannen" as const, factorId: "f", qr: "q", geheim: "g" };
    const stap = await bevestigMfaInstellenActie(
      vorige,
      form({ factorId: "3f0b4c6e-8a1d-4e2f-9b3c-5d6e7f8a9b0c", code: "123456" }),
    );
    expect(stap.fout).toContain("Te veel pogingen");
    expect(auth.mfa.challengeAndVerify).not.toHaveBeenCalled();
  });

  it("weigert een code die geen zes cijfers is", async () => {
    status = "mfa_instellen";
    const vorige = { stap: "scannen" as const, factorId: "f", qr: "q", geheim: "g" };
    await bevestigMfaInstellenActie(
      vorige,
      form({ factorId: "3f0b4c6e-8a1d-4e2f-9b3c-5d6e7f8a9b0c", code: "12345a" }),
    );
    expect(auth.mfa.challengeAndVerify).not.toHaveBeenCalled();
  });
});

describe("verifieerMfaActie", () => {
  it("controleert de code niet als de MFA-rem dicht is", async () => {
    status = "mfa_verifieren";
    mfaPogingToegestaan.mockResolvedValue(false);
    await expect(verifieerMfaActie(form({ code: "123456" }))).rejects.toMatchObject({
      naar: "/admin/mfa?fout=pogingen",
    });
    expect(auth.mfa.challengeAndVerify).not.toHaveBeenCalled();
  });

  it("verifieert tegen de geverifieerde factor en gaat door naar /admin", async () => {
    status = "mfa_verifieren";
    await expect(verifieerMfaActie(form({ code: "123 456" }))).rejects.toMatchObject({
      naar: "/admin",
    });
    expect(auth.mfa.challengeAndVerify).toHaveBeenCalledExactlyOnceWith({
      factorId: "3f0b4c6e-8a1d-4e2f-9b3c-5d6e7f8a9b0c",
      code: "123456",
    });
  });
});
