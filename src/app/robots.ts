import type { MetadataRoute } from "next";

const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://vakbalie.nl").replace(/\/+$/, "");

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Niet-publieke delen uit de index houden.
      disallow: ["/dashboard", "/admin", "/widget", "/api"],
    },
    sitemap: `${appUrl}/sitemap.xml`,
  };
}
