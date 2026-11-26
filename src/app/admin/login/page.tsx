import { vereisAdminStap } from "@/lib/admin/toegang";
import { adminLoginActie } from "../acties";
import { AuthBrand } from "../../dashboard/_components/auth-brand";
import { WachtwoordVeld } from "../../dashboard/_components/wachtwoord-veld";
import s from "../../dashboard/dashboard.module.css";
import { VerstuurKnop } from "../../dashboard/_components/verstuur-knop";

export default async function AdminLoginPagina({
  searchParams,
}: {
  searchParams: Promise<{ fout?: string }>;
}) {
  await vereisAdminStap("geen_sessie");
  const { fout } = await searchParams;

  return (
    <main className={s.authScherm}>
      <form action={adminLoginActie} className={s.authKaart}>
        <AuthBrand />
        <h1 className={s.authTitel}>Beheer</h1>
        <p className={s.authSub}>Alleen voor het platformbeheer</p>

        {fout && (
          <p className={s.foutmelding}>
            {fout === "pogingen"
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
          autoComplete="username"
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
      </form>
    </main>
  );
}
