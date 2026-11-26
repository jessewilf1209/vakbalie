import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Adminpoort. De database (`is_platform_admin()`) beslist; deze
 * tests bewaken dat de app nooit toegang geeft zonder dat ja, en dat de
 * tussenstappen naar de juiste plek sturen.
 */

interface Sessie {
  user: { id: string; app_metadata: Record<string, unknown> } | null;
  aal: { currentLevel: string; nextLevel: string } | null;
  rpc: { data: unknown; error: unknown };
}
let sessie: Sessie;
const rpc = vi.fn(async () => sessie.rpc);

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: async () => ({
    auth: {
      getUser: async () => ({ data: { user: sessie.user } }),
      mfa: {
        getAuthenticatorAssuranceLevel: async () => ({ data: sessie.aal, error: null }),
      },
    },
    rpc,
  }),
}));

class Doorgestuurd extends Error {
  constructor(public readonly naar: string) {
    super(`redirect ${naar}`);
  }
}
class NietGevonden extends Error {}
vi.mock("next/navigation", () => ({
  redirect: (naar: string) => {
    throw new Doorgestuurd(naar);
  },
  notFound: () => {
    throw new NietGevonden("404");
  },
}));

const { adminStatus, GeenAdminToegang, vereisAdminActie, vereisAdminPagina } =
  await import("./toegang");

const ADMIN = {
  id: "a0000000-0000-0000-0000-00000000000a",
  app_metadata: { platform_admin: true },
};

beforeEach(() => {
  rpc.mockClear();
  sessie = {
    user: ADMIN,
    aal: { currentLevel: "aal2", nextLevel: "aal2" },
    rpc: { data: true, error: null },
  };
});

describe("adminStatus", () => {
  it("geeft toegang alleen als de database ja zegt", async () => {
    expect(await adminStatus()).toBe("toegang");
    expect(rpc).toHaveBeenCalledExactlyOnceWith("is_platform_admin");
  });

  it("geen sessie", async () => {
    sessie.user = null;
    expect(await adminStatus()).toBe("geen_sessie");
  });

  it.each([{}, { platform_admin: "true" }, { platform_admin: 1 }])(
    "geen admin zonder echte boolean-vlag (%j), zonder databasevraag",
    async (app_metadata) => {
      sessie.user = { ...ADMIN, app_metadata };
      expect(await adminStatus()).toBe("geen_admin");
      expect(rpc).not.toHaveBeenCalled();
    },
  );

  it("MFA instellen als er nog geen factor is", async () => {
    sessie.aal = { currentLevel: "aal1", nextLevel: "aal1" };
    expect(await adminStatus()).toBe("mfa_instellen");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("MFA-code vragen als er wel een factor is", async () => {
    sessie.aal = { currentLevel: "aal1", nextLevel: "aal2" };
    expect(await adminStatus()).toBe("mfa_verifieren");
  });

  it.each([
    { data: false, error: null },
    { data: null, error: { code: "42501" } },
    { data: "true", error: null },
  ])("geen toegang als de database geen ja geeft (%j)", async (antwoord) => {
    sessie.rpc = antwoord;
    expect(await adminStatus()).toBe("geen_admin");
  });
});

describe("vereisAdminPagina", () => {
  it("geeft de context bij toegang", async () => {
    expect((await vereisAdminPagina()).adminId).toBe(ADMIN.id);
  });

  it("stuurt zonder sessie naar de adminlogin", async () => {
    sessie.user = null;
    await expect(vereisAdminPagina()).rejects.toMatchObject({ naar: "/admin/login" });
  });

  it("stuurt naar MFA instellen en MFA invoeren", async () => {
    sessie.aal = { currentLevel: "aal1", nextLevel: "aal1" };
    await expect(vereisAdminPagina()).rejects.toMatchObject({ naar: "/admin/mfa/instellen" });
    sessie.aal = { currentLevel: "aal1", nextLevel: "aal2" };
    await expect(vereisAdminPagina()).rejects.toMatchObject({ naar: "/admin/mfa" });
  });

  it("geeft een gewone gebruiker een 404, niet een hint dat /admin bestaat", async () => {
    sessie.user = { id: "b0000000-0000-0000-0000-00000000000b", app_metadata: {} };
    await expect(vereisAdminPagina()).rejects.toBeInstanceOf(NietGevonden);
  });
});

describe("vereisAdminActie", () => {
  it("weigert een server action zonder aal2, ook met de vlag", async () => {
    sessie.aal = { currentLevel: "aal1", nextLevel: "aal2" };
    await expect(vereisAdminActie()).rejects.toBeInstanceOf(GeenAdminToegang);
  });

  it("weigert een vervalste aanroep van een gewone gebruiker", async () => {
    sessie.user = { id: "b0000000-0000-0000-0000-00000000000b", app_metadata: {} };
    await expect(vereisAdminActie()).rejects.toBeInstanceOf(GeenAdminToegang);
  });

  it("weigert als de database nee zegt, ook als de sessie aal2 en de vlag heeft", async () => {
    sessie.rpc = { data: false, error: null };
    await expect(vereisAdminActie()).rejects.toBeInstanceOf(GeenAdminToegang);
  });
});
