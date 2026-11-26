import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Notify-lead: demo-tenant slaat altijd over (voorkomt inbox-spam vanaf de
 * publieke /demo-pagina), een gewone tenant krijgt gewoon een mail.
 */

function maakLeadRij(overrides: Record<string, unknown> = {}) {
  return {
    id: "lead-1",
    tenant_id: "tenant-1",
    contact_name: "Jan Jansen",
    contact_email: "jan@voorbeeld.nl",
    contact_phone: null,
    project_description: "Nieuwe border",
    plaats: "Zwolle",
    project_type: "aanleg",
    tuin_grootte: null,
    budget_indicatie: null,
    timing: null,
    lead_score: 50,
    score_redenen: [],
    foto_paden: [],
    ...overrides,
  };
}

let tenantRij: Record<string, unknown> | null = null;

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    from: (tabel: string) => {
      if (tabel === "leads") {
        return {
          update: () => ({
            eq: () => ({
              is: () => ({
                select: () => ({
                  maybeSingle: async () => ({ data: maakLeadRij(), error: null }),
                }),
              }),
              // Ondersteunt ook de rollback-update (geen .is() erna).
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        };
      }
      if (tabel === "tenants") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: tenantRij, error: null }),
            }),
          }),
        };
      }
      throw new Error(`onverwachte tabel: ${tabel}`);
    },
  }),
}));

const verstuur = vi.fn(async () => ({ ok: true }));
vi.mock("@/lib/email/index", () => ({
  getEmailProvider: () => ({ naam: "mock", verstuur }),
}));

const registreerEvent = vi.fn<(tenantId: string, soort: string) => Promise<void>>(
  async () => undefined,
);
vi.mock("@/lib/meting", () => ({
  registreerEvent: (tenantId: string, soort: string) => registreerEvent(tenantId, soort),
}));

const { verstuurLeadNotificatie } = await import("./notify-lead");

describe("verstuurLeadNotificatie", () => {
  beforeEach(() => {
    verstuur.mockClear();
    registreerEvent.mockClear();
    delete process.env.NEXT_PUBLIC_DEMO_TENANT_KEY;
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_DEMO_TENANT_KEY;
  });

  it("slaat de mail over voor de demo-tenant", async () => {
    process.env.NEXT_PUBLIC_DEMO_TENANT_KEY = "wk_demo_0000000000000001";
    tenantRij = {
      name: "Demo Hoveniers",
      contact_email: "demo@voorbeeld.nl",
      notification_email: null,
      widget_key: "wk_demo_0000000000000001",
    };

    await verstuurLeadNotificatie("lead-1");

    expect(verstuur).not.toHaveBeenCalled();
    expect(registreerEvent).not.toHaveBeenCalled();
  });

  it("verstuurt gewoon een mail voor een niet-demo tenant", async () => {
    process.env.NEXT_PUBLIC_DEMO_TENANT_KEY = "wk_demo_0000000000000001";
    tenantRij = {
      name: "Groen & Co",
      contact_email: "info@groenco.test",
      notification_email: null,
      widget_key: "wk_test_1234567890abcdef",
    };

    await verstuurLeadNotificatie("lead-1");

    expect(verstuur).toHaveBeenCalledTimes(1);
    expect(registreerEvent).toHaveBeenCalledExactlyOnceWith(
      expect.any(String),
      "notificatiemail_verstuurd",
    );
  });

  it("verstuurt een mail als er geen demo-tenant geconfigureerd is", async () => {
    tenantRij = {
      name: "Groen & Co",
      contact_email: "info@groenco.test",
      notification_email: null,
      widget_key: "wk_test_1234567890abcdef",
    };

    await verstuurLeadNotificatie("lead-1");

    expect(verstuur).toHaveBeenCalledTimes(1);
  });
});
