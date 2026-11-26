import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { verwerkIntakeBeurt } from "@/lib/intake/engine";
import { hovenierProfiel } from "@/lib/intake/profiel";
import { nieuweIntakeState, type IntakeState } from "@/lib/intake/types";
import { getProviderVoorRooktest } from "@/lib/llm";
import { genereerBelscript, genereerOpvolgmail, type OpvolgLead } from "@/lib/opvolgen/generatie";
import {
  MetendeProvider,
  ROOKTEST_TENANT,
  rapportKop,
  schrijfRapport,
  totaal,
  verbruikTabel,
} from "./meten";

/**
 * Rooktest tegen een echt model:
 * één volledig, verzonnen intakegesprek via de echte engine, daarna een
 * opvolgmail en een belscript. Meet per aanroep tokens, cache en kosten,
 * zodat de kostenschatting en de vraag "werkt prompt caching?"
 * met echte cijfers beantwoord worden.
 *
 * Draaien: `pnpm rooktest:llm`, met in .env.local LLM_PROVIDER=bedrock en
 * AWS_PROFILE (na `aws login`), of LLM_PROVIDER=anthropic met een dev-key.
 */

/** Wat de verzonnen bezoeker achtereenvolgens zegt. */
const BEZOEKER = [
  "Hoi, ik wil mijn achtertuin laten opknappen.",
  "Het is nu vooral gras en wat oude tegels. Ik wil een terras met nieuwe bestrating en een border met vaste planten.",
  "De tuin is ongeveer 60 m2.",
  "Ik woon in Amersfoort.",
  "Het liefst binnen twee maanden.",
  "Budget denk ik tussen de 5000 en 8000 euro.",
  "Ja hoor, dat is goed. Jullie mogen mijn gegevens daarvoor gebruiken.",
  "Ik ben Jan Testpersoon, mijn mail is jan.testpersoon@example.com",
  "Nee, dat was het. Bedankt!",
  "Klopt allemaal.",
];

const FALLBACK = "Sorry, dat ging even mis aan mijn kant";
const STREEPJES = /[–—]/;

describe("rooktest: volledig gesprek tegen een echt model", () => {
  let llm: MetendeProvider;
  const verslag: string[] = [];
  let state: IntakeState = nieuweIntakeState();

  beforeAll(() => {
    llm = new MetendeProvider(getProviderVoorRooktest());
  });

  afterAll(() => {
    if (!llm) return;
    const t = totaal(llm.aanroepen.filter((a) => a.bron === "intake"));
    const intakeAanroepen = llm.aanroepen.filter((a) => a.bron === "intake");
    const cacheGelezen = intakeAanroepen.some((a) => (a.usage.cacheLeesTokens ?? 0) > 0);
    const pad = schrijfRapport(
      "gesprek",
      [
        rapportKop("Rooktest: volledig gesprek", llm),
        "## Gesprek",
        "",
        ...verslag,
        "",
        "## Eindstand",
        "",
        "```json",
        JSON.stringify(state, null, 2),
        "```",
        "",
        "## Verbruik per aanroep",
        "",
        verbruikTabel(llm.aanroepen),
        "",
        "## Conclusies",
        "",
        `- Kosten van het intakegesprek: $${t.dollars.toFixed(4)} ` +
          `(${intakeAanroepen.length} aanroepen).`,
        `- Prompt caching: ${
          cacheGelezen
            ? "werkt, er zijn tokens uit de cache gelezen."
            : "werkt NIET (0 cache-leestokens). De system prompt zit waarschijnlijk onder het cacheminimum van het model;"
        }`,
      ].join("\n"),
    );
    console.log(`\nRapport: ${pad}\n`);
  });

  it("voert de intake tot het einde, met geldige gestructureerde output", async () => {
    const geschiedenis: { role: "user" | "assistant"; content: string }[] = [];

    for (const bericht of BEZOEKER) {
      const resultaat = await verwerkIntakeBeurt({
        profiel: hovenierProfiel,
        state,
        geschiedenis,
        bezoekersBericht: bericht,
        llm,
        context: { tenantId: ROOKTEST_TENANT, conversationId: "rooktest-gesprek" },
      });
      verslag.push(`**Bezoeker:** ${bericht}`, "", `**Assistent:** ${resultaat.antwoord}`, "");
      geschiedenis.push(
        { role: "user", content: bericht },
        { role: "assistant", content: resultaat.antwoord },
      );
      state = resultaat.state;

      // De engine valt bij ongeldige output of een LLM-fout terug op een
      // vaste zin. In een rooktest is dat een fout, geen stille terugval.
      expect(
        resultaat.antwoord,
        `engine viel terug op het foutantwoord (laatste fout: ${llm.laatsteFout ?? "geen, dus ongeldige output"})`,
      ).not.toContain(FALLBACK);
      expect(resultaat.status).not.toBe("limiet_bereikt");
      if (resultaat.status === "afgerond") break;
    }

    // Per beurt hooguit één aanroep: een tweede betekent een retry wegens ongeldige output.
    expect(llm.aanroepen.length).toBe(state.aantalBerichten);
    expect(state.afgerond, "intake niet afgerond met alle antwoorden").toBe(true);
    expect(state.consent.gegeven).toBe(true);
    expect(state.velden.plaats).toMatch(/amersfoort/i);
    expect(state.velden.contactEmail).toBe("jan.testpersoon@example.com");
    expect(state.velden.timing).toBe("1_3_maanden");
  });

  it("schrijft een opvolgmail volgens de regels", async () => {
    const lead: OpvolgLead = {
      contactNaam: state.velden.contactNaam ?? "Jan Testpersoon",
      plaats: state.velden.plaats,
      projectType: state.velden.projectType,
      wensen: state.velden.wensen,
      budgetIndicatie: state.velden.budgetIndicatie,
      timing: state.velden.timing,
    };
    const mail = await genereerOpvolgmail(
      {
        bedrijfsnaam: "Testhoveniers BV",
        lead,
        instructieVakman: "Ik kan volgende week dinsdag langskomen om te kijken.",
      },
      llm,
      ROOKTEST_TENANT,
    );
    verslag.push("## Opvolgmail", "", `**Onderwerp:** ${mail.onderwerp}`, "", mail.tekst, "");

    expect(mail.tekst).toContain("Met vriendelijke groet");
    expect(mail.tekst).toContain("Testhoveniers BV");
    expect(STREEPJES.test(mail.onderwerp + mail.tekst), "em- of en-dash in de mail").toBe(false);
  });

  it("schrijft een belscript volgens de regels", async () => {
    const script = await genereerBelscript(
      {
        bedrijfsnaam: "Testhoveniers BV",
        lead: {
          contactNaam: "Jan Testpersoon",
          plaats: "Amersfoort",
          projectType: "Bestrating en border",
          wensen: "Terras met nieuwe bestrating en een border met vaste planten",
          timing: "1_3_maanden",
        },
      },
      llm,
      ROOKTEST_TENANT,
    );
    verslag.push(
      "## Belscript",
      "",
      `**Opening:** ${script.opening}`,
      "",
      ...script.punten.map((p) => `- ${p}`),
      "",
      `**Afsluiting:** ${script.afsluiting}`,
      "",
    );

    expect(script.punten.length).toBeGreaterThanOrEqual(2);
    expect(STREEPJES.test(JSON.stringify(script)), "em- of en-dash in het belscript").toBe(false);
  });
});
