/**
 * Fotolimieten, gedeeld door de server (`foto.ts`, de upload-route) en de
 * widget in de browser. Dit bestand heeft bewust geen imports, zodat de
 * client het kan gebruiken zonder sharp mee te bundelen.
 */

export const MAX_FOTOS_PER_GESPREK = 5;

/**
 * Vercel weigert elke request-body boven 4,5 MB met een 413 voordat onze
 * route iets ziet, op elk plan en niet instelbaar. De multipart-body bevat
 * naast de foto ook het sessietoken en de grenzen, dus de foto zelf blijft
 * ruim daaronder. De widget verkleint foto's vooraf tot onder deze grens.
 */
export const MAX_FOTO_BYTES = 4 * 1024 * 1024; // 4 MB

/** Lange zijde aftoppen: tuinfoto's hoeven geen 48 MP te zijn (opslag/kosten). */
export const MAX_FOTO_AFMETING = 2048;

/**
 * Afmeting na verkleinen: de lange zijde wordt hooguit `max`, de
 * verhouding blijft gelijk en er wordt nooit vergroot.
 */
export function verkleindeAfmeting(
  breedte: number,
  hoogte: number,
  max: number = MAX_FOTO_AFMETING,
): { breedte: number; hoogte: number } {
  const langste = Math.max(breedte, hoogte);
  if (langste <= max) return { breedte, hoogte };
  const factor = max / langste;
  return {
    breedte: Math.max(1, Math.round(breedte * factor)),
    hoogte: Math.max(1, Math.round(hoogte * factor)),
  };
}
