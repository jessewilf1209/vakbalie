/**
 * Kanaal-onafhankelijke intake-engine.
 *
 * De engine kent geen widget-begrippen: input is "bericht van bezoeker",
 * output is "antwoord + bijgewerkte staat". De widget is de eerste adapter;
 * WhatsApp kan later een tweede zijn.
 */

/** Categorische timing — maakt leadscore-regels deterministisch. */
export const TIMING_WAARDEN = [
  "binnen_1_maand",
  "1_3_maanden",
  "3_6_maanden",
  "later",
  "onbekend",
] as const;
export type Timing = (typeof TIMING_WAARDEN)[number];

/** Categorische budgetindicatie, idem. */
export const BUDGET_WAARDEN = ["tot_2500", "2500_10000", "10000_plus", "onbekend"] as const;
export type BudgetIndicatie = (typeof BUDGET_WAARDEN)[number];

/** Door de intake verzamelde velden. Alles optioneel tot het bekend is. */
export interface IntakeVelden {
  plaats?: string;
  projectType?: string;
  wensen?: string;
  tuinGrootte?: string;
  budgetIndicatie?: BudgetIndicatie;
  timing?: Timing;
  contactNaam?: string;
  contactEmail?: string;
  contactTelefoon?: string;
}

/** Server-side gespreksstaat: de engine onthoudt, niet de LLM (kosten!). */
export interface IntakeState {
  velden: IntakeVelden;
  /** AVG: expliciete toestemming vóór contactgegevens worden opgeslagen. */
  consent: { gegeven: boolean; tijdstip?: string };
  /** Aantal bezoekersberichten (limiet). */
  aantalBerichten: number;
  /** Cumulatief tokenverbruik van dit gesprek (budgetbewaking). */
  tokens: { input: number; output: number };
  afgerond: boolean;
}

export function nieuweIntakeState(): IntakeState {
  return {
    velden: {},
    consent: { gegeven: false },
    aantalBerichten: 0,
    tokens: { input: 0, output: 0 },
    afgerond: false,
  };
}

export type IntakeTurnStatus = "actief" | "afgerond" | "limiet_bereikt";

export interface IntakeTurnResult {
  /** Antwoord aan de bezoeker (platte tekst; renderer escapet). */
  antwoord: string;
  state: IntakeState;
  status: IntakeTurnStatus;
  /**
   * Alleen bij `limiet_bereikt`: het eigen budget van het gesprek
   * of de platformbrede dagrem. Voor de meting per klant.
   */
  limietReden?: "gespreksbudget" | "dagrem";
}
