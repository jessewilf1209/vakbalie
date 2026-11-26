import type { Metadata } from "next";
import "./globals.css";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://vakbalie.nl";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: "Vakbalie: AI-offerteassistent voor hoveniers en vakbedrijven",
    template: "%s | Vakbalie",
  },
  description:
    "Vakbalie maakt van websitebezoekers complete offerteaanvragen. De AI-assistent stelt de juiste vragen, vat alles samen en geeft elke lead een score.",
  applicationName: "Vakbalie",
  openGraph: {
    type: "website",
    locale: "nl_NL",
    siteName: "Vakbalie",
    title: "Vakbalie: AI-offerteassistent voor hoveniers en vakbedrijven",
    description:
      "Vakbalie maakt van websitebezoekers complete offerteaanvragen. De AI-assistent stelt de juiste vragen, vat alles samen en geeft elke lead een score.",
  },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="nl">
      <body>{children}</body>
    </html>
  );
}
