import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getEmailProvider, MockEmailProvider, resetEmailProviderForTests } from "./index";
import { bouwNieuweLeadMail, escapeHtml } from "./nieuwe-lead-template";

const BERICHT = { aan: "a@b.test", onderwerp: "x", html: "<p>x</p>", tekst: "x" };

describe("escapeHtml", () => {
  it("escapet alle gevaarlijke tekens", () => {
    expect(escapeHtml(`<script>alert("x&y'")</script>`)).toBe(
      "&lt;script&gt;alert(&quot;x&amp;y&#39;&quot;)&lt;/script&gt;",
    );
  });
});

describe("bouwNieuweLeadMail (injectietest —.3)", () => {
  const kwaadaardig = bouwNieuweLeadMail({
    bedrijfsnaam: `Groen & Co <img src=x onerror=alert(1)>`,
    plaats: `Zwolle\r\nBcc: spam@evil.nl`,
    projectType: "aanleg",
    samenvatting: [
      { label: "Naam", waarde: `<script>document.location='https://evil.nl'</script>` },
      { label: "Wensen", waarde: `</td></tr></table><h1>NEP BERICHT</h1>` },
    ],
    score: { categorie: "hoog", redenen: [`<b>nep reden</b>`] },
    dashboardUrl: "https://app.test/dashboard/leads/123",
  });

  it("laat geen enkel rauw HTML-tag uit bezoekersinput door in de mail", () => {
    // De gevaarlijke tags moeten ge-escaped zijn — als tekst, niet als markup.
    expect(kwaadaardig.html).not.toContain("<script>");
    expect(kwaadaardig.html).not.toContain("<img src=x");
    expect(kwaadaardig.html).not.toContain("<h1>NEP BERICHT</h1>");
    expect(kwaadaardig.html).not.toContain("<b>nep reden</b>");
    // De tabel-uitbraakpoging (</td></tr></table>) is onschadelijk gemaakt.
    expect(kwaadaardig.html).not.toContain("</table><h1>");
    expect(kwaadaardig.html).toContain("&lt;script&gt;");
    expect(kwaadaardig.html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("voorkomt header-injectie via het onderwerp", () => {
    expect(kwaadaardig.onderwerp).not.toMatch(/[\r\n]/);
    expect(kwaadaardig.onderwerp).toContain("Zwolle");
  });

  it("bevat de kerngegevens en de dashboardlink", () => {
    const mail = bouwNieuweLeadMail({
      bedrijfsnaam: "Groen & Co",
      plaats: "Epe",
      projectType: "snoeien",
      samenvatting: [{ label: "Naam", waarde: "Piet" }],
      score: { categorie: "middel", redenen: ["Budgetindicatie ingevuld"] },
      dashboardUrl: "https://app.test/dashboard/leads/abc",
    });
    expect(mail.onderwerp).toBe("Nieuwe offerte-aanvraag — Epe, snoeien");
    expect(mail.html).toContain("Leadscore: Middel");
    expect(mail.tekst).toContain("Naam: Piet");
    expect(mail.tekst).toContain("https://app.test/dashboard/leads/abc");
  });
});

describe("getEmailProvider", () => {
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

  afterEach(() => {
    resetEmailProviderForTests();
    vi.unstubAllEnvs();
    consoleError.mockClear();
  });

  it("valt zonder EMAIL_PROVIDER terug op de mock (mock-first)", () => {
    expect(getEmailProvider().naam).toBe("mock");
  });

  it("kiest SES bij EMAIL_PROVIDER=ses met een afzender", () => {
    vi.stubEnv("EMAIL_PROVIDER", "ses");
    vi.stubEnv("EMAIL_FROM", "aanvragen@vakbalie.nl");
    expect(getEmailProvider().naam).toBe("ses");
  });

  it.each([
    ["een onbekende provider", { EMAIL_PROVIDER: "sendgrid" }],
    ["SES zonder afzender", { EMAIL_PROVIDER: "ses" }],
    [
      "SES met een regio buiten de EU",
      { EMAIL_PROVIDER: "ses", EMAIL_FROM: "a@b.test", AWS_REGION: "us-east-1" },
    ],
  ])("weigert %s zonder te crashen", async (_naam, omgeving) => {
    for (const [naam, waarde] of Object.entries(omgeving)) vi.stubEnv(naam, waarde);
    const provider = getEmailProvider();
    expect(provider.naam).toBe("geweigerd");
    expect(await provider.verstuur(BERICHT)).toEqual({ ok: false, reden: "afgewezen" });
    expect(consoleError).toHaveBeenCalledOnce();
  });

  it("mock bewaart het laatste bericht voor inspectie", async () => {
    const mock = new MockEmailProvider();
    await mock.verstuur(BERICHT);
    expect(mock.laatsteBericht?.aan).toBe("a@b.test");
  });

  describe("residentie-slot in productie", () => {
    beforeEach(() => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("VERCEL_ENV", "production");
      vi.stubEnv("EMAIL_FROM", "aanvragen@vakbalie.nl");
    });

    it.each(["", "mock"])("weigert EMAIL_PROVIDER=%s", (provider) => {
      vi.stubEnv("EMAIL_PROVIDER", provider);
      expect(getEmailProvider().naam).toBe("geweigerd");
    });

    it("laat SES door", () => {
      vi.stubEnv("EMAIL_PROVIDER", "ses");
      expect(getEmailProvider().naam).toBe("ses");
    });

    it("laat een andere provider alleen door met ALLOW_NON_EU_EMAIL=true", () => {
      vi.stubEnv("EMAIL_PROVIDER", "mock");
      vi.stubEnv("ALLOW_NON_EU_EMAIL", "1");
      expect(getEmailProvider().naam).toBe("geweigerd");
      resetEmailProviderForTests();
      vi.stubEnv("ALLOW_NON_EU_EMAIL", "true");
      expect(getEmailProvider().naam).toBe("mock");
    });

    it("weigert elke provider zolang EMAIL_CATCH_ALL bestaat", () => {
      vi.stubEnv("EMAIL_PROVIDER", "ses");
      vi.stubEnv("EMAIL_CATCH_ALL", "test@example.com");
      expect(getEmailProvider().naam).toBe("geweigerd");
    });

    it("geldt niet op een preview-deploy", () => {
      vi.stubEnv("VERCEL_ENV", "preview");
      vi.stubEnv("EMAIL_PROVIDER", "");
      vi.stubEnv("EMAIL_CATCH_ALL", "test@example.com");
      expect(getEmailProvider().naam).toBe("mock");
    });
  });
});
