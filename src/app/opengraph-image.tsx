import { ImageResponse } from "next/og";

/**
 * Deelafbeelding (Open Graph en, als terugval, X/LinkedIn/WhatsApp) voor
 * alle pagina's: 1200x630, wordt bij de build als statische PNG gemaakt.
 * Bewust het standaardlettertype van ImageResponse: geen extra fontbestand
 * in de repo of netwerkverzoek tijdens de build.
 */
export const alt = "Vakbalie: maak van elke websitebezoeker een complete offerteaanvraag";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const GROEN = "#1f6f43";
const PAPIER = "#f8f4ec";
const INKT = "#1d2a22";

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: PAPIER,
        padding: "72px 80px",
        color: INKT,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <svg width="64" height="64" viewBox="0 0 24 24">
          <rect width="24" height="24" rx="5" fill={GROEN} />
          <path d="M5 19c0-7 5-13 14-14 0 9-5 14-12 14-1.2 0-2 0-2 0Z" fill="#fff" />
        </svg>
        <div style={{ fontSize: 44, fontWeight: 700 }}>Vakbalie</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.1, maxWidth: 980 }}>
          Maak van elke websitebezoeker een complete offerteaanvraag
        </div>
        <div style={{ fontSize: 32, color: GROEN }}>
          AI-offerteassistent voor hoveniers en vakbedrijven
        </div>
      </div>
    </div>,
    size,
  );
}
