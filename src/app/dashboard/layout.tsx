import { connection } from "next/server";
import { body, display } from "@/lib/fonts";

/**
 * Eigen typografie voor het hele dashboard (login én ingelogde schermen),
 * cohesief met de widget: Fraunces als display-serif voor merknaam, pagina-
 * en sectiekoppen en de kerncijfers; Hanken Grotesk als verfijnde body.
 * Beide worden door next/font self-hosted — geen externe runtime-request,
 * geen layout-shift. De variabelen erven door naar alle .module.css-klassen.
 */

export default async function DashboardRootLayout({ children }: { children: React.ReactNode }) {
  // Dynamisch renderen: alleen dan kan Next.js de CSP-nonce van dit request
  // op zijn scripts zetten (src/proxy.ts, src/lib/security/csp.ts).
  await connection();

  return (
    <div lang="nl" className={`${display.variable} ${body.variable}`}>
      {children}
    </div>
  );
}
