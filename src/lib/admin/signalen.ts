import type { TenantCijfers } from "./cijfers-types";

/**
 * Signalen voor het admin-overzicht. Berekend,
 * alleen zichtbaar in het dashboard, geen mail. De drempels staan hier bij
 * elkaar, zodat ze na de pilot op echte cijfers bij te stellen zijn.
 */

export const DREMPELS = {
  /** Dagen zonder gesprek voordat een actieve klant opvalt. */
  dagenZonderGesprek: 7,
  /** Kosten per gesprek ten opzichte van het platformgemiddelde. */
  kostenFactor: 2,
  /** Minimaal aantal gesprekken voordat een kostenvergelijking iets zegt. */
  minGesprekkenVoorVergelijking: 3,
  /** Dagrem-percentage waarboven het platform opvalt. */
  dagremProcent: 80,
  /** Weigeringen (rate limit, dagrem, budget) die op een bot kunnen wijzen. */
  minWeigeringen: 20,
} as const;

export type SignaalSoort =
  "geen_gesprekken" | "dure_gesprekken" | "dagrem_hoog" | "veel_weigeringen";

export interface Signaal {
  soort: SignaalSoort;
  /** Leeg bij een platformbreed signaal. */
  tenantId?: string;
  titel: string;
  uitleg: string;
}

export interface SignaalInvoer {
  /** Cijfers per klant over de laatste 7 dagen. */
  tenants: TenantCijfers[];
  /** Stand van de dagrem vandaag en het plafond, beide in eenheden. */
  dagremStand: number;
  dagremPlafond: number;
  nu?: Date;
}

const DAG_MS = 86_400_000;

export function bepaalSignalen(invoer: SignaalInvoer): Signaal[] {
  const nu = invoer.nu ?? new Date();
  const signalen: Signaal[] = [];

  const procent = invoer.dagremPlafond > 0 ? (invoer.dagremStand / invoer.dagremPlafond) * 100 : 0;
  if (procent >= DREMPELS.dagremProcent) {
    signalen.push({
      soort: "dagrem_hoog",
      titel: `Dagrem op ${Math.round(procent)}%`,
      uitleg:
        "Het platform loopt tegen het dagplafond voor AI-kosten aan. Boven 100% ronden gesprekken af zonder AI.",
    });
  }

  // Gemiddelde intakekosten per gesprek over alle klanten met genoeg gesprekken.
  const vergelijkbaar = invoer.tenants.filter(
    (t) => t.gesprekken >= DREMPELS.minGesprekkenVoorVergelijking,
  );
  const totaalKosten = vergelijkbaar.reduce((som, t) => som + t.kostenIntake, 0);
  const totaalGesprekken = vergelijkbaar.reduce((som, t) => som + t.gesprekken, 0);
  const gemiddeld = totaalGesprekken > 0 ? totaalKosten / totaalGesprekken : 0;

  for (const t of invoer.tenants) {
    const actief = t.status === "active" || t.status === "trial";

    if (actief) {
      const laatste = t.laatsteGesprek?.getTime();
      const dagen = laatste === undefined ? null : Math.floor((nu.getTime() - laatste) / DAG_MS);
      if (dagen === null || dagen >= DREMPELS.dagenZonderGesprek) {
        signalen.push({
          soort: "geen_gesprekken",
          tenantId: t.tenantId,
          titel: `${t.naam}: ${dagen === null ? "nog nooit een gesprek" : `${dagen} dagen geen gesprek`}`,
          uitleg:
            "Vaak een kapotte widget, bijvoorbeeld door een ontbrekend domein in allowed_origins. De klant merkt het zelf meestal niet.",
        });
      }
    }

    if (gemiddeld > 0 && t.gesprekken >= DREMPELS.minGesprekkenVoorVergelijking) {
      const perGesprek = t.kostenIntake / t.gesprekken;
      if (perGesprek > gemiddeld * DREMPELS.kostenFactor) {
        signalen.push({
          soort: "dure_gesprekken",
          tenantId: t.tenantId,
          titel: `${t.naam}: ${(perGesprek / gemiddeld).toFixed(1)}x de gemiddelde kosten per gesprek`,
          uitleg: "Mogelijk een lus, misbruik of een prompt die uit de hand loopt.",
        });
      }
    }

    const weigeringen = t.rateLimitGeweigerd + t.dagremGeweigerd + t.afgerondOpBudget;
    if (weigeringen >= DREMPELS.minWeigeringen && weigeringen > t.gesprekken) {
      signalen.push({
        soort: "veel_weigeringen",
        tenantId: t.tenantId,
        titel: `${t.naam}: ${weigeringen} weigeringen in 7 dagen`,
        uitleg: "Meer weigeringen dan gesprekken. Mogelijk een bot op die site.",
      });
    }
  }

  return signalen;
}
