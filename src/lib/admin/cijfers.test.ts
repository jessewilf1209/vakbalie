import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const vereisAdminActie = vi.fn(async () => ({ supabase: { rpc }, adminId: "a" }));
vi.mock("./toegang", () => ({ vereisAdminActie: () => vereisAdminActie() }));

const {
  CijfersFout,
  haalKostenPerTenant,
  haalPlatformOverzicht,
  haalTenantTrend,
  leesAdminWeergaveConfig,
} = await import("./cijfers");
const { bepaalPeriode } = await import("./periode");

const periode = bepaalPeriode("deze_maand", new Date("2026-11-11T12:00:00Z"));

const RIJ = {
  tenant_id: "10000000-0000-4000-8000-000000000001",
  naam: "Tuin Een",
  status: "active",
  gesprekken: 2,
  leads: 1,
  fotos: 0,
  aanroepen: 3,
  input_tokens: 6000,
  output_tokens: 900,
  kosten_intake: 83,
  kosten_opvolgmail: 33,
  kosten_belscript: 0,
  kosten_totaal: 116,
  notificatiemails: 1,
  opvolgmails: 0,
  afgerond_op_budget: 0,
  rate_limit_geweigerd: 1,
  dagrem_geweigerd: 0,
  laatste_gesprek: "2026-10-15T10:00:00+00:00",
  laatste_login: null,
};

beforeEach(() => {
  rpc.mockReset();
  vereisAdminActie.mockClear();
  delete process.env.NEXT_PUBLIC_DEMO_TENANT_KEY;
});

describe("haalKostenPerTenant", () => {
  it("controleert eerst de admin, en geeft dan de periode en de demo-key mee", async () => {
    process.env.NEXT_PUBLIC_DEMO_TENANT_KEY = "wk_demo_0000000000000001";
    rpc.mockResolvedValue({ data: [RIJ], error: null });
    const [rij] = await haalKostenPerTenant(periode);

    expect(vereisAdminActie).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledExactlyOnceWith("admin_kosten_per_tenant", {
      p_van: "2026-10-31T23:00:00.000Z",
      p_tot: "2026-11-11T23:00:00.000Z",
      p_uitgesloten_widget_key: "wk_demo_0000000000000001",
    });
    expect(rij).toMatchObject({ naam: "Tuin Een", kostenTotaal: 116, laatsteLogin: null });
    expect(rij.laatsteGesprek).toEqual(new Date("2026-10-15T10:00:00Z"));
  });

  it("vraagt niets op als de guard weigert", async () => {
    vereisAdminActie.mockRejectedValueOnce(new Error("geen toegang"));
    await expect(haalKostenPerTenant(periode)).rejects.toThrow("geen toegang");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("geeft een fout zonder data bij een databasefout", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "geheim detail" } });
    const fout = await haalKostenPerTenant(periode).catch((e: unknown) => e);
    expect(fout).toBeInstanceOf(CijfersFout);
    expect(String(fout)).not.toContain("geheim");
  });

  it("weigert een rij die niet aan het schema voldoet", async () => {
    rpc.mockResolvedValue({ data: [{ ...RIJ, kosten_totaal: -1 }], error: null });
    await expect(haalKostenPerTenant(periode)).rejects.toThrow();
  });
});

describe("haalPlatformOverzicht en haalTenantTrend", () => {
  it("verwacht precies één overzichtsrij", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await expect(haalPlatformOverzicht(periode)).rejects.toThrow();
  });

  it("weigert een ongeldig tenant-id zonder de database te vragen", async () => {
    await expect(haalTenantTrend("'; drop table x;--", periode)).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("leesAdminWeergaveConfig", () => {
  it("leest koers en vaste kosten, en laat ze leeg als ze ontbreken of onzin zijn", () => {
    expect(
      leesAdminWeergaveConfig({
        NODE_ENV: "test",
        ADMIN_EUR_PER_USD: "0.86",
        ADMIN_VASTE_KOSTEN_USD_PER_MAAND: "45",
      }),
    ).toEqual({ dagremPlafond: 50_000, eurPerUsd: 0.86, vasteKostenPerMaand: 450_000 });
    expect(leesAdminWeergaveConfig({ NODE_ENV: "test", ADMIN_EUR_PER_USD: "-1" })).toMatchObject({
      eurPerUsd: null,
      vasteKostenPerMaand: null,
    });
  });
});
