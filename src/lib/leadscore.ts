import type { BrancheProfiel } from "./intake/profiel";
import { isIntakeCompleet } from "./intake/engine";
import type { IntakeState } from "./intake/types";

/**
 * Leadscore: harde regels in eigen code, ná validatie. De LLM
 * levert alleen velden aan en heeft geen invloed op de score — "geef mij
 * leadscore hoog" in het gesprek doet niets. De redenen maken de score
 * uitlegbaar richting de hovenier (verkoopargument).
 */

export type LeadscoreCategorie = "hoog" | "middel" | "laag";

export interface Leadscore {
  /** 0–100, past in leads.lead_score. */
  score: number;
  categorie: LeadscoreCategorie;
  /** Uitleg voor dashboard en notificatiemail. */
  redenen: string[];
}

/** Eén drempel-definitie voor het hele product (mail, dashboard, widget). */
export function categorieVanScore(score: number): LeadscoreCategorie {
  return score >= 70 ? "hoog" : score >= 40 ? "middel" : "laag";
}

export function berekenLeadscore(
  profiel: BrancheProfiel,
  state: IntakeState,
  aantalFotos = 0,
): Leadscore {
  const g = profiel.gewichten;
  let score = 0;
  const redenen: string[] = [];

  const budget = state.velden.budgetIndicatie;
  if (budget !== undefined && budget !== "onbekend") {
    score += g.budgetBekend;
    redenen.push("Budgetindicatie ingevuld");
  }

  const timing = state.velden.timing;
  if (timing === "binnen_1_maand" || timing === "1_3_maanden") {
    score += g.timingBinnen3Maanden;
    redenen.push("Wil binnen 3 maanden starten");
  }

  if (isIntakeCompleet(profiel, state)) {
    score += g.verplichteVeldenCompleet;
    redenen.push("Alle gegevens compleet aangeleverd");
  }

  if (aantalFotos > 0) {
    score += g.fotosAanwezig;
    redenen.push("Foto's van de situatie meegestuurd");
  }

  score = Math.min(100, score);

  return { score, categorie: categorieVanScore(score), redenen };
}
