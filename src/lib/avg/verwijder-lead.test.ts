import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { verwijderGesprekVolledig, verwijderLeadVolledig } from "./verwijder-lead";

/**
 * AVG-verwijdering (stap 7): de volgorde (foto's → gesprek → lead) en het
 * stop-bij-falen-gedrag zijn de kern — half verwijderde data zonder
 * vindbare lead zou een retry onmogelijk maken.
 */

interface MockOpties {
  storageFout?: boolean;
  lijstFout?: boolean;
  /** Bestandsnamen die Storage in de map van het gesprek teruggeeft. */
  inMap?: string[];
  conversationFout?: boolean;
  leadFout?: boolean;
}

function maakMockClient(opties: MockOpties = {}) {
  const volgorde: string[] = [];

  const remove = vi.fn(async () => {
    volgorde.push("storage");
    return { data: null, error: opties.storageFout ? { message: "kapot" } : null };
  });

  const list = vi.fn<(map: string, opties: { limit: number }) => Promise<unknown>>(async () => ({
    data: opties.lijstFout ? null : (opties.inMap ?? []).map((name) => ({ name })),
    error: opties.lijstFout ? { message: "kapot" } : null,
  }));

  const verwijderd: Record<string, string[]> = { conversations: [], leads: [] };
  const from = vi.fn((tabel: string) => ({
    delete: () => ({
      eq: async (_kolom: string, id: string) => {
        volgorde.push(tabel);
        const fout =
          (tabel === "conversations" && opties.conversationFout) ||
          (tabel === "leads" && opties.leadFout);
        if (!fout) verwijderd[tabel].push(id);
        return { error: fout ? { message: "kapot" } : null };
      },
    }),
  }));

  const client = {
    storage: { from: () => ({ list, remove }) },
    from,
  } as unknown as SupabaseClient;

  return { client, list, remove, volgorde, verwijderd };
}

const LEAD = {
  id: "11111111-1111-1111-1111-111111111111",
  tenant_id: "tenant",
  conversation_id: "conv",
  foto_paden: ["tenant/conv/a.webp", "tenant/conv/b.webp"],
};

describe("verwijderLeadVolledig", () => {
  it("verwijdert foto's, gesprek en lead in die volgorde", async () => {
    const { client, remove, volgorde, verwijderd } = maakMockClient();

    expect(await verwijderLeadVolledig(client, LEAD)).toBe(true);
    expect(remove).toHaveBeenCalledWith(LEAD.foto_paden);
    expect(volgorde).toEqual(["storage", "conversations", "leads"]);
    expect(verwijderd.conversations).toEqual([LEAD.conversation_id]);
    expect(verwijderd.leads).toEqual([LEAD.id]);
  });

  it("slaat storage en gesprek over als die er niet zijn", async () => {
    const { client, remove, verwijderd } = maakMockClient();

    const kaal = { id: LEAD.id, tenant_id: "tenant", conversation_id: null, foto_paden: [] };
    expect(await verwijderLeadVolledig(client, kaal)).toBe(true);
    expect(remove).not.toHaveBeenCalled();
    expect(verwijderd.conversations).toEqual([]);
    expect(verwijderd.leads).toEqual([LEAD.id]);
  });

  it("ruimt ook een foto op die wel in de map staat maar niet in de lijst", async () => {
    const { client, list, remove } = maakMockClient({ inMap: ["a.webp", "b.webp", "wees.webp"] });

    expect(await verwijderLeadVolledig(client, LEAD)).toBe(true);
    expect(list).toHaveBeenCalledWith("tenant/conv", { limit: 100 });
    expect(remove).toHaveBeenCalledWith([...LEAD.foto_paden, "tenant/conv/wees.webp"]);
  });

  it("stopt als de map niet te lezen is, nog vóór er iets weg is", async () => {
    const { client, remove, verwijderd } = maakMockClient({ lijstFout: true });

    expect(await verwijderLeadVolledig(client, LEAD)).toBe(false);
    expect(remove).not.toHaveBeenCalled();
    expect(verwijderd.leads).toEqual([]);
  });

  it("stopt vóór het gesprek als foto's verwijderen faalt (lead blijft vindbaar)", async () => {
    const { client, volgorde, verwijderd } = maakMockClient({ storageFout: true });

    expect(await verwijderLeadVolledig(client, LEAD)).toBe(false);
    expect(volgorde).toEqual(["storage"]);
    expect(verwijderd.leads).toEqual([]);
  });

  it("verwijdert de lead niet als het gesprek niet weg kan", async () => {
    const { client, verwijderd } = maakMockClient({ conversationFout: true });

    expect(await verwijderLeadVolledig(client, LEAD)).toBe(false);
    expect(verwijderd.leads).toEqual([]);
  });

  it("meldt falen als de lead-rij zelf niet weg kan", async () => {
    const { client } = maakMockClient({ leadFout: true });

    expect(await verwijderLeadVolledig(client, LEAD)).toBe(false);
  });
});

describe("verwijderGesprekVolledig", () => {
  it("verwijdert foto's en daarna het gesprek", async () => {
    const { client, remove, volgorde, verwijderd } = maakMockClient();

    const gesprek = { id: "conv", tenant_id: "tenant", foto_paden: ["tenant/conv/a.webp"] };
    expect(await verwijderGesprekVolledig(client, gesprek)).toBe(true);
    expect(remove).toHaveBeenCalledWith(gesprek.foto_paden);
    expect(volgorde).toEqual(["storage", "conversations"]);
    expect(verwijderd.conversations).toEqual([gesprek.id]);
  });

  it("stopt als foto's verwijderen faalt", async () => {
    const { client, verwijderd } = maakMockClient({ storageFout: true });

    const gesprek = { id: "conv", tenant_id: "tenant", foto_paden: ["tenant/conv/a.webp"] };
    expect(await verwijderGesprekVolledig(client, gesprek)).toBe(false);
    expect(verwijderd.conversations).toEqual([]);
  });
});
