import Link from "next/link";
import { vereisAdminPagina } from "@/lib/admin/toegang";
import { BeheerFormulier } from "../../../_components/beheer-formulier";
import { nieuweKlantActie } from "../beheer-acties";
import s from "../../../../dashboard/dashboard.module.css";
import a from "../../../admin.module.css";

/**
 * Nieuwe klant: tenant, eigenaar met uitnodiging
 * en domeinen in één keer. Zelfde logica als scripts/maak-tenant.mjs.
 */
export default async function NieuweKlant() {
  await vereisAdminPagina();

  return (
    <>
      <p>
        <Link href="/admin/klanten" className={s.link}>
          ← Alle klanten
        </Link>
      </p>
      <h1 className={s.paginaTitel}>Nieuwe klant</h1>

      <section className={s.sectie}>
        <BeheerFormulier actie={nieuweKlantActie} knop="Klant aanmaken en uitnodigen">
          <label className={s.label} htmlFor="naam">
            Bedrijfsnaam
          </label>
          <input className={s.veld} id="naam" name="naam" maxLength={120} required />

          <label className={s.label} htmlFor="contactEmail">
            Contactadres van het bedrijf
          </label>
          <input className={s.veld} id="contactEmail" name="contactEmail" type="email" required />

          <label className={s.label} htmlFor="eigenaarEmail">
            E-mailadres van de eigenaar
          </label>
          <input className={s.veld} id="eigenaarEmail" name="eigenaarEmail" type="email" required />
          <p className={a.toelichting}>
            Krijgt een uitnodiging om een wachtwoord in te stellen. Bestaat het account al, dan
            wordt het gekoppeld.
          </p>

          <label className={s.label} htmlFor="domeinen">
            Domeinen van de website
          </label>
          <textarea
            className={s.veld}
            id="domeinen"
            name="domeinen"
            rows={3}
            placeholder={"https://voorbeeld.nl\nhttps://www.voorbeeld.nl"}
            spellCheck={false}
          />

          <label className={s.label} htmlFor="status">
            Status
          </label>
          <select className={s.veld} id="status" name="status" defaultValue="trial">
            <option value="trial">Trial</option>
            <option value="active">Actief</option>
          </select>
        </BeheerFormulier>
      </section>
    </>
  );
}
