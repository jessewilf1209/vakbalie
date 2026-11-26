import type { TenantCijfers } from "./cijfers-types";

/**
 * Sorteren van de klantentabel in /admin/klanten. Sleutel en richting komen
 * uit de URL; alleen bekende waarden worden geaccepteerd.
 */

export const SORTEER_SLEUTELS = [
  "naam",
  "status",
  "gesprekken",
  "leads",
  "conversie",
  "kosten",
  "kosten_per_gesprek",
  "mails",
  "laatste_gesprek",
  "laatste_login",
] as const;
export type SorteerSleutel = (typeof SORTEER_SLEUTELS)[number];
export type Richting = "op" | "af";

export interface KlantRij extends TenantCijfers {
  /** Leads per gesprek, of null zonder gesprekken. */
  conversie: number | null;
  /** Intakekosten per gesprek in eenheden, of null zonder gesprekken. */
  kostenPerGesprek: number | null;
  mails: number;
}

export function naarKlantRij(t: TenantCijfers): KlantRij {
  return {
    ...t,
    conversie: t.gesprekken > 0 ? t.leads / t.gesprekken : null,
    kostenPerGesprek: t.gesprekken > 0 ? t.kostenIntake / t.gesprekken : null,
    mails: t.notificatiemails + t.opvolgmails,
  };
}

export function leesSortering(
  sleutel: string | string[] | undefined,
  richting: string | string[] | undefined,
): { sleutel: SorteerSleutel; richting: Richting } {
  const s = (SORTEER_SLEUTELS as readonly string[]).includes(String(sleutel))
    ? (sleutel as SorteerSleutel)
    : "kosten";
  const r: Richting =
    richting === "op" ? "op" : richting === "af" ? "af" : s === "naam" ? "op" : "af";
  return { sleutel: s, richting: r };
}

function waarde(rij: KlantRij, sleutel: SorteerSleutel): string | number | null {
  switch (sleutel) {
    case "naam":
      return rij.naam.toLocaleLowerCase("nl");
    case "status":
      return rij.status;
    case "gesprekken":
      return rij.gesprekken;
    case "leads":
      return rij.leads;
    case "conversie":
      return rij.conversie;
    case "kosten":
      return rij.kostenTotaal;
    case "kosten_per_gesprek":
      return rij.kostenPerGesprek;
    case "mails":
      return rij.mails;
    case "laatste_gesprek":
      return rij.laatsteGesprek?.getTime() ?? null;
    case "laatste_login":
      return rij.laatsteLogin?.getTime() ?? null;
  }
}

/** Sorteert een kopie. Lege waarden staan altijd onderaan, in beide richtingen. */
export function sorteerKlanten(
  rijen: KlantRij[],
  sleutel: SorteerSleutel,
  richting: Richting,
): KlantRij[] {
  const teken = richting === "op" ? 1 : -1;
  return [...rijen].sort((x, y) => {
    const a = waarde(x, sleutel);
    const b = waarde(y, sleutel);
    if (a === null && b === null) return x.naam.localeCompare(y.naam, "nl");
    if (a === null) return 1;
    if (b === null) return -1;
    const vergelijking =
      typeof a === "string" ? a.localeCompare(String(b), "nl") : a - (b as number);
    return vergelijking !== 0 ? vergelijking * teken : x.naam.localeCompare(y.naam, "nl");
  });
}
