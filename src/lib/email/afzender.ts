/**
 * Zet een weergavenaam vóór het afzenderadres ("Naam" <adres>).
 *
 * De naam gaat een mailheader in, dus:
 * - regeleindes eruit (anders kan een naam extra headers injecteren);
 * - quotes, backslashes en punthaken eruit (die breken de quoted-string);
 * - het resultaat staat altijd tússen dubbele quotes. RFC 5322 vereist dat
 *   voor een display-name met specials, en een komma is de gevaarlijke:
 *   ongequoot leest "Groen, Co <a@b>" als twee adressen.
 *
 * Levert de naam na sanitatie niets bruikbaars op, dan valt dit terug op
 * het kale adres in plaats van een leeg label te sturen.
 */
export function bouwAfzender(adres: string, naam?: string): string {
  if (!naam) return adres;
  const schoon = naam
    .replace(/[\r\n]+/g, " ")
    .replace(/["\\<>]/g, "")
    .trim()
    .slice(0, 78);
  if (schoon.length === 0) return adres;
  // Een adres met bestaande weergavenaam ("X <a@b>") houdt zijn eigen label.
  if (adres.includes("<")) return adres;
  return `"${schoon}" <${adres}>`;
}
