import "server-only";
import { EENHEDEN_PER_DOLLAR } from "@/lib/admin/geld";
import { registreerLlmGebruik, type LlmGebruikRij } from "@/lib/meting";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  LlmBudgetError,
  LlmError,
  type LlmProvider,
  type LlmStructuredRequest,
  type LlmStructuredResult,
  type LlmUsage,
} from "./types";

/**
 * Platformbrede dagrem op de AI-kosten (verplicht vóór livegang).
 *
 * Bij AWS bestaat geen prepaid plafond, en de lagen begrenzen
 * per gesprek, per IP en per tenant, maar niet het totaal over alle tenants.
 * Deze wrapper om de echte provider houdt de dagkosten bij en weigert elke
 * aanroep zodra het plafond is bereikt.
 *
 * Geld is integer: alle bedragen zijn in tienduizendsten van een dollar.
 *
 * Daarnaast een dagrem per klant (plafondPerKlant): zonder die rem kan één
 * klant die bestookt wordt (bots, misbruik van de widget) het hele
 * platformbudget opmaken, waarna de AI voor alle klanten stilvalt. Met de
 * rem per klant stopt alleen die ene klant.
 *
 * Bekende beperking: de controle en het optellen zijn twee stappen. Bij
 * gelijktijdige aanroepen kan het plafond met de kosten van de lopende
 * aanroepen worden overschreden. Elke aanroep is begrensd door max_tokens,
 * dus dat is een klein bedrag.
 */

const TOKENS_PER_MTOK = 1_000_000;
const DAG_IN_SECONDEN = 86_400;
const TELLER_SLEUTEL = "llm-kosten:dag";
const klantSleutel = (tenantId: string) => `llm-kosten:dag:tenant:${tenantId}`;
const WAARSCHUWINGSDREMPELS = [50, 80] as const;

/**
 * Defaults voor als de configuratie ontbreekt: Claude Haiku 4.5 via een
 * EU-profiel, inclusief 10% toeslag. Een ontbrekende prijs mag de rem nooit
 * te ruim afstellen, dus dit is bewust het duurste van de twee modellen.
 *
 * Bij Haiku 5.5 overschatten deze defaults de kosten ongeveer tien keer
 * (Anthropic-lijstprijs 2026-11-23: $0,10 in en $0,50 uit, met EU-toeslag
 * $0,11 en $0,55). De rem is dan veilig maar veel te streng.
 * shortcut: defaults blijven op 4.5 tot het Bedrock-tarief van 5.5 bevestigd
 * is; zet bij de wissel LLM_PRIJS_* samen met BEDROCK_MODEL_ID.
 */
const DEFAULTS = {
  LLM_DAGPLAFOND_USD: "5",
  LLM_PRIJS_INPUT_PER_MTOK: "1.10",
  LLM_PRIJS_OUTPUT_PER_MTOK: "5.50",
  /** Per klant: 40% van het standaardplafond, dus minstens drie klanten tegelijk. */
  LLM_DAGPLAFOND_PER_KLANT_USD: "2",
} as const;

export interface DagBudgetConfig {
  /** Dagplafond in tienduizendsten van een dollar. */
  plafond: number;
  /** Prijs per miljoen inputtokens, in tienduizendsten van een dollar. */
  prijsInputPerMtok: number;
  /** Prijs per miljoen outputtokens, in tienduizendsten van een dollar. */
  prijsOutputPerMtok: number;
  /**
   * Dagplafond per klant, in tienduizendsten van een dollar. Zonder waarde
   * geen rem per klant (alleen de platformrem).
   */
  plafondPerKlant?: number;
}

/** Telt `delta` op bij de dagteller van één klant en geeft de nieuwe stand. */
export type KlantTeller = (tenantId: string, delta: number) => Promise<number>;

/** Telt `delta` op bij de dagteller en geeft de nieuwe stand; `delta` 0 leest alleen. */
export type DagTeller = (delta: number) => Promise<number>;

/** Legt één aanroep vast in de meetlaag. Mag nooit gooien. */
export type GebruikMeting = (rij: LlmGebruikRij) => Promise<void>;

function leesBedrag(bron: NodeJS.ProcessEnv, naam: keyof typeof DEFAULTS): number {
  const tekst = bron[naam]?.trim() || DEFAULTS[naam];
  const dollars = Number(tekst);
  if (!/^\d+(\.\d+)?$/.test(tekst) || !Number.isFinite(dollars) || dollars <= 0) {
    throw new LlmError(`${naam} moet een positief bedrag in dollars zijn`, false);
  }
  return Math.round(dollars * EENHEDEN_PER_DOLLAR);
}

/**
 * Leest plafond en tarieven uit de omgeving. De tarieven staan in de
 * configuratie en niet in de code, want ze veranderen per model. Een
 * ongeldige waarde is een fout en geen stille terugval (fail-closed).
 */
export function leesDagBudgetConfig(bron: NodeJS.ProcessEnv = process.env): DagBudgetConfig {
  return {
    plafond: leesBedrag(bron, "LLM_DAGPLAFOND_USD"),
    prijsInputPerMtok: leesBedrag(bron, "LLM_PRIJS_INPUT_PER_MTOK"),
    prijsOutputPerMtok: leesBedrag(bron, "LLM_PRIJS_OUTPUT_PER_MTOK"),
    plafondPerKlant: leesBedrag(bron, "LLM_DAGPLAFOND_PER_KLANT_USD"),
  };
}

/**
 * Prompt caching, als percentage van het inputtarief: schrijven in de cache
 * kost 125%, lezen eruit 10% (de standaardverhouding van Anthropic voor de
 * cache van 5 minuten). Zonder deze regel zou de rem te laag tellen
 * zodra caching gaat werken.
 */
const CACHE_SCHRIJF_PROCENT = 125;
const CACHE_LEES_PROCENT = 10;

/** Kosten van één aanroep, naar boven afgerond op een tienduizendste dollar. */
export function berekenKosten(usage: LlmUsage, config: DagBudgetConfig): number {
  // Alles in honderdsten van het inputtarief, zodat het integer blijft.
  const inputHonderdsten =
    usage.inputTokens * 100 +
    (usage.cacheSchrijfTokens ?? 0) * CACHE_SCHRIJF_PROCENT +
    (usage.cacheLeesTokens ?? 0) * CACHE_LEES_PROCENT;
  const teller =
    inputHonderdsten * config.prijsInputPerMtok +
    usage.outputTokens * config.prijsOutputPerMtok * 100;
  return Math.ceil(teller / (TOKENS_PER_MTOK * 100));
}

const databaseTeller: DagTeller = async (delta) => {
  const { data, error } = await getSupabaseAdmin().rpc("verhoog_teller", {
    p_sleutel: TELLER_SLEUTEL,
    p_venster_seconden: DAG_IN_SECONDEN,
    p_delta: delta,
  });
  if (error || typeof data !== "number") {
    throw new Error(`verhoog_teller mislukt (${error?.code ?? "geen getal"})`);
  }
  return data;
};

const databaseKlantTeller: KlantTeller = async (tenantId, delta) => {
  const { data, error } = await getSupabaseAdmin().rpc("verhoog_teller", {
    p_sleutel: klantSleutel(tenantId),
    p_venster_seconden: DAG_IN_SECONDEN,
    p_delta: delta,
  });
  if (error || typeof data !== "number") {
    throw new Error(`verhoog_teller mislukt (${error?.code ?? "geen getal"})`);
  }
  return data;
};

function alsDollars(eenheden: number): string {
  return (eenheden / EENHEDEN_PER_DOLLAR).toFixed(2);
}

/**
 * De dagrem is ook het enige meetpunt van de meetlaag: elke echte
 * aanroep komt hier langs, en de rij in `llm_gebruik` krijgt exact het bedrag
 * dat op de teller wordt opgeteld. De som per klant klopt dus met de rem.
 */
export class DagBudgetProvider implements LlmProvider {
  readonly name: string;
  readonly model: string;

  constructor(
    private readonly provider: LlmProvider,
    private readonly config: DagBudgetConfig,
    private readonly teller: DagTeller = databaseTeller,
    private readonly meting: GebruikMeting = registreerLlmGebruik,
    private readonly klantTeller: KlantTeller = databaseKlantTeller,
  ) {
    // Logging en kostenmonitoring blijven de echte provider zien.
    this.name = provider.name;
    this.model = provider.model;
  }

  async completeStructured(request: LlmStructuredRequest): Promise<LlmStructuredResult> {
    const tenantId = request.context.tenantId;
    const perKlant = this.config.plafondPerKlant;
    let stand: number;
    let klantStand = 0;
    try {
      stand = await this.teller(0);
      if (perKlant !== undefined) klantStand = await this.klantTeller(tenantId, 0);
    } catch (fout) {
      // Fail-closed, net als de rate limits: liever even dicht dan een
      // onbewaakt AI-budget.
      console.error("dagbudget niet te controleren, LLM-aanroep geweigerd", {
        melding: fout instanceof Error ? fout.message : "onbekend",
      });
      throw new LlmError("dagbudget voor AI-kosten niet te controleren", false);
    }

    if (stand >= this.config.plafond) {
      console.error("dagbudget voor AI-kosten bereikt, LLM-aanroep geweigerd", {
        standUsd: alsDollars(stand),
        plafondUsd: alsDollars(this.config.plafond),
      });
      throw new LlmBudgetError();
    }
    if (perKlant !== undefined && klantStand >= perKlant) {
      // Alleen het id loggen, nooit de naam van de klant of inhoud.
      console.error("dagbudget per klant bereikt, LLM-aanroep geweigerd", {
        tenantId,
        standUsd: alsDollars(klantStand),
        plafondUsd: alsDollars(perKlant),
      });
      throw new LlmBudgetError();
    }
    const resultaat = await this.provider.completeStructured(request);
    const kosten = berekenKosten(resultaat.usage, this.config);
    await Promise.all([
      this.boekKosten(kosten),
      this.boekKlantKosten(tenantId, kosten),
      this.meet(request, resultaat.usage, kosten),
    ]);
    return resultaat;
  }

  private async meet(request: LlmStructuredRequest, usage: LlmUsage, kosten: number) {
    try {
      await this.meting({
        tenantId: request.context.tenantId,
        conversationId: request.context.conversationId,
        bron: request.context.bron,
        provider: this.name,
        model: this.model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheSchrijfTokens: usage.cacheSchrijfTokens ?? 0,
        cacheLeesTokens: usage.cacheLeesTokens ?? 0,
        kostenEenheden: kosten,
      });
    } catch {
      // De standaardmeting gooit nooit; dit vangt een kapotte vervanger af.
      console.error("meting: llm-gebruik niet vastgelegd", { bron: request.context.bron });
    }
  }

  private async boekKlantKosten(tenantId: string, kosten: number): Promise<void> {
    if (this.config.plafondPerKlant === undefined) return;
    try {
      await this.klantTeller(tenantId, kosten);
    } catch (fout) {
      // Zelfde redenering als boekKosten: het antwoord is al betaald.
      console.error("dagbudget per klant: kosten niet geboekt", {
        tenantId,
        melding: fout instanceof Error ? fout.message : "onbekend",
      });
    }
  }

  private async boekKosten(kosten: number): Promise<void> {
    let nieuweStand: number;
    try {
      nieuweStand = await this.teller(kosten);
    } catch (fout) {
      // De aanroep is al betaald; het antwoord weggooien helpt niemand. De
      // volgende aanroep strandt op de controle vooraf als de database weg is.
      console.error("dagbudget: kosten niet geboekt", {
        melding: fout instanceof Error ? fout.message : "onbekend",
        kostenUsd: alsDollars(kosten),
      });
      return;
    }

    // Het optellen is atomair en geeft de nieuwe stand terug, dus precies één
    // aanroep per dag ziet de teller een drempel passeren.
    const vorigeStand = nieuweStand - kosten;
    for (const procent of WAARSCHUWINGSDREMPELS) {
      const drempel = (this.config.plafond * procent) / 100;
      if (vorigeStand < drempel && nieuweStand >= drempel) {
        console.warn(`dagbudget voor AI-kosten: ${procent}% bereikt`, {
          standUsd: alsDollars(nieuweStand),
          plafondUsd: alsDollars(this.config.plafond),
        });
      }
    }
  }
}
