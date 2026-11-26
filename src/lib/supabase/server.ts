import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { veiligeAuthCookie } from "@/lib/supabase/cookie-opties";

/**
 * Supabase-client voor dashboard-servercomponenten en server actions
 *: de ANON-key met de sessie van de ingelogde
 * gebruiker. Autorisatie komt volledig uit RLS (`get_my_tenant_ids()`)
 * — de service-role komt in het dashboard niet voor.
 */
export async function getSupabaseServer() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, veiligeAuthCookie(options)),
            );
          } catch {
            // setAll vanuit een Server Component: genegeerd — de proxy
            // ververst de sessie-cookies al per request.
          }
        },
      },
    },
  );
}
