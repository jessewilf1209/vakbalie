import { body, display } from "@/lib/fonts";
import styles from "./marketing.module.css";
import { Header } from "./_components/header";
import { Footer } from "./_components/footer";
import { Analytics } from "./_components/analytics";
import { plausibleScript } from "@/lib/analytics";

/**
 * Layout voor de publieke etalagesite. Eigen typografie (Fraunces display +
 * Hanken Grotesk body via next/font, self-hosted, geen layout-shift), cohesief
 * met widget en dashboard. De .site-wrapper draagt alle design-tokens; die
 * erven door naar de losse page-modules.
 */

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${display.variable} ${body.variable} ${styles.site}`}>
      <a href="#main-content" className={styles.skipLink}>
        Naar inhoud
      </a>
      <Header />
      <main id="main-content" className={styles.main}>
        {children}
      </main>
      <Footer />
      {plausibleScript() && <Analytics />}
    </div>
  );
}
