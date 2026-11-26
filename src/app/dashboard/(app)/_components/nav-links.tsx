"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import s from "../../dashboard.module.css";

const LINKS = [
  { href: "/dashboard", label: "Overzicht" },
  { href: "/dashboard/leads", label: "Leads" },
  { href: "/dashboard/instellingen", label: "Instellingen" },
];

interface Props {
  nieuwAantal?: number;
}

export function NavLinks({ nieuwAantal = 0 }: Props) {
  const pathname = usePathname();
  return (
    <nav className={s.balkNav} aria-label="Hoofdnavigatie">
      {LINKS.map((link) => {
        const actief =
          pathname === link.href || (link.href !== "/dashboard" && pathname.startsWith(link.href));
        return (
          <Link
            key={link.href}
            href={link.href}
            className={actief ? `${s.balkNavLink} ${s.balkNavActief}` : s.balkNavLink}
            aria-current={actief ? "page" : undefined}
          >
            {link.label}
            {link.href === "/dashboard/leads" && nieuwAantal > 0 && (
              <span className={s.navBadge} aria-label={`${nieuwAantal} nieuwe leads`}>
                {nieuwAantal > 99 ? "99+" : nieuwAantal}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
