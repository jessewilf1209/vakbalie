import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Beheeracties: de guard vóór alles, Zod vóór de database, en
 * nooit de service-role voor bijwerken.
 */

const rpc = vi.fn(async () => ({ error: null as { code: string } | null }));
const vereisAdminActie = vi.fn(async () => ({ supabase: { rpc }, adminId: "a-1" }));
vi.mock("@/lib/admin/toegang", () => ({ vereisAdminActie: () => vereisAdminActie() }));

const getSupabaseAdmin = vi.fn(() => ({ service: true }));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => getSupabaseAdmin() }));

const maakTenant = vi.fn(async () => ({ tenantId: "t-nieuw", uitgenodigd: true }));
const voegGebruikerToe = vi.fn(async () => ({ uitgenodigd: false }));
vi.mock("@/lib/beheer/tenantbeheer", async (origineel) => ({
  ...(await origineel<typeof import("@/lib/beheer/tenantbeheer")>()),
  maakTenant: (...a: unknown[]) => (maakTenant as (...x: unknown[]) => unknown)(...a),
  voegGebruikerToe: (...a: unknown[]) => (voegGebruikerToe as (...x: unknown[]) => unknown)(...a),
}));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
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

const { domeinenActie, gebruikerToevoegenActie, instellingenActie, nieuweKlantActie, statusActie } =
  await import("./beheer-acties");

const LEEG = { status: "leeg" } as const;
const TENANT = "10000000-0000-0000-0000-000000000001";

function form(velden: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(velden)) f.set(k, v);
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockResolvedValue({ error: null });
});

describe("guard", () => {
  it.each([
    ["statusActie", () => statusActie(LEEG, form({ tenantId: TENANT, status: "inactive" }))],
    [
      "domeinenActie",
      () => domeinenActie(LEEG, form({ tenantId: TENANT, domeinen: "https://a.nl" })),
    ],
    [
      "gebruikerToevoegenActie",
      () =>
        gebruikerToevoegenActie(LEEG, form({ tenantId: TENANT, email: "a@b.nl", rol: "member" })),
    ],
    ["nieuweKlantActie", () => nieuweKlantActie(LEEG, form({ naam: "X" }))],
  ])("%s doet niets zonder admin", async (_, aanroep) => {
    vereisAdminActie.mockRejectedValueOnce(new Error("geen toegang"));
    const staat = await aanroep();
    expect(staat).toMatchObject({ status: "fout" });
    expect(rpc).not.toHaveBeenCalled();
    expect(getSupabaseAdmin).not.toHaveBeenCalled();
    expect(maakTenant).not.toHaveBeenCalled();
  });
});

describe("statusActie", () => {
  it("zet de noodrem via de databasefunctie, zonder service-role", async () => {
    const staat = await statusActie(LEEG, form({ tenantId: TENANT, status: "inactive" }));
    expect(rpc).toHaveBeenCalledExactlyOnceWith("admin_tenant_status_zetten", {
      p_tenant_id: TENANT,
      p_status: "inactive",
    });
    expect(getSupabaseAdmin).not.toHaveBeenCalled();
    expect(staat).toMatchObject({ status: "ok", melding: expect.stringContaining("gestopt") });
  });

  it("weigert een onbekende status", async () => {
    await statusActie(LEEG, form({ tenantId: TENANT, status: "verwijderd" }));
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("domeinenActie", () => {
  it("normaliseert en geeft de www-waarschuwing terug", async () => {
    const staat = await domeinenActie(
      LEEG,
      form({ tenantId: TENANT, domeinen: "https://Tuin.nl/" }),
    );
    expect(rpc).toHaveBeenCalledWith("admin_tenant_domeinen_zetten", {
      p_tenant_id: TENANT,
      p_origins: ["https://tuin.nl"],
    });
    expect(staat).toMatchObject({ status: "ok", waarschuwingen: [expect.stringContaining("www")] });
  });

  it("schrijft niets bij een ongeldig domein", async () => {
    const staat = await domeinenActie(
      LEEG,
      form({ tenantId: TENANT, domeinen: "https://tuin.nl/pad" }),
    );
    expect(staat.status).toBe("fout");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("vertaalt een databasefout zonder interne details", async () => {
    rpc.mockResolvedValueOnce({ error: { code: "P0002" } });
    const staat = await domeinenActie(
      LEEG,
      form({ tenantId: TENANT, domeinen: "https://tuin.nl" }),
    );
    expect(staat).toEqual({ status: "fout", meldingen: ["Klant niet gevonden."] });
  });
});

describe("instellingenActie", () => {
  it("weigert HTML in de naam vóór de database", async () => {
    const staat = await instellingenActie(
      LEEG,
      form({ tenantId: TENANT, naam: "<img>", contactEmail: "a@b.nl", widgetKleur: "#1f6f43" }),
    );
    expect(staat.status).toBe("fout");
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("nieuweKlantActie", () => {
  it("maakt de klant met de service-role en de admin als auteur", async () => {
    await expect(
      nieuweKlantActie(
        LEEG,
        form({
          naam: "Tuin",
          contactEmail: "info@tuin.nl",
          eigenaarEmail: "jan@tuin.nl",
          domeinen: "https://tuin.nl\nhttps://www.tuin.nl",
          status: "trial",
        }),
      ),
    ).rejects.toMatchObject({ naar: "/admin/klanten/t-nieuw?nieuw=1" });
    expect(maakTenant).toHaveBeenCalledWith(
      { service: true },
      expect.objectContaining({ origins: ["https://tuin.nl", "https://www.tuin.nl"] }),
      expect.objectContaining({ adminId: "a-1", bron: "dashboard" }),
    );
  });
});
