/**
 * Eenvoudige line-iconen voor de feature-kaarten. Geen icon-library als
 * dependency: inline SVG, currentColor, decoratief (aria-hidden).
 */

type IconProps = { size?: number };

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  focusable: false,
});

export function IconChat({ size = 24 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M4 5h16v11H9l-4 3v-3H4z" />
      <path d="M8 9h8M8 12h5" />
    </svg>
  );
}

export function IconScore({ size = 24 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M4 19V5" />
      <path d="M8 19v-6M12 19V8M16 19v-9M20 19V6" />
    </svg>
  );
}

export function IconPhoto({ size = 24 }: IconProps) {
  return (
    <svg {...base(size)}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="10" r="1.6" />
      <path d="m4 17 5-4 4 3 3-2 4 3" />
    </svg>
  );
}

export function IconMail({ size = 24 }: IconProps) {
  return (
    <svg {...base(size)}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  );
}

export function IconDashboard({ size = 24 }: IconProps) {
  return (
    <svg {...base(size)}>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="11" width="7" height="10" rx="1.5" />
      <rect x="3" y="15" width="7" height="6" rx="1.5" />
    </svg>
  );
}

export function IconShield({ size = 24 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M12 3 5 6v5c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export function IconEmbed({ size = 24 }: IconProps) {
  return (
    <svg {...base(size)}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 9 6.5 12 9 15M15 9l2.5 3L15 15" />
    </svg>
  );
}

export function IconClock({ size = 24 }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

export function IconCheck({ size = 24 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="m5 12 4.5 4.5L19 7" />
    </svg>
  );
}

export function IconSpark({ size = 24 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />
    </svg>
  );
}
