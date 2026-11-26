import type { Metadata } from "next";
import { SITE } from "./site-config";

/**
 * Metadata per publieke pagina, op één plek opgebouwd.
 *
 * Waarom een helper: zet een pagina zelf `openGraph`, dan vervangt Next.js
 * het hele openGraph-object van de root-layout (geen diepe merge). Zonder
 * helper verdwijnen dan siteName, locale en type. Hier krijgt elke pagina
 * dezelfde set, plus een zelfverwijzende canonical en `og:url`. Relatieve
 * paden worden absoluut via `metadataBase` in de root-layout.
 *
 * De OG-afbeelding wordt gemaakt door `src/app/opengraph-image.tsx`. Een
 * pagina die zelf `openGraph` zet, krijgt die afbeelding niet automatisch
 * mee (bij de build gecontroleerd), dus hier staat hij expliciet.
 */
const DEELAFBEELDING = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: "Vakbalie: maak van elke websitebezoeker een complete offerteaanvraag",
};

export function paginaMetadata({
  pad,
  titel,
  beschrijving,
  absoluteTitel = false,
}: {
  /** Pad zonder domein, bijvoorbeeld "/prijzen" of "/". */
  pad: string;
  /** Paginatitel; de layout zet er " | Vakbalie" achter. */
  titel: string;
  /** Ongeveer 120 tot 160 tekens, met de waarde voor de lezer. */
  beschrijving: string;
  /** true voor de homepage: titel zonder template erachter. */
  absoluteTitel?: boolean;
}): Metadata {
  const volledigeTitel = absoluteTitel ? titel : `${titel} | ${SITE.naam}`;
  return {
    title: absoluteTitel ? { absolute: titel } : titel,
    description: beschrijving,
    alternates: { canonical: pad },
    openGraph: {
      type: "website",
      locale: "nl_NL",
      siteName: SITE.naam,
      url: pad,
      title: volledigeTitel,
      description: beschrijving,
      images: [DEELAFBEELDING],
    },
    twitter: {
      card: "summary_large_image",
      title: volledigeTitel,
      description: beschrijving,
      images: [DEELAFBEELDING],
    },
  };
}
