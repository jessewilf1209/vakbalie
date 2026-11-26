import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailResultaat } from "@/lib/email/types";

/**
 * Server actions voor de AI-opvolging. Zwaartepunt: er bestaat
 * geen pad waarlangs een concept zonder expliciete verstuuractie de deur
 * uitgaat, en een mislukte verzending laat geen valse historie achter.
 *
 * RLS-isolatie is hier bewust niet gemockt maar bewezen tegen de echte
 * database: scripts/smoke-opvolgmail.mjs.
 */

const LEAD = {
  id: "11111111-1111-4111-8111-111111111111",
  tenant_id: "22222222-2222-4222-8222-222222222222",
  status: "new",
  contact_name: "Jan Jansen",
  contact_email: "jan@voorbeeld.nl",
  plaats: "Zwolle",
  project_type: "Tuinrenovatie",
  project_description: "Nieuwe bestrating",
  budget_indicatie: null,
  timing: null,
};

const TENANT = {
  id: LEAD.tenant_id,
  name: "Groen & Co",
  contact_email: "info@groenco.test",
  notification_email: "leads@groenco.test",
};

let leadRij: Record<string, unknown> | null = LEAD;
let tenantRij: Record<string, unknown> | null = TENANT;
const ingevoegd: Array<Record<string, unknown>> = [];
const bijgewerkt: Array<Record<string, unknown>> = [];

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: "33333333-3333-4333-8333-333333333333" } } }),
    },
    from: (tabel: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: tabel === "leads" ? leadRij : tabel === "tenants" ? tenantRij : null,
            error: null,
          }),
        }),
      }),
      insert: async (rij: Record<string, unknown>) => {
        ingevoegd.push({ tabel, ...rij });
        return { error: null };
      },
      update: (rij: Record<string, unknown>) => ({
        eq: async () => {
          bijgewerkt.push({ tabel, ...rij });
          return { error: null };
        },
      }),
    }),
  }),
}));

const checkRateLimits = vi.fn(async () => true);
vi.mock("@/lib/api/rate-limit", async (origineel) => ({
  ...(await origineel<typeof import("@/lib/api/rate-limit")>()),
  checkRateLimits: () => checkRateLimits(),
}));

const verstuur = vi.fn<() => Promise<EmailResultaat>>(async () => ({ ok: true }));
vi.mock("@/lib/email", () => ({ getEmailProvider: () => ({ naam: "mock", verstuur }) }));

const registreerEvent = vi.fn<(tenantId: string, soort: string) => Promise<void>>(
  async () => undefined,
);
vi.mock("@/lib/meting", () => ({
  registreerEvent: (tenantId: string, soort: string) => registreerEvent(tenantId, soort),
}));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next/navigation", () => ({ redirect: () => undefined }));

const { genereerOpvolgActie, verstuurOpvolgmailActie } = await import("./acties");

beforeEach(() => {
  leadRij = { ...LEAD };
  tenantRij = { ...TENANT };
  ingevoegd.length = 0;
  bijgewerkt.length = 0;
  checkRateLimits.mockClear();
  checkRateLimits.mockResolvedValue(true);
  verstuur.mockClear();
  verstuur.mockResolvedValue({ ok: true });
  registreerEvent.mockClear();
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.EMAIL_CATCH_ALL;
});

describe("genereerOpvolgActie", () => {
  it("levert een conceptmail op zonder iets te versturen of op te slaan", async () => {
    const resultaat = await genereerOpvolgActie({ leadId: LEAD.id });

    expect(resultaat.ok).toBe(true);
    if (resultaat.ok) expect(resultaat.waarde.soort).toBe("mail");
    expect(verstuur).not.toHaveBeenCalled();
    expect(ingevoegd).toHaveLength(0);
  });

  it("levert een belscript op als de aanvrager geen e-mailadres heeft", async () => {
    leadRij = { ...LEAD, contact_email: null };
    const resultaat = await genereerOpvolgActie({ leadId: LEAD.id });

    expect(resultaat.ok).toBe(true);
    if (resultaat.ok && resultaat.waarde.soort === "belscript") {
      expect(resultaat.waarde.punten.length).toBeGreaterThanOrEqual(2);
    } else {
      throw new Error("belscript verwacht");
    }
    expect(verstuur).not.toHaveBeenCalled();
  });

  it("weigert bij een bereikte rate limit, zonder LLM-aanroep", async () => {
    checkRateLimits.mockResolvedValue(false);
    const resultaat = await genereerOpvolgActie({ leadId: LEAD.id });

    expect(resultaat.ok).toBe(false);
    if (!resultaat.ok) expect(resultaat.fout).toContain("uurlimiet");
  });

  it("geeft niet gevonden bij een lead buiten de eigen tenant (RLS levert nul rijen)", async () => {
    leadRij = null;
    const resultaat = await genereerOpvolgActie({ leadId: LEAD.id });

    expect(resultaat.ok).toBe(false);
    expect(checkRateLimits).not.toHaveBeenCalled();
  });

  it("weigert een ongeldig lead-id", async () => {
    const resultaat = await genereerOpvolgActie({ leadId: "geen-uuid" });
    expect(resultaat.ok).toBe(false);
  });

  it("weigert een instructie boven de servergrens", async () => {
    const resultaat = await genereerOpvolgActie({
      leadId: LEAD.id,
      instructie: "a".repeat(501),
    });
    expect(resultaat.ok).toBe(false);
  });
});

describe("verstuurOpvolgmailActie", () => {
  const geldig = { leadId: LEAD.id, onderwerp: "Je aanvraag", tekst: "Hallo Jan," };

  it("verstuurt, legt de historie vast en zet de status op benaderd", async () => {
    const resultaat = await verstuurOpvolgmailActie(geldig);

    expect(resultaat.ok).toBe(true);
    expect(verstuur).toHaveBeenCalledTimes(1);
    expect(ingevoegd).toHaveLength(1);
    expect(ingevoegd[0]).toMatchObject({
      tabel: "lead_opvolgmails",
      lead_id: LEAD.id,
      tenant_id: LEAD.tenant_id,
      onderwerp: "Je aanvraag",
    });
    expect(bijgewerkt).toEqual([{ tabel: "leads", status: "contacted" }]);
    expect(registreerEvent).toHaveBeenCalledExactlyOnceWith(LEAD.tenant_id, "opvolgmail_verstuurd");
  });

  it("zet reply-to op het notificatie-adres van de tenant", async () => {
    await verstuurOpvolgmailActie(geldig);
    expect(verstuur).toHaveBeenCalledWith(
      expect.objectContaining({ replyTo: "leads@groenco.test" }),
    );
  });

  it("valt terug op contact_email als er geen notificatie-adres is", async () => {
    tenantRij = { ...TENANT, notification_email: null };
    await verstuurOpvolgmailActie(geldig);
    expect(verstuur).toHaveBeenCalledWith(
      expect.objectContaining({ replyTo: "info@groenco.test" }),
    );
  });

  it("verandert een gewonnen of verloren status niet", async () => {
    for (const status of ["won", "lost", "qualified", "contacted"]) {
      bijgewerkt.length = 0;
      leadRij = { ...LEAD, status };
      const resultaat = await verstuurOpvolgmailActie(geldig);

      expect(resultaat.ok).toBe(true);
      expect(bijgewerkt).toHaveLength(0);
    }
  });

  it("legt geen historie vast als de verzending mislukt", async () => {
    verstuur.mockResolvedValue({ ok: false });
    const resultaat = await verstuurOpvolgmailActie(geldig);

    expect(resultaat.ok).toBe(false);
    expect(ingevoegd).toHaveLength(0);
    expect(bijgewerkt).toHaveLength(0);
    expect(registreerEvent).not.toHaveBeenCalled();
  });

  it("zegt bij een netwerkfout dat opnieuw proberen zin heeft", async () => {
    verstuur.mockResolvedValue({ ok: false, reden: "netwerk" });
    const resultaat = await verstuurOpvolgmailActie(geldig);

    expect(resultaat.ok).toBe(false);
    if (!resultaat.ok) expect(resultaat.fout).toContain("internetverbinding");
  });

  it("zegt bij een afwijzing juist niet dat opnieuw proberen helpt", async () => {
    verstuur.mockResolvedValue({ ok: false, reden: "afgewezen" });
    const resultaat = await verstuurOpvolgmailActie(geldig);

    expect(resultaat.ok).toBe(false);
    if (!resultaat.ok) {
      expect(resultaat.fout).toContain("weigerde");
      expect(resultaat.fout).not.toContain("internetverbinding");
    }
  });

  it("weigert te versturen zonder e-mailadres bij de aanvrager", async () => {
    leadRij = { ...LEAD, contact_email: null };
    const resultaat = await verstuurOpvolgmailActie(geldig);

    expect(resultaat.ok).toBe(false);
    expect(verstuur).not.toHaveBeenCalled();
  });

  it("weigert lege of te lange invoer (grens ligt server-side)", async () => {
    expect((await verstuurOpvolgmailActie({ ...geldig, onderwerp: "" })).ok).toBe(false);
    expect((await verstuurOpvolgmailActie({ ...geldig, tekst: "" })).ok).toBe(false);
    expect((await verstuurOpvolgmailActie({ ...geldig, tekst: "x".repeat(2001) })).ok).toBe(false);
    expect(verstuur).not.toHaveBeenCalled();
  });

  it("stuurt in dev naar de catch-all in plaats van de echte aanvrager", async () => {
    process.env.EMAIL_CATCH_ALL = "dev@eigen.test";
    await verstuurOpvolgmailActie(geldig);

    expect(verstuur).toHaveBeenCalledWith(expect.objectContaining({ aan: "dev@eigen.test" }));
  });

  it("weigert als de tenant geen enkel antwoordadres heeft", async () => {
    tenantRij = { ...TENANT, notification_email: null, contact_email: null };
    const resultaat = await verstuurOpvolgmailActie(geldig);

    expect(resultaat.ok).toBe(false);
    expect(verstuur).not.toHaveBeenCalled();
  });
});
