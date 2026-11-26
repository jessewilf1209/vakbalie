import type { Metadata } from "next";
import { logoutActie } from "../acties";
import { getSupabaseServer } from "@/lib/supabase/server";
import { NavLinks } from "./_components/nav-links";
import s from "../dashboard.module.css";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

/**
 * Schil voor alle ingelogde dashboard-schermen (route-group "(app)";
 * login/wachtwoord-pagina's vallen hierbuiten). De proxy dwingt de sessie
 * al af; de data-autorisatie komt uit RLS via de anon-client.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await getSupabaseServer();

  // RLS: alleen tenants waar deze gebruiker aan gekoppeld is.
  const [{ data: tenants }, { count: nieuwLeadsAantal }] = await Promise.all([
    supabase.from("tenants").select("name"),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("status", "new"),
  ]);
  const gekoppeld = tenants !== null && tenants.length > 0;

  return (
    <div className={s.schil}>
      <header className={s.balk}>
        <span className={s.balkTitel}>{tenants?.[0]?.name ?? "Vakbalie"}</span>
        <NavLinks nieuwAantal={nieuwLeadsAantal ?? 0} />
        <form action={logoutActie} className={s.balkUitloggen}>
          <button type="submit" className={s.knopSecundair}>
            Uitloggen
          </button>
        </form>
      </header>

      <main className={s.inhoud}>
        {gekoppeld ? (
          children
        ) : (
          <p className={s.foutmelding}>
            Dit account is nog niet aan een bedrijf gekoppeld. Neem contact op met je beheerder.
          </p>
        )}
      </main>
    </div>
  );
}
