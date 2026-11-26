import type { Metadata } from "next";
import { connection } from "next/server";
import { body, display } from "@/lib/fonts";

/**
 * Schil voor /admin: zelfde typografie en huisstijl als het
 * dashboard, maar los ervan. Geen links vanuit het tenant-dashboard, en
 * nooit in een zoekmachine.
 */

export const metadata: Metadata = {
  title: "Beheer",
  robots: { index: false, follow: false, nocache: true },
};

export default async function AdminRootLayout({ children }: { children: React.ReactNode }) {
  // Dynamisch renderen: alleen dan kan Next.js de CSP-nonce van dit request
  // op zijn scripts zetten (src/proxy.ts, src/lib/security/csp.ts).
  await connection();

  return (
    <div lang="nl" className={`${display.variable} ${body.variable}`}>
      {children}
    </div>
  );
}
