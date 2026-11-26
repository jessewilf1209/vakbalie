import type { BudgetIndicatie, IntakeVelden, Timing } from "./types";

/**
 * Leesbare samenvatting voor de bevestigingskaart in de widget
 * Gebouwd uit de al
 * gevalideerde server-side staat — nooit rechtstreeks uit LLM-output.
 */

export const BUDGET_LABELS: Record<BudgetIndicatie, string> = {
  tot_2500: "Tot € 2.500",
  "2500_10000": "€ 2.500 tot € 10.000",
  "10000_plus": "Meer dan € 10.000",
  onbekend: "Nog geen budget bepaald",
};

export const TIMING_LABELS: Record<Timing, string> = {
  binnen_1_maand: "Binnen een maand",
  "1_3_maanden": "Binnen 1 tot 3 maanden",
  "3_6_maanden": "Binnen 3 tot 6 maanden",
  later: "Later",
  onbekend: "Nog niet bekend",
};

export interface SamenvattingsRegel {
  label: string;
  waarde: string;
}

export function bouwSamenvatting(v: IntakeVelden, aantalFotos: number): SamenvattingsRegel[] {
  const regels: SamenvattingsRegel[] = [];

  const voegToe = (label: string, waarde: string | undefined) => {
    if (waarde && waarde.trim().length > 0) regels.push({ label, waarde });
  };

  voegToe("Naam", v.contactNaam);
  voegToe("E-mail", v.contactEmail);
  voegToe("Telefoon", v.contactTelefoon);
  voegToe("Plaats", v.plaats);
  voegToe("Werkzaamheden", v.projectType);
  voegToe("Wensen", v.wensen);
  voegToe("Tuingrootte", v.tuinGrootte);
  if (v.budgetIndicatie) voegToe("Budget", BUDGET_LABELS[v.budgetIndicatie]);
  if (v.timing) voegToe("Startmoment", TIMING_LABELS[v.timing]);
  if (aantalFotos > 0) voegToe("Foto's", `${aantalFotos} bijgevoegd`);

  return regels;
}
