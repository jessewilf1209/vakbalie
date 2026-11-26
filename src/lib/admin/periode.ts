/**
 * Periodes voor het admin-dashboard, in Europe/Amsterdam. Een maand loopt van middernacht Amsterdamse tijd tot middernacht, ook
 * rond de overgang naar zomer- of wintertijd. De grenzen gaan als [van, tot)
 * naar de databasefuncties.
 */

export const TIJDZONE = "Europe/Amsterdam";

export const PERIODES = [
  "deze_maand",
  "vorige_maand",
  "laatste_30_dagen",
  "laatste_7_dagen",
] as const;
export type PeriodeSoort = (typeof PERIODES)[number];

export interface Periode {
  soort: PeriodeSoort;
  van: Date;
  tot: Date;
  label: string;
}

/** Kalenderdatum (jaar, maand 1-12, dag) van een moment in Amsterdam. */
export function amsterdamDatum(moment: Date): { jaar: number; maand: number; dag: number } {
  const delen = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIJDZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(moment);
  const waarde = (type: string) => Number(delen.find((d) => d.type === type)?.value);
  return { jaar: waarde("year"), maand: waarde("month"), dag: waarde("day") };
}

/** Verschil tussen Amsterdamse kloktijd en UTC op dat moment, in milliseconden. */
function offsetMs(moment: Date): number {
  const delen = new Intl.DateTimeFormat("en-US", {
    timeZone: TIJDZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(moment);
  const w = (type: string) => Number(delen.find((d) => d.type === type)?.value);
  const alsUtc = Date.UTC(w("year"), w("month") - 1, w("day"), w("hour"), w("minute"), w("second"));
  return alsUtc - Math.floor(moment.getTime() / 1000) * 1000;
}

/**
 * Het UTC-moment van middernacht in Amsterdam op die datum. Maand mag buiten
 * 1-12 liggen (13 wordt januari van het volgende jaar), net als bij Date.UTC.
 */
export function amsterdamMiddernacht(jaar: number, maand: number, dag: number): Date {
  const naief = Date.UTC(jaar, maand - 1, dag);
  // Twee keer corrigeren vangt de dag van de klokwissel af.
  let moment = naief - offsetMs(new Date(naief));
  moment = naief - offsetMs(new Date(moment));
  return new Date(moment);
}

const MAANDNAAM = new Intl.DateTimeFormat("nl-NL", {
  timeZone: TIJDZONE,
  month: "long",
  year: "numeric",
});

function maandLabel(moment: Date): string {
  const tekst = MAANDNAAM.format(moment);
  return tekst.charAt(0).toUpperCase() + tekst.slice(1);
}

export function bepaalPeriode(soort: PeriodeSoort, nu: Date = new Date()): Periode {
  const { jaar, maand, dag } = amsterdamDatum(nu);
  const morgen = amsterdamMiddernacht(jaar, maand, dag + 1);

  switch (soort) {
    case "deze_maand": {
      const van = amsterdamMiddernacht(jaar, maand, 1);
      return { soort, van, tot: morgen, label: maandLabel(van) };
    }
    case "vorige_maand": {
      const van = amsterdamMiddernacht(jaar, maand - 1, 1);
      const tot = amsterdamMiddernacht(jaar, maand, 1);
      return { soort, van, tot, label: maandLabel(van) };
    }
    case "laatste_30_dagen":
      return {
        soort,
        van: amsterdamMiddernacht(jaar, maand, dag - 29),
        tot: morgen,
        label: "Laatste 30 dagen",
      };
    case "laatste_7_dagen":
      return {
        soort,
        van: amsterdamMiddernacht(jaar, maand, dag - 6),
        tot: morgen,
        label: "Laatste 7 dagen",
      };
  }
}

/** Leest een periode uit een zoekparameter; onbekend wordt "deze maand". */
export function leesPeriodeSoort(waarde: string | string[] | undefined): PeriodeSoort {
  return (PERIODES as readonly string[]).includes(String(waarde))
    ? (waarde as PeriodeSoort)
    : "deze_maand";
}
