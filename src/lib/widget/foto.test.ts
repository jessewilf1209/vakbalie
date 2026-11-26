import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { verwerkFoto } from "./foto";

/**
 * Test-jpeg mét EXIF-metadata. De assertion verderop is dat de output
 * helemaal géén EXIF meer heeft — daarmee is ook GPS-locatie (zelfde
 * EXIF-blok) aantoonbaar weg.
 */
async function jpegMetExif(): Promise<Buffer> {
  return sharp({
    create: { width: 64, height: 48, channels: 3, background: { r: 40, g: 110, b: 60 } },
  })
    .jpeg()
    .withMetadata({
      exif: {
        IFD0: { Software: "testcamera", Artist: "Jan Jansen", Copyright: "privé" },
      },
    })
    .toBuffer();
}

describe("verwerkFoto", () => {
  it("stript EXIF volledig — dus ook GPS-locatie (AVG)", async () => {
    const origineel = await jpegMetExif();
    const origineleMeta = await sharp(origineel).metadata();
    expect(origineleMeta.exif).toBeDefined(); // sanity: er wás EXIF

    const resultaat = await verwerkFoto(origineel);
    expect(resultaat).not.toBeNull();
    const schoneMeta = await sharp(resultaat!.data).metadata();
    expect(schoneMeta.exif).toBeUndefined();
    expect(resultaat!.contentType).toBe("image/jpeg");
    expect(resultaat!.extensie).toBe("jpg");
  });

  it("accepteert png en webp en behoudt het formaat", async () => {
    const png = await sharp({
      create: { width: 10, height: 10, channels: 3, background: "#fff" },
    })
      .png()
      .toBuffer();
    expect((await verwerkFoto(png))?.contentType).toBe("image/png");

    const webp = await sharp({
      create: { width: 10, height: 10, channels: 3, background: "#fff" },
    })
      .webp()
      .toBuffer();
    expect((await verwerkFoto(webp))?.contentType).toBe("image/webp");
  });

  it("weigert niet-afbeeldingen ongeacht wat de client beweert", async () => {
    expect(await verwerkFoto(Buffer.from("<script>alert(1)</script>"))).toBeNull();
    expect(await verwerkFoto(Buffer.from("%PDF-1.4 nep-pdf"))).toBeNull();
    expect(await verwerkFoto(Buffer.alloc(0))).toBeNull();
  });

  it("weigert formaten buiten de allowlist (gif)", async () => {
    const gif = await sharp({
      create: { width: 10, height: 10, channels: 3, background: "#fff" },
    })
      .gif()
      .toBuffer();
    expect(await verwerkFoto(gif)).toBeNull();
  });

  it("verkleint te grote afbeeldingen tot max 2048px", async () => {
    const groot = await sharp({
      create: { width: 4000, height: 1000, channels: 3, background: "#fff" },
    })
      .jpeg()
      .toBuffer();
    const resultaat = await verwerkFoto(groot);
    const meta = await sharp(resultaat!.data).metadata();
    expect(meta.width).toBeLessThanOrEqual(2048);
    expect(meta.height).toBeLessThanOrEqual(2048);
  });
});
