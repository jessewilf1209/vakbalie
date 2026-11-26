import sharp from "sharp";

/**
 * Fotoverwerking. Validatie gebeurt op de échte inhoud
 * (magic bytes via sharp), nooit op de aangeleverde content-type of
 * bestandsnaam. Re-encoderen zonder metadata strippt EXIF — inclusief
 * GPS-locatie van de bezoeker, dat zijn persoonsgegevens (AVG).
 */

import { MAX_FOTO_AFMETING } from "./foto-limieten";

export { MAX_FOTO_BYTES, MAX_FOTOS_PER_GESPREK } from "./foto-limieten";

const MAX_AFMETING = MAX_FOTO_AFMETING;

const TOEGESTANE_FORMATEN = {
  jpeg: { contentType: "image/jpeg", extensie: "jpg" },
  png: { contentType: "image/png", extensie: "png" },
  webp: { contentType: "image/webp", extensie: "webp" },
} as const;

type ToegestaanFormaat = keyof typeof TOEGESTANE_FORMATEN;

export interface VerwerkteFoto {
  data: Buffer;
  contentType: string;
  extensie: string;
}

/** Geeft `null` voor alles wat geen geldige jpeg/png/webp is. */
export async function verwerkFoto(invoer: Buffer): Promise<VerwerkteFoto | null> {
  let formaat: ToegestaanFormaat;
  try {
    const meta = await sharp(invoer).metadata();
    if (!meta.format || !(meta.format in TOEGESTANE_FORMATEN)) return null;
    formaat = meta.format as ToegestaanFormaat;
  } catch {
    return null;
  }

  try {
    // rotate() zonder argument past de EXIF-orientatie toe vóórdat de
    // metadata verdwijnt; resize + re-encode zonder withMetadata() levert
    // een bestand zonder EXIF/GPS op.
    const pipeline = sharp(invoer).rotate().resize({
      width: MAX_AFMETING,
      height: MAX_AFMETING,
      fit: "inside",
      withoutEnlargement: true,
    });

    const data =
      formaat === "png"
        ? await pipeline.png().toBuffer()
        : formaat === "webp"
          ? await pipeline.webp({ quality: 85 }).toBuffer()
          : await pipeline.jpeg({ quality: 85 }).toBuffer();

    return {
      data,
      contentType: TOEGESTANE_FORMATEN[formaat].contentType,
      extensie: TOEGESTANE_FORMATEN[formaat].extensie,
    };
  } catch {
    // Corrupt bestand dat wél een geldige header had.
    return null;
  }
}
