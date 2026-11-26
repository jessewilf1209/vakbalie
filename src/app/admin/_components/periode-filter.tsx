import Link from "next/link";
import type { PeriodeSoort } from "@/lib/admin/periode";
import s from "../../dashboard/dashboard.module.css";

const OPTIES: { soort: PeriodeSoort; label: string }[] = [
  { soort: "deze_maand", label: "Deze maand" },
  { soort: "vorige_maand", label: "Vorige maand" },
  { soort: "laatste_30_dagen", label: "Laatste 30 dagen" },
];

/** Periodekeuze als gewone links: werkt zonder JavaScript en is deelbaar. */
export function PeriodeFilter({
  actief,
  hrefVoor,
}: {
  actief: PeriodeSoort;
  hrefVoor: (soort: PeriodeSoort) => string;
}) {
  return (
    <div className={s.filterRij} role="group" aria-label="Periode">
      {OPTIES.map((o) => (
        <Link
          key={o.soort}
          href={hrefVoor(o.soort)}
          className={`${s.filterKnop} ${o.soort === actief ? s.filterActief : ""}`}
          aria-current={o.soort === actief ? "true" : undefined}
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}
