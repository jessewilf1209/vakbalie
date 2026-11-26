import { connection } from "next/server";
import { body, display } from "@/lib/fonts";

/**
 * Eigen typografie voor de widget (los van het dashboard): Fraunces als
 * optische display-serif voor de merknaam + signatuurmomenten, Hanken Grotesk
 * als verfijnde, goed leesbare body. Beide worden door next/font self-hosted,
 * dus geen externe runtime-request en geen layout-shift op de klantsite.
 *
 * .scherm hoogt zichzelf op 100dvh, dus deze wrapper-div beïnvloedt de layout
 * niet; hij draagt alleen de font-variabelen en lang="nl".
 */

export default async function WidgetLayout({ children }: { children: React.ReactNode }) {
  // Dynamisch renderen: alleen dan kan Next.js de CSP-nonce van dit request
  // op zijn scripts zetten (src/proxy.ts, src/lib/security/csp.ts).
  await connection();

  return (
    <div lang="nl" className={`${display.variable} ${body.variable}`}>
      {children}
    </div>
  );
}
