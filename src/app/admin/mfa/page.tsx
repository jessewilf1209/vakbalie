import { vereisAdminStap } from "@/lib/admin/toegang";
import { adminUitloggenActie, verifieerMfaActie } from "../acties";
import { AuthBrand } from "../../dashboard/_components/auth-brand";
import s from "../../dashboard/dashboard.module.css";
import { VerstuurKnop } from "../../dashboard/_components/verstuur-knop";

/** Tweede stap van het inloggen: de code uit de authenticator-app. */
export default async function AdminMfaPagina({
  searchParams,
}: {
  searchParams: Promise<{ fout?: string }>;
}) {
  await vereisAdminStap("mfa_verifieren");
  const { fout } = await searchParams;

  return (
    <main className={s.authScherm}>
      <div className={s.authKaart}>
        <AuthBrand />
        <h1 className={s.authTitel}>Code invoeren</h1>
        <p className={s.authSub}>Open je authenticator-app en vul de zes cijfers in.</p>

        {fout && (
          <p className={s.foutmelding}>
            {fout === "pogingen"
              ? "Te veel pogingen. Wacht vijf minuten."
              : "Die code klopt niet. Probeer de volgende."}
          </p>
        )}

        <form action={verifieerMfaActie}>
          <label className={s.label} htmlFor="code">
            Code
          </label>
          <input
            className={s.veld}
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]{6,7}"
            maxLength={7}
            required
            autoFocus
          />
          <VerstuurKnop className={s.knopPrimair} bezigTekst="Bezig met controleren…">
            Bevestig
          </VerstuurKnop>
        </form>

        <form action={adminUitloggenActie} className={s.authVoetnoot}>
          <button type="submit" className={s.knopSecundair}>
            Uitloggen
          </button>
        </form>
      </div>
    </main>
  );
}
