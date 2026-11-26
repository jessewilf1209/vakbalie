/**
 * Bedragen in het admin-dashboard. In de database staan kosten als integer
 * tienduizendsten van een dollar (zelfde eenheid als de dagrem). We tonen
 * dollars, zoals AWS factureert, met een indicatie in euro's via een
 * instelbare koers.
 */

export const EENHEDEN_PER_DOLLAR = 10_000;

const USD = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "USD",
  currencyDisplay: "narrowSymbol",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const USD_FIJN = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "USD",
  currencyDisplay: "narrowSymbol",
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});
const EUR = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function alsDollars(eenheden: number): number {
  return eenheden / EENHEDEN_PER_DOLLAR;
}

/** Hele centen; voor kleine bedragen (per gesprek) vier decimalen. */
export function formatUsd(eenheden: number, fijn = false): string {
  return (fijn ? USD_FIJN : USD).format(alsDollars(eenheden));
}

/** Indicatie in euro's, of null als er geen koers is ingesteld. */
export function formatEurIndicatie(eenheden: number, eurPerUsd: number | null): string | null {
  if (eurPerUsd === null) return null;
  return `≈ ${EUR.format(alsDollars(eenheden) * eurPerUsd)}`;
}

/** Deling die bij 0 noemer null geeft in plaats van Infinity of NaN. */
export function perStuk(teller: number, noemer: number): number | null {
  return noemer > 0 ? teller / noemer : null;
}
