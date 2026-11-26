/**
 * Presentatie-helpers voor het dashboard: NL-labels en
 * datumnotatie. Geen logica — de waardes komen altijd uit de database
 * (gevalideerd bij opslag), nooit rechtstreeks uit LLM-output.
 */

export const LEAD_STATUSSEN = ["new", "contacted", "qualified", "lost", "won"] as const;

export type LeadStatus = (typeof LEAD_STATUSSEN)[number];

export const STATUS_LABELS: Record<LeadStatus, string> = {
  new: "Nieuw",
  contacted: "Benaderd",
  qualified: "Gekwalificeerd",
  lost: "Verloren",
  won: "Gewonnen",
};

// Expliciet Europe/Amsterdam: Vercel draait in UTC en de hovenier niet.
const datumFormat = new Intl.DateTimeFormat("nl-NL", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Europe/Amsterdam",
});

const datumTijdFormat = new Intl.DateTimeFormat("nl-NL", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Amsterdam",
});

export function formatDatum(iso: string): string {
  return datumFormat.format(new Date(iso));
}

export function formatDatumTijd(iso: string): string {
  return datumTijdFormat.format(new Date(iso));
}
