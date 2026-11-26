import type { IntakeVelden } from "./types";

/**
 * Brancheprofiel: vragenset, terminologie en
 * leadscore-gewichten zijn DATA, geen code. Een nieuwe branche = een nieuw
 * profiel, geen verbouwing. Hovenier is nu het enige profiel; een
 * profiel-editor komt pas bij een tweede branche-klant.
 */

export interface VeldDefinitie {
  veld: keyof IntakeVelden;
  /** Korte omschrijving voor in de system prompt. */
  omschrijving: string;
  verplicht: boolean;
}

export interface LeadscoreGewichten {
  budgetBekend: number;
  timingBinnen3Maanden: number;
  verplichteVeldenCompleet: number;
  fotosAanwezig: number;
}

export interface BrancheProfiel {
  id: string;
  branche: string;
  assistentRol: string;
  /** Volgorde = gespreksvolgorde-voorkeur. Contact altijd als laatste. */
  velden: VeldDefinitie[];
  voorbeeldProjectTypes: string[];
  gewichten: LeadscoreGewichten;
}

export const hovenierProfiel: BrancheProfiel = {
  id: "hovenier",
  branche: "hoveniersbedrijf",
  assistentRol:
    "de digitale offerte-assistent van een hoveniersbedrijf; je helpt websitebezoekers " +
    "hun tuinwensen om te zetten in een complete offerte-aanvraag",
  velden: [
    {
      veld: "projectType",
      omschrijving:
        "soort werkzaamheden, kort (bijv. aanleg, renovatie, onderhoud, snoeien, bestrating)",
      verplicht: true,
    },
    {
      veld: "wensen",
      omschrijving: "beschrijving van de wensen in de woorden van de bezoeker",
      verplicht: true,
    },
    {
      veld: "tuinGrootte",
      omschrijving: "indicatie van de tuingrootte (bijv. 'ca. 80 m²' of 'klein stadstuintje')",
      verplicht: false,
    },
    {
      veld: "plaats",
      omschrijving: "woonplaats van de bezoeker (alleen de plaatsnaam)",
      verplicht: true,
    },
    {
      veld: "budgetIndicatie",
      omschrijving: "budgetindicatie als categorie: tot_2500, 2500_10000, 10000_plus of onbekend",
      verplicht: false,
    },
    {
      veld: "timing",
      omschrijving:
        "gewenste startmoment als categorie: binnen_1_maand, 1_3_maanden, 3_6_maanden, later of onbekend",
      verplicht: true,
    },
    {
      veld: "contactNaam",
      omschrijving: "naam van de bezoeker (pas vragen ná uitleg en toestemming)",
      verplicht: true,
    },
    {
      veld: "contactEmail",
      omschrijving: "e-mailadres (pas vragen ná uitleg en toestemming)",
      verplicht: true,
    },
    {
      veld: "contactTelefoon",
      omschrijving: "telefoonnummer (optioneel, pas vragen ná toestemming)",
      verplicht: false,
    },
  ],
  voorbeeldProjectTypes: [
    "tuinaanleg",
    "tuinrenovatie",
    "tuinonderhoud",
    "snoeien",
    "bestrating",
    "schutting of vlonder",
    "beplanting",
  ],
  gewichten: {
    budgetBekend: 30,
    timingBinnen3Maanden: 30,
    verplichteVeldenCompleet: 25,
    fotosAanwezig: 15,
  },
};
