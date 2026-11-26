import a from "../admin.module.css";

/**
 * Eenvoudige staafgrafiek als SVG, zonder externe bibliotheek of CDN
 *. Eén reeks, dus geen legenda: de titel zegt wat
 * er staat. Staven maximaal 24 breed, afgerond aan de bovenkant en vierkant
 * op de basislijn, 2 tussenruimte. Hover per dag via een onzichtbaar
 * raakvlak over de hele kolom, met een tooltip (title).
 */

export interface Staaf {
  label: string;
  waarde: number;
  /** Tekst voor de tooltip, bijvoorbeeld "12 okt: $0,0123". */
  tooltip: string;
}

const BREEDTE = 720;
const HOOGTE = 180;
const MARGE = { boven: 4, onder: 2, links: 0, rechts: 0 };
const MAX_STAAF = 24;
const RADIUS = 4;

function staafPad(x: number, y: number, b: number, h: number): string {
  const r = Math.min(RADIUS, b / 2, h);
  return [
    `M${x},${y + h}`,
    `V${y + r}`,
    `Q${x},${y} ${x + r},${y}`,
    `H${x + b - r}`,
    `Q${x + b},${y} ${x + b},${y + r}`,
    `V${y + h}`,
    "Z",
  ].join(" ");
}

export function StaafGrafiek({
  titel,
  staven,
  maxLabel,
}: {
  titel: string;
  staven: Staaf[];
  /** Opgemaakte hoogste waarde, als ankerlabel bovenaan. */
  maxLabel: string;
}) {
  const plotB = BREEDTE - MARGE.links - MARGE.rechts;
  const plotH = HOOGTE - MARGE.boven - MARGE.onder;
  const vak = staven.length > 0 ? plotB / staven.length : plotB;
  const staafB = Math.max(2, Math.min(MAX_STAAF, vak - 2));
  const max = Math.max(0, ...staven.map((s) => s.waarde));
  const basis = MARGE.boven + plotH;

  return (
    <figure className={a.grafiekKader} style={{ margin: 0 }}>
      <figcaption className={a.grafiekTitel}>{titel}</figcaption>
      {/* Labels als gewone tekst buiten de SVG: die schaalt mee met de
          breedte, tekst erin wordt op een telefoon onleesbaar klein. */}
      <div className={a.asLabel}>{maxLabel}</div>
      <svg
        className={a.grafiek}
        viewBox={`0 0 ${BREEDTE} ${HOOGTE}`}
        role="img"
        aria-label={`${titel}. Hoogste waarde ${maxLabel}. Details in de tabel eronder.`}
      >
        {/* Recessieve hulplijn bovenaan en de basislijn. */}
        <line
          x1={MARGE.links}
          x2={BREEDTE - MARGE.rechts}
          y1={MARGE.boven}
          y2={MARGE.boven}
          stroke="var(--rand)"
          strokeWidth={1}
        />
        <line
          x1={MARGE.links}
          x2={BREEDTE - MARGE.rechts}
          y1={basis}
          y2={basis}
          stroke="var(--rand-sterk)"
          strokeWidth={1}
        />
        {staven.map((s, i) => {
          const h = max > 0 ? (s.waarde / max) * plotH : 0;
          const x = MARGE.links + i * vak + (vak - staafB) / 2;
          return (
            <g key={s.label}>
              <rect
                className={a.raak}
                x={MARGE.links + i * vak}
                y={MARGE.boven}
                width={vak}
                height={plotH}
              >
                <title>{s.tooltip}</title>
              </rect>
              {h > 0 && <path className={a.staaf} d={staafPad(x, basis - h, staafB, h)} />}
            </g>
          );
        })}
      </svg>
      {staven.length > 0 && (
        <div className={a.asRij}>
          <span>{staven[0].label}</span>
          <span>{staven[staven.length - 1].label}</span>
        </div>
      )}
    </figure>
  );
}
