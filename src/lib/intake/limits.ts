/**
 * Limieten per gesprek (lagen 1 en 2). Later configureerbaar per
 * tenant/pakket; dit zijn de platform-defaults.
 */
export const INTAKE_LIMIETEN = {
  /** Hard plafond per LLM-antwoord (laag 1). */
  maxTokensPerAntwoord: 1024,
  /** Max bezoekersberichten per gesprek; daarna vriendelijk afronden. */
  maxBerichtenPerGesprek: 30,
  /** Max lengte van één bezoekersbericht (tekens). */
  maxBerichtLengte: 2000,
  /**
   * Hard tokenbudget per gesprek (laag 2, ~$0,10 bij Haiku 4.5:
   * $1/M input + $5/M output → 60k in + 8k uit ≈ $0,10; bij Haiku 5.5 ≈ $0,01).
   * Haiku 5.5 telt ongeveer 30% meer tokens voor dezelfde tekst: bij de
   * wissel deze grenzen herzien, anders rondt een gesprek eerder af.
   */
  maxInputTokensPerGesprek: 60_000,
  maxOutputTokensPerGesprek: 8_000,
} as const;

export function tokenBudgetOverschreden(tokens: { input: number; output: number }): boolean {
  return (
    tokens.input > INTAKE_LIMIETEN.maxInputTokensPerGesprek ||
    tokens.output > INTAKE_LIMIETEN.maxOutputTokensPerGesprek
  );
}
