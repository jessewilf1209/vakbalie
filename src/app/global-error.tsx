"use client";

/**
 * Laatste vangnet als zelfs de root-layout faalt. Vervangt dan de hele
 * pagina, dus eigen <html> en <body> en alleen inline-opmaak: globals.css
 * en de lettertypes zijn op dit moment mogelijk niet geladen.
 */
export default function GlobaleFout({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="nl">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#f8f4ec",
          color: "#1d2a22",
          padding: "1.5rem",
        }}
      >
        <main style={{ maxWidth: "32rem" }}>
          <h1 style={{ fontSize: "1.75rem", margin: "0 0 0.75rem" }}>Er ging iets mis</h1>
          <p style={{ margin: "0 0 1.5rem", lineHeight: 1.5 }}>
            De pagina kon niet worden geladen. Probeer het opnieuw of ga terug naar de homepage.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            style={{
              minHeight: 44,
              padding: "0 1.25rem",
              border: 0,
              borderRadius: 6,
              background: "#1f6f43",
              color: "#fff",
              fontSize: "1rem",
              cursor: "pointer",
              marginRight: "0.75rem",
            }}
          >
            Opnieuw proberen
          </button>
          {/* Bewust een gewone <a>: de router van Next.js is hier mogelijk kapot. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/" style={{ color: "#1f6f43" }}>
            Naar de homepage
          </a>
        </main>
      </body>
    </html>
  );
}
