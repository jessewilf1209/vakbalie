import { describe, expect, it } from "vitest";
import { veiligInternDoel } from "./redirect";

const ORIGIN = "https://app.vakbalie.test";
const doel = (next: string | null) => veiligInternDoel(next, ORIGIN, "/dashboard").href;

describe("veiligInternDoel", () => {
  it("laat een intern pad door, met query", () => {
    expect(doel("/dashboard/wachtwoord-instellen?x=1")).toBe(
      `${ORIGIN}/dashboard/wachtwoord-instellen?x=1`,
    );
  });

  it.each([
    "//evil.test",
    "/\\evil.test",
    "/\\/evil.test",
    "/\t/evil.test",
    "/\n/evil.test",
    "https://evil.test/dashboard",
    "javascript:alert(1)",
    "evil.test",
  ])("weigert %j en valt terug op de standaard", (next) => {
    expect(doel(next)).toBe(`${ORIGIN}/dashboard`);
  });

  it("valt terug zonder next", () => {
    expect(doel(null)).toBe(`${ORIGIN}/dashboard`);
  });
});
