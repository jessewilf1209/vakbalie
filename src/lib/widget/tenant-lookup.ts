import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isValidTenantKeyFormat } from "./tenant-key";

export interface WidgetTenant {
  id: string;
  name: string;
  status: "trial" | "active" | "inactive";
  allowedOrigins: string[];
  /** Theming (stap 9): hex-kleur, eigen welkomsttekst, privacy-URL. */
  widgetKleur: string;
  welkomsttekst: string | null;
  privacyUrl: string | null;
}

/**
 * Zoekt een tenant op widget-key (service-role; alleen server-side).
 * Geeft `null` voor onbekende keys én inactieve tenants — de aanroeper
 * hoort beide gevallen identiek te behandelen (geen enumeratie-orakel).
 */
export async function findTenantByWidgetKey(widgetKey: string): Promise<WidgetTenant | null> {
  if (!isValidTenantKeyFormat(widgetKey)) return null;

  const { data, error } = await getSupabaseAdmin()
    .from("tenants")
    .select("id, name, status, allowed_origins, widget_kleur, welkomsttekst, privacy_url")
    .eq("widget_key", widgetKey)
    .maybeSingle();

  if (error) {
    // Geen querydetails naar boven lekken; loggen zonder persoonsgegevens.
    console.error("tenant-lookup mislukt", { code: error.code });
    throw new Error("Tenant-lookup mislukt");
  }
  if (!data || data.status === "inactive") return null;

  // Kleur server-side hervalideren vóór hij ooit richting een style gaat
  // (de DB-check is het tweede slot, dit het eerste).
  const kleur = /^#[0-9a-fA-F]{6}$/.test(data.widget_kleur ?? "") ? data.widget_kleur : "#1f6f43";

  return {
    id: data.id,
    name: data.name,
    status: data.status,
    allowedOrigins: data.allowed_origins ?? [],
    widgetKleur: kleur,
    welkomsttekst: data.welkomsttekst ?? null,
    privacyUrl: data.privacy_url ?? null,
  };
}
