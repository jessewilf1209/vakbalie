/**
 * Woordmerk voor "Vakbalie": een blad-icoon (past bij de
 * natuurlijke ontwerptaal en de start-niche hoveniers) plus de naam in Fraunces.
 * Vervangbaar door een echt logo zodra dat er is.
 */

export function BrandGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M5 19c0-7 5-13 14-14 0 9-5 14-12 14-1.2 0-2 0-2 0Z"
        fill="currentColor"
        opacity="0.95"
      />
      <path
        d="M6 18C9 13 12.5 9.5 17 7"
        stroke="#fff"
        strokeOpacity="0.85"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
