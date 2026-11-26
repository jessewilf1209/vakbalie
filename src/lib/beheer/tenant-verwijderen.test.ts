import { describe, expect, it } from "vitest";
import { kiesTeVerwijderenGebruikers } from "./tenant-verwijderen";

const T = "tenant-a";

describe("kiesTeVerwijderenGebruikers", () => {
  it("verwijdert een lid dat alleen bij deze klant hoort", () => {
    const r = kiesTeVerwijderenGebruikers(T, [{ user_id: "u1", tenant_id: T }], new Set());
    expect(r).toEqual({ verwijderen: ["u1"], blijven: [] });
  });

  it("laat een lid staan dat ook bij een andere klant hoort", () => {
    const r = kiesTeVerwijderenGebruikers(
      T,
      [
        { user_id: "u1", tenant_id: T },
        { user_id: "u1", tenant_id: "tenant-b" },
      ],
      new Set(),
    );
    expect(r).toEqual({ verwijderen: [], blijven: ["u1"] });
  });

  it("laat het beheeraccount altijd staan", () => {
    const r = kiesTeVerwijderenGebruikers(
      T,
      [{ user_id: "admin", tenant_id: T }],
      new Set(["admin"]),
    );
    expect(r).toEqual({ verwijderen: [], blijven: ["admin"] });
  });

  it("negeert accounts die geen lid van deze klant zijn", () => {
    const r = kiesTeVerwijderenGebruikers(T, [{ user_id: "u9", tenant_id: "tenant-b" }], new Set());
    expect(r).toEqual({ verwijderen: [], blijven: [] });
  });
});
