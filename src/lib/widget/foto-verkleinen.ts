import { MAX_FOTO_AFMETING, MAX_FOTO_BYTES, verkleindeAfmeting } from "./foto-limieten";

/**
 * Verkleint een foto in de browser vóór de upload, zodat ook foto's van
 * 5 tot 12 MB van een telefoon onder de bodylimiet van Vercel blijven.
 *
 * - createImageBitmap past de EXIF-oriëntatie toe ("from-image"), zodat de
 *   foto rechtop blijft nu de EXIF-gegevens bij het hertekenen wegvallen.
 *   Dat wegvallen is ook gewenst: GPS-locatie verlaat zo het toestel niet.
 * - Uitvoer is JPEG; de server codeert daarna sowieso opnieuw met sharp.
 * - Lukt verkleinen niet (oude browser, kapot bestand), dan gaat het
 *   origineel door als dat klein genoeg is. De server blijft de echte
 *   grens bewaken.
 *
 * Geeft `null` als er niets bruikbaars onder de limiet te maken is.
 */
export async function verkleinFoto(bestand: File): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(bestand, { imageOrientation: "from-image" });
    const { breedte, hoogte } = verkleindeAfmeting(bitmap.width, bitmap.height, MAX_FOTO_AFMETING);
    const canvas = document.createElement("canvas");
    canvas.width = breedte;
    canvas.height = hoogte;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Geen 2d-context");
    ctx.drawImage(bitmap, 0, 0, breedte, hoogte);
    bitmap.close();

    for (const kwaliteit of [0.85, 0.7, 0.55]) {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", kwaliteit),
      );
      if (blob && blob.size <= MAX_FOTO_BYTES) return blob;
    }
  } catch {
    // Valt terug op het origineel hieronder.
  }
  return bestand.size > 0 && bestand.size <= MAX_FOTO_BYTES ? bestand : null;
}
