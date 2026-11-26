/**
 * Maakt van een `next`-parameter een veilig doel binnen de eigen site.
 *
 * Alleen op "begint met /" controleren is niet genoeg: browsers en de
 * URL-parser lezen een backslash als slash en negeren tabs en regeleindes,
 * dus `/\evil.com` of `/<tab>/evil.com` wordt `https://evil.com/`. Daarom
 * eerst parsen en daarna de origin vergelijken.
 */
export function veiligInternDoel(next: string | null, origin: string, standaard: string): URL {
  const terugval = new URL(standaard, origin);
  if (!next || !next.startsWith("/")) return terugval;

  let doel: URL;
  try {
    doel = new URL(next, origin);
  } catch {
    return terugval;
  }
  return doel.origin === new URL(origin).origin ? doel : terugval;
}
