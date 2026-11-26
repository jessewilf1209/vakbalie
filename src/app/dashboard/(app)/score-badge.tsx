import { categorieVanScore } from "@/lib/leadscore";
import s from "../dashboard.module.css";

/**
 * Leadscore-badge: getal + kleur op categorie. Eén drempeldefinitie voor
 * het hele product via categorieVanScore (mail, dashboard, widget).
 */
export function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className={s.badgeLeeg}>—</span>;

  const categorie = categorieVanScore(score);
  const kleur =
    categorie === "hoog" ? s.badgeHoog : categorie === "middel" ? s.badgeMiddel : s.badgeLaag;

  return <span className={`${s.badge} ${kleur}`}>{score}</span>;
}
