import type { Metadata } from "next";
import { wachtwoordInstellenActie } from "../acties";
import { AuthBrand } from "../_components/auth-brand";
import { WachtwoordVeld } from "../_components/wachtwoord-veld";
import s from "../dashboard.module.css";
import { VerstuurKnop } from "../_components/verstuur-knop";

export const metadata: Metadata = {
  title: "Nieuw wachtwoord",
  robots: { index: false, follow: false },
};

export default async function WachtwoordInstellenPagina({
  searchParams,
}: {
  searchParams: Promise<{ fout?: string }>;
}) {
  const { fout } = await searchParams;

  return (
    <main className={s.authScherm}>
      <form action={wachtwoordInstellenActie} className={s.authKaart}>
        <AuthBrand />
        <h1 className={s.authTitel}>Nieuw wachtwoord instellen</h1>

        {fout === "zwak" && <p className={s.foutmelding}>Gebruik minimaal 12 tekens.</p>}
        {fout === "sessie" && (
          <p className={s.foutmelding}>
            Je herstellink is verlopen. Vraag een nieuwe aan via wachtwoord-vergeten.
          </p>
        )}

        <label className={s.label} htmlFor="wachtwoord">
          Nieuw wachtwoord (minimaal 12 tekens)
        </label>
        <WachtwoordVeld
          id="wachtwoord"
          name="wachtwoord"
          autoComplete="new-password"
          minLength={12}
          required
        />

        <VerstuurKnop className={s.knopPrimair} bezigTekst="Bezig met opslaan…">
          Stel wachtwoord in
        </VerstuurKnop>
      </form>
    </main>
  );
}
