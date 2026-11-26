import type { Metadata } from "next";
import Link from "next/link";
import { wachtwoordVergetenActie } from "../acties";
import { AuthBrand } from "../_components/auth-brand";
import s from "../dashboard.module.css";
import { VerstuurKnop } from "../_components/verstuur-knop";

export const metadata: Metadata = {
  title: "Wachtwoord vergeten",
  robots: { index: false, follow: false },
};

export default async function WachtwoordVergetenPagina({
  searchParams,
}: {
  searchParams: Promise<{ verzonden?: string }>;
}) {
  const { verzonden } = await searchParams;

  return (
    <main className={s.authScherm}>
      <form action={wachtwoordVergetenActie} className={s.authKaart}>
        <AuthBrand />
        <h1 className={s.authTitel}>Wachtwoord vergeten</h1>

        {verzonden ? (
          <p className={s.melding}>
            Als dit adres bij ons bekend is, ontvang je binnen enkele minuten een e-mail met een
            herstellink.
          </p>
        ) : (
          <p className={s.authSub}>
            Vul je e-mailadres in; je ontvangt een link om een nieuw wachtwoord in te stellen.
          </p>
        )}

        <label className={s.label} htmlFor="email">
          E-mailadres
        </label>
        <input
          className={s.veld}
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />

        <VerstuurKnop className={s.knopPrimair} bezigTekst="Bezig met versturen…">
          Verstuur herstellink
        </VerstuurKnop>

        <p className={s.authVoetnoot}>
          <Link href="/dashboard/login">Terug naar inloggen</Link>
        </p>
      </form>
    </main>
  );
}
