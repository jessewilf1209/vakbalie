import { describe, expect, it } from "vitest";
import {
  buildEmbedSnippet,
  clampEmbedHoogte,
  EMBED_HOOGTE_DEFAULT,
  EMBED_HOOGTE_MAX,
  EMBED_HOOGTE_MIN,
  isEmbedMode,
} from "./embed";

describe("isEmbedMode", () => {
  it("herkent de embed-modus", () => {
    expect(isEmbedMode("embed")).toBe(true);
  });

  it.each([undefined, "", "bubble", "Embed", "embed ", ["embed"]] as const)(
    "valt veilig terug op bubble: %s",
    (mode) => {
      expect(isEmbedMode(mode as string | string[] | undefined)).toBe(false);
    },
  );
});

describe("clampEmbedHoogte", () => {
  it("klemt binnen het bereik en kapt af op gehele pixels", () => {
    expect(clampEmbedHoogte(640)).toBe(640);
    expect(clampEmbedHoogte(100)).toBe(EMBED_HOOGTE_MIN);
    expect(clampEmbedHoogte(5000)).toBe(EMBED_HOOGTE_MAX);
    expect(clampEmbedHoogte("720")).toBe(720);
    expect(clampEmbedHoogte(700.9)).toBe(700);
  });

  it.each([null, undefined, "", "abc", NaN])("geeft de default bij ongeldig: %s", (waarde) => {
    expect(clampEmbedHoogte(waarde as number | string | null | undefined)).toBe(
      EMBED_HOOGTE_DEFAULT,
    );
  });
});

describe("buildEmbedSnippet", () => {
  const snippet = buildEmbedSnippet({
    appUrl: "https://app.example.com/",
    tenantKey: "wk_test_1234567890abcdef",
    contactEmail: "info@groenco.test",
  });

  it("verwijst naar embed.js zonder dubbele slash", () => {
    expect(snippet).toContain('<script src="https://app.example.com/embed.js" async></script>');
  });

  it("bevat de embed-container met tenant-key en de mailto-fallback", () => {
    expect(snippet).toContain(
      'data-offerte-agent-embed data-tenant-key="wk_test_1234567890abcdef"',
    );
    expect(snippet).toContain('<a href="mailto:info@groenco.test">info@groenco.test</a>');
  });

  it("escapet een kwaadaardig contactadres (geen markup-injectie)", () => {
    const vies = buildEmbedSnippet({
      appUrl: "https://app.example.com",
      tenantKey: "wk_test_1234567890abcdef",
      contactEmail: `"><script>alert(1)</script>`,
    });
    expect(vies).not.toContain("<script>alert(1)</script>");
    expect(vies).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
});
