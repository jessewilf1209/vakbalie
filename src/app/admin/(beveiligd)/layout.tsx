import { vereisAdminPagina } from "@/lib/admin/toegang";
import { AdminNav } from "../_components/admin-nav";
import { adminUitloggenActie } from "../acties";
import s from "../../dashboard/dashboard.module.css";

/**
 * Alle schermen achter de adminpoort. De guard staat hier én in
 * elke server action en datafunctie: een layout alleen is niet genoeg.
 */
export default async function BeveiligdLayout({ children }: { children: React.ReactNode }) {
  await vereisAdminPagina();

  return (
    <div className={s.schil}>
      <header className={s.balk}>
        <span className={s.balkTitel}>Vakbalie beheer</span>
        <AdminNav />
        <form action={adminUitloggenActie} className={s.balkUitloggen}>
          <button type="submit" className={s.knopSecundair}>
            Uitloggen
          </button>
        </form>
      </header>
      <main className={s.inhoud}>{children}</main>
    </div>
  );
}
