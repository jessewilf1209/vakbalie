import { vereisAdminStap } from "@/lib/admin/toegang";
import { AuthBrand } from "../../../dashboard/_components/auth-brand";
import s from "../../../dashboard/dashboard.module.css";
import { MfaInstellen } from "./mfa-instellen";

/**
 * Eenmalig: een authenticator-app koppelen. Zonder tweede factor komt
 * niemand in /admin, ook niet met de adminvlag.
 */
export default async function AdminMfaInstellenPagina() {
  await vereisAdminStap("mfa_instellen");

  return (
    <main className={s.authScherm}>
      <div className={s.authKaart}>
        <AuthBrand />
        <h1 className={s.authTitel}>Tweestapsverificatie instellen</h1>
        <p className={s.authSub}>
          Voor het beheer is een authenticator-app verplicht, bijvoorbeeld 1Password, Bitwarden of
          Google Authenticator.
        </p>
        <MfaInstellen />
      </div>
    </main>
  );
}
