"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "../marketing.module.css";
import { BrandGlyph } from "./brand-mark";
import { NAV, SITE } from "./site-config";

export function Header() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);

  // Escape sluit het mobiele menu en zet de focus terug op de menuknop.
  useEffect(() => {
    if (!menuOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuButton.current?.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  return (
    <header className={styles.header}>
      <div className={`${styles.container} ${styles.headerInner}`}>
        <Link href="/" className={styles.brand}>
          <span className={styles.brandMark}>
            <BrandGlyph />
          </span>
          {SITE.naam}
        </Link>

        <nav className={styles.nav} aria-label="Hoofdnavigatie">
          {NAV.filter((item) => item.href !== "/demo").map((item) => {
            const actief = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.navLink} ${actief ? styles.navLinkActive : ""}`}
                aria-current={actief ? "page" : undefined}
              >
                {item.label}
              </Link>
            );
          })}
          <Link href="/demo" className={`${styles.btn} ${styles.btnPrimary} ${styles.navCta}`}>
            Probeer de demo
          </Link>
        </nav>

        <button
          ref={menuButton}
          type="button"
          className={styles.hamburger}
          aria-label={menuOpen ? "Menu sluiten" : "Menu openen"}
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
          onClick={() => setMenuOpen((o) => !o)}
        >
          <span className={styles.hamburgerBar} />
          <span className={styles.hamburgerBar} />
          <span className={styles.hamburgerBar} />
        </button>
      </div>

      {menuOpen && (
        <nav id="mobile-menu" className={styles.mobileMenu} aria-label="Mobiele navigatie">
          {NAV.map((item) => {
            const actief = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.mobileNavLink} ${actief ? styles.navLinkActive : ""}`}
                aria-current={actief ? "page" : undefined}
                onClick={() => setMenuOpen(false)}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      )}
    </header>
  );
}
