import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/** Zelfde neutrale melding als de sessie-route bij een onbekende/inactieve klant. */
export const CHAT_NIET_BESCHIKBAAR =
  "Deze chat is niet beschikbaar. Neem rechtstreeks contact op met het bedrijf.";

/**
 * Noodrem per klant: `status = 'inactive'` moet de widget direct
 * stoppen. De sessie-route weigert dan al nieuwe sessies, maar een token dat
 * vóór het omzetten is uitgegeven blijft tot 30 minuten geldig. Daarom
 * controleren ook de bericht-, foto- en bevestig-route bij elke aanroep de
 * live status, in plaats van te vertrouwen op wat er bij uitgifte gold.
 *
 * Fail-closed: kan de status niet worden gelezen, dan geldt de tenant als
 * niet actief. Die routes zijn toch al afhankelijk van dezelfde database.
 */
export async function isTenantActief(tenantId: string): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin()
    .from("tenants")
    .select("status")
    .eq("id", tenantId)
    .maybeSingle();

  if (error) {
    console.error("tenant-status lezen mislukt", { code: error.code });
    return false;
  }
  return data !== null && data.status !== "inactive";
}
