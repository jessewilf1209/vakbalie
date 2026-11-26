"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import s from "../../dashboard/dashboard.module.css";

const LINKS = [
  { href: "/admin", label: "Overzicht" },
  { href: "/admin/klanten", label: "Klanten" },
];

export function AdminNav() {
  const pad = usePathname();
  return (
    <nav className={s.balkNav} aria-label="Beheer">
      {LINKS.map((l) => {
        const actief = l.href === "/admin" ? pad === "/admin" : pad.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`${s.balkNavLink} ${actief ? s.balkNavActief : ""}`}
            aria-current={actief ? "page" : undefined}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
