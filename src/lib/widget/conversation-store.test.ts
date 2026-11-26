import { beforeEach, describe, expect, it, vi } from "vitest";
import { nieuweIntakeState } from "@/lib/intake/types";
import type { ConversationRecord } from "./conversation-store";

/**
 * finalizeLead: een gesprek mag nooit eindigen zonder gekoppelde lead. Een
 * gesprek zonder lead_id ruimt de bewaartermijn-job na 30 dagen op, mét de
 * foto's die de lead ook gebruikt.
 */

interface Fout {
  code?: string;
}

const db = {
  insertFout: null as Fout | null,
  bestaandeLead: null as { id: string } | null,
  koppelFout: null as Fout | null,
  koppelingen: [] as { id: string; waarden: Record<string, unknown> }[],
};

const fakeSupabase = {
  from: (tabel: string) => {
    if (tabel === "leads") {
      return {
        insert: () => ({
          select: () => ({
            single: async () =>
              db.insertFout
                ? { data: null, error: db.insertFout }
                : { data: { id: "lead-nieuw" }, error: null },
          }),
        }),
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: db.bestaandeLead, error: null }) }),
        }),
      };
    }
    return {
      update: (waarden: Record<string, unknown>) => ({
        eq: async (_kolom: string, id: string) => {
          if (!db.koppelFout) db.koppelingen.push({ id, waarden });
          return { error: db.koppelFout };
        },
      }),
    };
  },
};

vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => fakeSupabase }));

import { finalizeLead } from "./conversation-store";

const GESPREK: ConversationRecord = {
  id: "gesprek-1",
  tenantId: "tenant-1",
  status: "active",
  leadId: null,
  state: nieuweIntakeState(),
  fotoPaden: [],
};
const SCORE = { score: 50, categorie: "warm", redenen: [] } as never;

describe("finalizeLead", () => {
  beforeEach(() => {
    db.insertFout = null;
    db.bestaandeLead = null;
    db.koppelFout = null;
    db.koppelingen = [];
  });

  it("maakt de lead aan en koppelt het gesprek als afgerond", async () => {
    expect(await finalizeLead(GESPREK, GESPREK.state, SCORE)).toEqual({
      id: "lead-nieuw",
      nieuw: true,
    });
    expect(db.koppelingen).toEqual([
      { id: "gesprek-1", waarden: { lead_id: "lead-nieuw", status: "completed" } },
    ]);
  });

  it("koppelt ook bij een bestaande lead (23505), zodat een retry herstelt", async () => {
    db.insertFout = { code: "23505" };
    db.bestaandeLead = { id: "lead-oud" };
    expect(await finalizeLead(GESPREK, GESPREK.state, SCORE)).toEqual({
      id: "lead-oud",
      nieuw: false,
    });
    expect(db.koppelingen).toEqual([
      { id: "gesprek-1", waarden: { lead_id: "lead-oud", status: "completed" } },
    ]);
  });

  it("gooit als het koppelen mislukt, in plaats van het stil te laten", async () => {
    db.koppelFout = { code: "08006" };
    await expect(finalizeLead(GESPREK, GESPREK.state, SCORE)).rejects.toThrow(
      "Lead koppelen mislukt",
    );
  });

  it("gooit bij een andere insertfout, zonder te koppelen", async () => {
    db.insertFout = { code: "08006" };
    await expect(finalizeLead(GESPREK, GESPREK.state, SCORE)).rejects.toThrow(
      "Lead opslaan mislukt",
    );
    expect(db.koppelingen).toEqual([]);
  });
});
