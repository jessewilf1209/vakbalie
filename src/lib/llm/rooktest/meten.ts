import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { berekenKosten, leesDagBudgetConfig } from "../budget";
import type {
  LlmBron,
  LlmProvider,
  LlmStructuredRequest,
  LlmStructuredResult,
  LlmUsage,
} from "../types";

/**
 * Hulpcode voor de rooktests tegen een echt model. Alleen hier gebruikt;
 * de applicatie zelf meet via de dagrem en de meetlaag.
 */

/** Tenant-ID voor rooktests. Bestaat nergens; de kale provider schrijft niets weg. */
export const ROOKTEST_TENANT = "00000000-0000-4000-8000-0000000000ff";

export interface Aanroep {
  bron: LlmBron;
  usage: LlmUsage;
  milliseconden: number;
}

/**
 * Zit om de echte provider heen en onthoudt per aanroep het verbruik en de
 * duur. Verandert niets aan verzoek of antwoord.
 */
export class MetendeProvider implements LlmProvider {
  readonly aanroepen: Aanroep[] = [];
  /**
   * De laatste fout van het model. De intake-engine vangt fouten af en valt
   * terug op een vaste zin; zonder dit zie je in de rooktest niet wáárom.
   */
  laatsteFout: string | undefined;

  constructor(private readonly binnen: LlmProvider) {}

  get name(): string {
    return this.binnen.name;
  }

  get model(): string {
    return this.binnen.model;
  }

  async completeStructured(request: LlmStructuredRequest): Promise<LlmStructuredResult> {
    const start = Date.now();
    let resultaat: LlmStructuredResult;
    try {
      resultaat = await this.binnen.completeStructured(request);
    } catch (fout) {
      this.laatsteFout = fout instanceof Error ? fout.message : String(fout);
      throw fout;
    }
    this.aanroepen.push({
      bron: request.context.bron,
      usage: resultaat.usage,
      milliseconden: Date.now() - start,
    });
    return resultaat;
  }
}

/** Kosten in dollars volgens de tarieven uit de configuratie (`LLM_PRIJS_*`). */
export function kostenInDollars(usage: LlmUsage): number {
  return berekenKosten(usage, leesDagBudgetConfig()) / 10_000;
}

export function totaal(aanroepen: Aanroep[]): Required<LlmUsage> & { dollars: number } {
  const som = { inputTokens: 0, outputTokens: 0, cacheSchrijfTokens: 0, cacheLeesTokens: 0 };
  let dollars = 0;
  for (const a of aanroepen) {
    som.inputTokens += a.usage.inputTokens;
    som.outputTokens += a.usage.outputTokens;
    som.cacheSchrijfTokens += a.usage.cacheSchrijfTokens ?? 0;
    som.cacheLeesTokens += a.usage.cacheLeesTokens ?? 0;
    dollars += kostenInDollars(a.usage);
  }
  return { ...som, dollars };
}

/** Markdown-tabel met verbruik per aanroep en een totaalregel. */
export function verbruikTabel(aanroepen: Aanroep[]): string {
  const regels = [
    "| # | Bron | Input | Output | Cache schrijven | Cache lezen | Duur | Kosten |",
    "|---|---|---:|---:|---:|---:|---:|---:|",
    ...aanroepen.map(
      (a, i) =>
        `| ${i + 1} | ${a.bron} | ${a.usage.inputTokens} | ${a.usage.outputTokens} | ` +
        `${a.usage.cacheSchrijfTokens ?? 0} | ${a.usage.cacheLeesTokens ?? 0} | ` +
        `${(a.milliseconden / 1000).toFixed(1)} s | $${kostenInDollars(a.usage).toFixed(4)} |`,
    ),
  ];
  const t = totaal(aanroepen);
  regels.push(
    `| | **Totaal** | **${t.inputTokens}** | **${t.outputTokens}** | **${t.cacheSchrijfTokens}** | ` +
      `**${t.cacheLeesTokens}** | | **$${t.dollars.toFixed(4)}** |`,
  );
  return regels.join("\n");
}

/**
 * Schrijft het rapport naar `rooktest-resultaten/` (staat in .gitignore) en
 * geeft het pad terug. Alleen verzonnen testdata, maar modeluitvoer hoort
 * niet ongezien in git.
 */
export function schrijfRapport(naam: string, inhoud: string): string {
  const map = path.resolve(process.cwd(), "rooktest-resultaten");
  mkdirSync(map, { recursive: true });
  const stempel = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const bestand = path.join(map, `${stempel}-${naam}.md`);
  writeFileSync(bestand, inhoud, "utf8");
  return bestand;
}

/** Kop van elk rapport: welk model, welke tarieven. */
export function rapportKop(titel: string, provider: LlmProvider): string {
  const config = leesDagBudgetConfig();
  return [
    `# ${titel}`,
    "",
    `- Datum: ${new Date().toISOString()}`,
    `- Provider: ${provider.name}`,
    `- Model: ${provider.model}`,
    `- Tarieven (uit LLM_PRIJS_*): $${config.prijsInputPerMtok / 10_000} input en ` +
      `$${config.prijsOutputPerMtok / 10_000} output per miljoen tokens`,
    "- Alle gegevens in deze test zijn verzonnen.",
    "",
  ].join("\n");
}
