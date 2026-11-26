import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Bewaartermijn-cron (stap 7): fail-closed zonder of met fout secret, en
 * een run die verlopen leads én lead-loze gesprekken opruimt.
 */

const verwijderLeadVolledig = vi.fn(async () => true);
const verwijderGesprekVolledig = vi.fn(async () => true);
vi.mock("@/lib/avg/verwijder-lead", () => ({
  verwijderLeadVolledig: (...args: unknown[]) => verwijderLeadVolledig(...(args as [])),
  verwijderGesprekVolledig: (...args: unknown[]) => verwijderGesprekVolledig(...(args as [])),
}));

const meetdataDelete =
  vi.fn<(tabel: string, opties: unknown, kolom: string, grens: string) => void>();
const verlopenLeads = [{ id: "lead-1", conversation_id: "conv-1", foto_paden: [] }];
const verlopenGesprekken = [{ id: "conv-2", foto_paden: [] }];
const demoGesprekken = [
  { id: "demo-1", foto_paden: [] },
  { id: "demo-2", foto_paden: [] },
];
let demoTenantRij: { id: string } | null = null;
const demoOpgevraagd = vi.fn<(tenantId: string, grens: string) => void>();
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    from: (tabel: string) => ({
      delete: (opties: unknown) => ({
        lt: async (kolom: string, grens: string) => {
          meetdataDelete(tabel, opties, kolom, grens);
          return { count: tabel === "llm_gebruik" ? 3 : 2, error: null };
        },
      }),
      select: () => ({
        lt: () => ({
          limit: async () => ({ data: tabel === "leads" ? verlopenLeads : [], error: null }),
        }),
        is: () => ({
          lt: () => ({
            limit: async () => ({ data: verlopenGesprekken, error: null }),
          }),
        }),
        // Demo-opruiming: tenant opzoeken op widget-key, daarna zijn gesprekken.
        eq: (_kolom: string, waarde: string) =>
          tabel === "tenants"
            ? { maybeSingle: async () => ({ data: demoTenantRij, error: null }) }
            : {
                is: () => ({
                  lt: (_k: string, grens: string) => ({
                    limit: async () => {
                      demoOpgevraagd(waarde, grens);
                      return { data: demoGesprekken, error: null };
                    },
                  }),
                }),
              },
      }),
    }),
  }),
}));

const { GET } = await import("./route");

function maakRequest(authorization?: string): NextRequest {
  return new NextRequest("http://localhost/api/cron/bewaartermijn", {
    headers: authorization ? { authorization } : {},
  });
}

describe("bewaartermijn-cron", () => {
  beforeEach(() => {
    verwijderLeadVolledig.mockClear();
    verwijderGesprekVolledig.mockClear();
    demoOpgevraagd.mockClear();
    demoTenantRij = null;
    process.env.CRON_SECRET = "test-secret-van-zestien-plus";
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
    delete process.env.NEXT_PUBLIC_DEMO_TENANT_KEY;
  });

  it("weigert zonder Authorization-header", async () => {
    const respons = await GET(maakRequest());
    expect(respons.status).toBe(401);
    expect(verwijderLeadVolledig).not.toHaveBeenCalled();
  });

  it("weigert met fout secret", async () => {
    const respons = await GET(maakRequest("Bearer verkeerd-secret-zestien-x"));
    expect(respons.status).toBe(401);
  });

  it("is uitgeschakeld (fail-closed) zonder geconfigureerd secret", async () => {
    delete process.env.CRON_SECRET;
    const respons = await GET(maakRequest("Bearer wat-dan-ook-zestien-tekens"));
    expect(respons.status).toBe(401);
  });

  it("weigert een te kort secret (zwakke configuratie = uit)", async () => {
    process.env.CRON_SECRET = "kort";
    const respons = await GET(maakRequest("Bearer kort"));
    expect(respons.status).toBe(401);
  });

  it("verwijdert verlopen leads en lead-loze gesprekken met juist secret", async () => {
    const respons = await GET(maakRequest("Bearer test-secret-van-zestien-plus"));
    expect(respons.status).toBe(200);

    const body = await respons.json();
    expect(body).toEqual({
      leadsVerwijderd: 1,
      gesprekkenVerwijderd: 1,
      demoGesprekkenVerwijderd: 0,
      meetrijenVerwijderd: 5,
    });
    expect(verwijderLeadVolledig).toHaveBeenCalledTimes(1);
    expect(verwijderGesprekVolledig).toHaveBeenCalledTimes(1);
    // Zonder demo-key wordt er niets van een demo-tenant opgevraagd.
    expect(demoOpgevraagd).not.toHaveBeenCalled();
  });

  it("ruimt lead-loze demo-gesprekken na 24 uur op en telt ze apart", async () => {
    process.env.NEXT_PUBLIC_DEMO_TENANT_KEY = "wk_demo_1234567890abcdef";
    demoTenantRij = { id: "demo-tenant-id" };

    const body = await (await GET(maakRequest("Bearer test-secret-van-zestien-plus"))).json();

    expect(body.demoGesprekkenVerwijderd).toBe(2);
    // Eén gewoon lead-loos gesprek plus de twee demo-gesprekken.
    expect(verwijderGesprekVolledig).toHaveBeenCalledTimes(3);
    const [tenantId, grens] = demoOpgevraagd.mock.calls[0]!;
    expect(tenantId).toBe("demo-tenant-id");
    expect(Math.abs(new Date(grens).getTime() - (Date.now() - 24 * 3_600_000))).toBeLessThan(
      60_000,
    );
  });

  it("doet niets met demo-gesprekken als de demo-tenant niet (meer) bestaat", async () => {
    process.env.NEXT_PUBLIC_DEMO_TENANT_KEY = "wk_demo_1234567890abcdef";
    demoTenantRij = null;

    const body = await (await GET(maakRequest("Bearer test-secret-van-zestien-plus"))).json();

    expect(body.demoGesprekkenVerwijderd).toBe(0);
    expect(demoOpgevraagd).not.toHaveBeenCalled();
  });

  it("ruimt meetdata ouder dan 25 maanden op in beide tabellen", async () => {
    meetdataDelete.mockClear();
    await GET(maakRequest("Bearer test-secret-van-zestien-plus"));

    expect(meetdataDelete.mock.calls.map((c) => c[0])).toEqual(["llm_gebruik", "gebruik_events"]);
    const grens = new Date(meetdataDelete.mock.calls[0][3]);
    const verwacht = new Date();
    verwacht.setMonth(verwacht.getMonth() - 25);
    expect(Math.abs(grens.getTime() - verwacht.getTime())).toBeLessThan(60_000);
    expect(meetdataDelete.mock.calls[0][2]).toBe("created_at");
  });
});
