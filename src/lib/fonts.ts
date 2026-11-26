import { Fraunces, Hanken_Grotesk } from "next/font/google";

/**
 * Eén definitie van de lettertypes voor de hele app (marketing, dashboard,
 * admin en widget). Next.js voegt in productie de lettertype-CSS van alle
 * layouts samen, en dubbele "Fraunces"-definities met verschillende
 * instellingen overschrijven elkaar dan: de variant zonder optische grootte
 * won van die van de marketingsite, waardoor de koppen op Vercel breder en
 * steviger leken dan lokaal. Eén gedeelde definitie sluit dat uit.
 *
 * Importeer nooit zelf `Fraunces` of `Hanken_Grotesk` in een layout.
 */
export const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  style: ["normal", "italic"],
  // Optische grootte automatisch: grote koppen strakker, kleine koppen leesbaarder.
  axes: ["opsz"],
});

export const body = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-body" });
