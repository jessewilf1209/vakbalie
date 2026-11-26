/**
 * Demo-tenant van de etalagesite (/demo).
 *
 * De widget-key van de demo-tenant staat in NEXT_PUBLIC_DEMO_TENANT_KEY. Die
 * is bewust publiek (een widget-key is per ontwerp openbaar) zodat de /demo-
 * pagina hem client-side kan inbedden. Server-side gebruiken we dezelfde waarde
 * om een sessie als demo te markeren — die sessies draaien áltijd op de mock-
 * LLM, ook als er een echte ANTHROPIC_API_KEY is. Zo verbruikt de publieke
 * demo nooit tokens.
 */
/**
 * Strengere limieten voor de publieke demo. De mock-LLM kost niets, maar de
 * demo is anoniem en onbeschermd bereikbaar: zonder eigen grenzen kan een bot
 * opslag en database vullen of de dagruimte van de demo-tenant opmaken, zodat
 * echte bezoekers een dichte demo zien. Dit zijn bewust lagere waarden dan de
 * platformdefaults in `RATE_LIMITS` en `INTAKE_LIMIETEN`.
 */
export const DEMO_LIMIETEN = {
  /** Nieuwe demo-sessies per IP per uur (platform: 60). */
  sessiesPerIpPerUur: 5,
  /** Nieuwe demo-gesprekken per dag, voor alle bezoekers samen (platform: 200). */
  gesprekkenPerDag: 100,
  /** Berichten per IP per 10 minuten (platform: 60). */
  berichtenPerIpPer10Min: 30,
  /** Bezoekersberichten per demo-gesprek (platform: 30). De mock-flow heeft er ongeveer 10. */
  maxBerichtenPerGesprek: 20,
  /** Demo-gesprekken worden na dit aantal uren door de bewaartermijn-job verwijderd. */
  bewaaruren: 24,
} as const;

export function getDemoTenantKey(): string | null {
  const key = process.env.NEXT_PUBLIC_DEMO_TENANT_KEY;
  return key && key.length > 0 ? key : null;
}

/** True als deze widget-key de geconfigureerde demo-tenant is. */
export function isDemoTenantKey(widgetKey: string): boolean {
  const demo = getDemoTenantKey();
  return demo !== null && widgetKey === demo;
}
