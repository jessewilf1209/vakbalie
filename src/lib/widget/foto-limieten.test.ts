import { describe, expect, it } from "vitest";
import { MAX_FOTO_BYTES, verkleindeAfmeting } from "./foto-limieten";

describe("foto-limieten", () => {
  it("blijft onder de 4,5 MB-bodylimiet van Vercel", () => {
    expect(MAX_FOTO_BYTES).toBeLessThan(4.5 * 1024 * 1024);
  });

  it("verkleint de lange zijde tot het maximum en houdt de verhouding", () => {
    expect(verkleindeAfmeting(4032, 3024, 2048)).toEqual({ breedte: 2048, hoogte: 1536 });
    expect(verkleindeAfmeting(3024, 4032, 2048)).toEqual({ breedte: 1536, hoogte: 2048 });
  });

  it("vergroot nooit een kleine foto", () => {
    expect(verkleindeAfmeting(800, 600, 2048)).toEqual({ breedte: 800, hoogte: 600 });
  });

  it("geeft nooit een afmeting van 0", () => {
    expect(verkleindeAfmeting(10000, 1, 2048)).toEqual({ breedte: 2048, hoogte: 1 });
  });
});
