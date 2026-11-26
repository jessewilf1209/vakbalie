import type { NextConfig } from "next";
import { analyticsRewrites } from "./src/lib/analytics";
import { bouwBasisCsp } from "./src/lib/security/csp";

const nextConfig: NextConfig = {
  // Cookieloze analytics via het eigen domein; leeg zolang
  // NEXT_PUBLIC_PLAUSIBLE_SCRIPT niet gezet is (src/lib/analytics.ts).
  async rewrites() {
    return analyticsRewrites();
  },
  async headers() {
    return [
      {
        // Basis-CSP voor de statische pagina's. /widget, /dashboard en /admin
        // krijgen in src/proxy.ts een strengere CSP met nonce; twee CSP's
        // naast elkaar zouden elkaar beperken, dus die routes vallen hier af.
        source: "/((?!widget|dashboard|admin).*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: bouwBasisCsp(process.env.NODE_ENV === "development"),
          },
        ],
      },
      {
        // Geldt voor alle routes.
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
      {
        // Alles behalve /widget mag nooit in een iframe (dekt ook het
        // dashboard incl. de verwijderknop tegen clickjacking). De
        // widget-route krijgt in plaats hiervan een per-tenant
        // frame-ancestors-CSP via src/proxy.ts (strenger: alleen
        // geregistreerde domeinen).
        source: "/((?!widget).*)",
        headers: [{ key: "X-Frame-Options", value: "DENY" }],
      },
    ];
  },
};

export default nextConfig;
