import { TIJDZONE } from "@/lib/admin/periode";

/** Weergave van datums en percentages in /admin, altijd in Amsterdamse tijd. */

const DATUM = new Intl.DateTimeFormat("nl-NL", {
  timeZone: TIJDZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
});
const DAG_KORT = new Intl.DateTimeFormat("nl-NL", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
});

export function formatDatum(moment: Date | null): string {
  return moment ? DATUM.format(moment) : "–";
}

/** Een kalenderdag ("2026-10-15") als "15 okt". */
export function formatDag(dag: string): string {
  return DAG_KORT.format(new Date(`${dag}T00:00:00Z`));
}

export function formatProcent(fractie: number | null): string {
  return fractie === null ? "–" : `${Math.round(fractie * 100)}%`;
}

export const STATUS_LABEL: Record<string, string> = {
  trial: "Trial",
  active: "Actief",
  inactive: "Inactief",
};
