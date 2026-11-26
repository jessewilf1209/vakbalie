import type { MetadataRoute } from "next";

const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://vakbalie.nl").replace(/\/+$/, "");

/**
 * Alleen de publieke marketingpagina's; dashboard/widget/api blijven eruit.
 * Geen lastModified: een datum die bij elke build verspringt, negeren
 * zoekmachines toch.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const paden = ["", "/features", "/zo-werkt-het", "/prijzen", "/demo", "/contact", "/privacy"];
  return paden.map((pad) => ({
    url: `${appUrl}${pad}`,
    changeFrequency: "monthly",
    priority: pad === "" ? 1 : 0.7,
  }));
}
