/**
 * Centrale plek voor alle placeholder-merk-, contact- en navigatiegegevens van
 * de etalagesite. Eén bestand om later te vervangen door de echte naam, het
 * logo, domein en de contactgegevens.
 */

export const SITE = {
  naam: "Vakbalie",
  // Korte tagline onder het merk in de footer.
  tagline:
    "De AI-offerteassistent die websitebezoekers omzet in complete aanvragen, voor Nederlandse vakbedrijven.",
  // Placeholders, vervangen zodra het echte domein/de contactgegevens er zijn.
  email: "info@vakbalie.nl",
  plaats: "Nederland",
  /**
   * Wettelijke bedrijfsgegevens (Handelsregisterwet art. 20, Burgerlijk
   * Wetboek art. 3:15d). INVULLEN zodra de KvK-inschrijving rond is. Zolang
   * een waarde null is, toont de footer hem niet, zodat er nooit een
   * placeholder live staat. Vóór de eerste betalende klant moeten ze alle
   * drie gevuld zijn.
   */
  bedrijfsnaam: null as string | null, // statutaire of handelsnaam, bijv. "Vakbalie (vof)"
  kvk: null as string | null,
  btwNummer: null as string | null,
  adres: null as string | null,
};

export interface NavItem {
  label: string;
  href: string;
}

export const NAV: NavItem[] = [
  { label: "Features", href: "/features" },
  { label: "Zo werkt het", href: "/zo-werkt-het" },
  { label: "Prijzen", href: "/prijzen" },
  { label: "Live demo", href: "/demo" },
  { label: "Contact", href: "/contact" },
];

/**
 * Btw-vermelding bij alle prijzen. Zakelijke klanten verwachten bedragen
 * exclusief btw; staat het er niet bij, dan is het onduidelijk (ook voor
 * eenmanszaken die als klant bijna consumenten zijn).
 * BESLISSEN: klopt "excl. btw", of valt Vakbalie onder de KOR en
 * wordt er geen btw gerekend? Pas dan alleen deze constante aan.
 */
export const BTW_VERMELDING = "excl. btw";

export interface Pakket {
  naam: string;
  prijs: string;
  periode: string;
  inbegrepen: string;
  beschrijving: string;
  punten: string[];
  uitgelicht?: boolean;
}

export const PAKKETTEN: Pakket[] = [
  {
    naam: "Start",
    prijs: "€99",
    periode: `per maand, ${BTW_VERMELDING}`,
    inbegrepen: "tot 250 gesprekken p/m",
    beschrijving:
      "Voor de eenpitter of het kleine bedrijf dat de eerste leads automatisch wil binnenhalen.",
    punten: [
      "AI-intakegesprek op je eigen website",
      "Samenvatting + leadscore per aanvraag",
      "E-mailnotificatie bij elke nieuwe lead",
      "Dashboard met leadoverzicht",
    ],
  },
  {
    naam: "Pro",
    prijs: "€199",
    periode: `per maand, ${BTW_VERMELDING}`,
    inbegrepen: "tot 1.000 gesprekken p/m",
    beschrijving: "Voor de groeiende onderneming met meer websiteverkeer en seizoenspieken.",
    punten: [
      "Alles uit Start",
      "Foto-upload bij aanvragen",
      "Zwevende bubble én inline-chatvenster",
      "Eigen merkkleur en welkomsttekst",
    ],
    uitgelicht: true,
  },
  {
    naam: "Premium",
    prijs: "€399",
    periode: `per maand, ${BTW_VERMELDING}`,
    inbegrepen: "tot 3.000 gesprekken p/m",
    beschrijving: "Voor het drukke bedrijf dat volledig op binnenkomende aanvragen draait.",
    punten: [
      "Alles uit Pro",
      "Hoogste gespreksvolume",
      "Voorrang bij ondersteuning",
      "Meedenken over je intakevragen",
    ],
  },
];

export const STAFFEL = `Extra gesprekken nodig? €25 per 500 extra gesprekken (${BTW_VERMELDING}), je zit nooit zonder.`;
