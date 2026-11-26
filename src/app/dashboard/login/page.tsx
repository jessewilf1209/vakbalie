import type { Metadata } from "next";
import Link from "next/link";
import { loginActie } from "../acties";
import { AuthBrand } from "../_components/auth-brand";
import { WachtwoordVeld } from "../_components/wachtwoord-veld";
import s from "../dashboard.module.css";
import { VerstuurKnop } from "../_components/verstuur-knop";

export const metadata: Metadata = {
  title: "Inloggen",
  robots: { index: false, follow: false },
};

export default async function LoginPagina({
  searchParams,
}: {
  searchParams: Promise<{ fout?: string }>;
}) {
  const { fout } = await searchParams;

  return (
    <main className={s.authScherm}>
      <form action={loginActie} className={s.authKaart}>
        <AuthBrand />
        <h1 className={s.authTitel}>Inloggen</h1>
        <p className={s.authSub}>Dashboard voor offerte-aanvragen</p>

        {fout && (
          <p className={s.foutmelding}>
            {fout === "link"
              ? "De link is verlopen of al gebruikt. Vraag een nieuwe aan."
              : fout === "pogingen"
                ? "Te veel inlogpogingen. Wacht een kwartier en probeer het opnieuw."
                : "Inloggen mislukt. Controleer je e-mailadres en wachtwoord."}
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

        <label className={s.label} htmlFor="wachtwoord">
          Wachtwoord
        </label>
        <WachtwoordVeld
          id="wachtwoord"
          name="wachtwoord"
          autoComplete="current-password"
          minLength={8}
          required
        />

        <VerstuurKnop className={s.knopPrimair} bezigTekst="Bezig met inloggen…">
          Log in
        </VerstuurKnop>

        <p className={s.authVoetnoot}>
          <Link href="/dashboard/wachtwoord-vergeten">Wachtwoord vergeten?</Link>
        </p>
        <p className={s.authVoetnoot}>
          Nog geen account? Toegang is op uitnodiging. Neem contact op met je beheerder.
        </p>
        <p className={s.authVoetnoot}>
          <Link href="/privacy">Privacyverklaring</Link>
        </p>
      </form>
    </main>
  );
}
