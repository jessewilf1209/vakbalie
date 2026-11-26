import type { MetadataRoute } from "next";

/** Web-app-manifest: naam en iconen voor "toevoegen aan beginscherm". */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Vakbalie",
    short_name: "Vakbalie",
    description: "AI-offerteassistent voor hoveniers en vakbedrijven.",
    start_url: "/",
    display: "browser",
    background_color: "#f8f4ec",
    theme_color: "#1f6f43",
    lang: "nl",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
