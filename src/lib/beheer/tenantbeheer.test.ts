import { describe, expect, it, vi } from "vitest";
import { BeheerFout, maakTenant, normaliseerOrigins, voegGebruikerToe } from "./tenantbeheer";

describe("normaliseerOrigins", () => {
  const prod = { staLokaalToe: false };

  it("maakt schone origins: kleine letters, zonder slash, ontdubbeld", () => {
    const r = normaliseerOrigins("https://WWW.Tuin.nl/ https://tuin.nl,https://tuin.nl", prod);
    expect(r).toEqual({
      ok: true,
      origins: ["https://www.tuin.nl", "https://tuin.nl"],
      fouten: [],
      waarschuwingen: [],
    });
  });

  it("houdt een niet-standaard poort", () => {
    expect(normaliseerOrigins(["https://tuin.nl:8443"], prod).origins).toEqual([
      "https://tuin.nl:8443",
    ]);
  });

  it.each([
    ["http://tuin.nl", "https"],
    ["https://tuin.nl/contact", "zonder pad"],
    ["https://tuin.nl?x=1", "zonder pad"],
    ["https://*.tuin.nl", "wildcards"],
    ["tuin.nl", "geen geldig adres"],
    ["https://user:pw@tuin.nl", "zonder pad"],
    ["https://tuin", "geen geldig domein"],
    ["javascript:alert(1)", "https"],
  ])("weigert %s", (invoer, reden) => {
    const r = normaliseerOrigins([invoer], prod);
    expect(r.ok).toBe(false);
    expect(r.fouten.join(" ")).toContain(reden);
  });

  it("http op localhost alleen als dat expliciet mag", () => {
    expect(normaliseerOrigins(["http://localhost:8080"], prod).ok).toBe(false);
    expect(normaliseerOrigins(["http://localhost:8080"], { staLokaalToe: true }).ok).toBe(true);
  });

  it("waarschuwt als alleen www of alleen zonder www is ingevuld", () => {
    expect(normaliseerOrigins(["https://www.tuin.nl"], prod).waarschuwingen[0]).toContain(
      "tuin.nl",
    );
    expect(normaliseerOrigins(["https://tuin.nl"], prod).waarschuwingen[0]).toContain(
      "www.tuin.nl",
    );
  });

  it("maximaal tien domeinen", () => {
    const veel = Array.from({ length: 11 }, (_, i) => `https://t${i}.nl`);
    expect(normaliseerOrigins(veel, prod).ok).toBe(false);
  });
});

/** Nep-service-client die bijhoudt wat er gebeurt. */
function nepSupabase(opties: { bestaandeGebruiker?: object; koppelFout?: boolean } = {}) {
  const log: string[] = [];
  const supabase = {
    auth: {
      admin: {
        listUsers: async () => ({
          data: { users: opties.bestaandeGebruiker ? [opties.bestaandeGebruiker] : [] },
          error: null,
        }),
        inviteUserByEmail: vi.fn(async () => {
          log.push("uitnodigen");
          return { data: { user: { id: "nieuw-id" } }, error: null };
        }),
        deleteUser: vi.fn(async () => {
          log.push("gebruiker-weg");
          return { error: null };
        }),
      },
    },
    from: (tabel: string) => ({
      insert: (rij: Record<string, unknown>) => {
        log.push(`insert:${tabel}`);
        if (tabel === "admin_audit") log.push(`audit:${String(rij.actie)}:${String(rij.bron)}`);
        return {
          select: () => ({ single: async () => ({ data: { id: "t-1" }, error: null }) }),
          then: (ok: (v: unknown) => void) => ok({ error: null }),
        };
      },
      upsert: async () => {
        log.push(`upsert:${tabel}`);
        return { error: opties.koppelFout ? { code: "x" } : null };
      },
      delete: () => ({
        eq: async () => {
          log.push(`delete:${tabel}`);
          return { error: null };
        },
      }),
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { id: "t-1" }, error: null }) }),
      }),
    }),
  };
  return { supabase: supabase as never, log };
}

const CTX = { adminId: "a-1", bron: "dashboard" as const, uitnodigingRedirect: "https://x/auth" };
const NIEUW = {
  naam: "Tuin Een",
  contactEmail: "Info@Tuin.nl",
  eigenaarEmail: "jan@tuin.nl",
  origins: ["https://tuin.nl", "https://www.tuin.nl"],
};

describe("maakTenant", () => {
  it("maakt tenant, nodigt de eigenaar uit, koppelt en schrijft een auditregel", async () => {
    const { supabase, log } = nepSupabase();
    const r = await maakTenant(supabase, NIEUW, CTX);
    expect(r).toEqual({ tenantId: "t-1", uitgenodigd: true });
    expect(log).toEqual([
      "insert:tenants",
      "uitnodigen",
      "upsert:tenant_users",
      "insert:admin_audit",
      "audit:tenant_aangemaakt:dashboard",
    ]);
  });

  it("weigert het beheeraccount als eigenaar, vóór er een tenant ontstaat", async () => {
    const { supabase, log } = nepSupabase({
      bestaandeGebruiker: {
        id: "admin",
        email: "jan@tuin.nl",
        app_metadata: { platform_admin: true },
      },
    });
    await expect(maakTenant(supabase, NIEUW, CTX)).rejects.toBeInstanceOf(BeheerFout);
    expect(log).toEqual([]);
  });

  it("weigert het beheeraccount ook bij gebruiker toevoegen", async () => {
    const { supabase, log } = nepSupabase({
      bestaandeGebruiker: {
        id: "admin",
        email: "jan@tuin.nl",
        app_metadata: { platform_admin: true },
      },
    });
    await expect(voegGebruikerToe(supabase, "t-1", "jan@tuin.nl", "member", CTX)).rejects.toThrow(
      "beheeraccount",
    );
    expect(log).not.toContain("upsert:tenant_users");
  });

  it("ruimt tenant en uitgenodigde gebruiker op als koppelen mislukt", async () => {
    const { supabase, log } = nepSupabase({ koppelFout: true });
    await expect(maakTenant(supabase, NIEUW, CTX)).rejects.toThrow("koppelen mislukt");
    expect(log).toEqual(expect.arrayContaining(["gebruiker-weg", "delete:tenants"]));
  });

  it("weigert ongeldige domeinen vóór er iets wordt aangemaakt", async () => {
    const { supabase, log } = nepSupabase();
    await expect(
      maakTenant(supabase, { ...NIEUW, origins: ["http://tuin.nl"] }, CTX),
    ).rejects.toThrow("https");
    expect(log).toEqual([]);
  });

  it("weigert HTML in de naam", async () => {
    const { supabase } = nepSupabase();
    await expect(maakTenant(supabase, { ...NIEUW, naam: "<b>Tuin</b>" }, CTX)).rejects.toThrow();
  });
});

describe("voegGebruikerToe", () => {
  it("koppelt een bestaand account zonder uitnodiging", async () => {
    const { supabase, log } = nepSupabase({
      bestaandeGebruiker: { id: "u-2", email: "piet@tuin.nl", app_metadata: {} },
    });
    expect(await voegGebruikerToe(supabase, "t-1", "Piet@Tuin.nl", "member", CTX)).toEqual({
      uitgenodigd: false,
    });
    expect(log).toEqual([
      "upsert:tenant_users",
      "insert:admin_audit",
      "audit:gebruiker_toegevoegd:dashboard",
    ]);
  });
});
