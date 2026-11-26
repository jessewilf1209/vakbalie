import Link from "next/link";
import styles from "../marketing.module.css";
import { BrandGlyph } from "./brand-mark";
import { NAV, SITE } from "./site-config";

export function Footer() {
  // Alleen ingevulde bedrijfsgegevens tonen (zie SITE in site-config.ts).
  const bedrijfsregels = [
    SITE.bedrijfsnaam,
    SITE.adres,
    SITE.kvk ? `KvK ${SITE.kvk}` : null,
    SITE.btwNummer ? `Btw ${SITE.btwNummer}` : null,
  ].filter((regel): regel is string => Boolean(regel));

  return (
    <footer className={styles.footer}>
      <div className={styles.container}>
        <div className={styles.footerGrid}>
          <div className={styles.footerBrandCol}>
            <Link href="/" className={styles.footerBrand}>
              <BrandGlyph size={20} />
              {SITE.naam}
            </Link>
            <p className={styles.footerTag}>{SITE.tagline}</p>
          </div>

          <div>
            <p className={styles.footerColTitle}>Product</p>
            <div className={styles.footerCol}>
              {NAV.map((item) => (
                <Link key={item.href} href={item.href}>
                  {item.label}
                </Link>
              ))}
            </div>
          </div>

          <div>
            <p className={styles.footerColTitle}>Contact</p>
            <div className={styles.footerCol}>
              <a href={`mailto:${SITE.email}`}>{SITE.email}</a>
              <Link href="/privacy">Privacyverklaring</Link>
            </div>
          </div>
        </div>

        <div className={styles.footerBar}>
          <span>
            © {new Date().getFullYear()} {SITE.naam} · {SITE.plaats}
          </span>
          {bedrijfsregels.length > 0 && <span>{bedrijfsregels.join(" · ")}</span>}
          <span>Gemaakt met aandacht voor privacy, gegevens opgeslagen in de EU.</span>
        </div>
      </div>
    </footer>
  );
}
