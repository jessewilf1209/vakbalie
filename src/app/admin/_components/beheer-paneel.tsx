import type { AuditRegel, TenantDetail, TenantGebruiker } from "@/lib/admin/beheer-lezen";
import {
  domeinenActie,
  gebruikerToevoegenActie,
  instellingenActie,
  statusActie,
} from "../(beveiligd)/klanten/beheer-acties";
import { BeheerFormulier } from "./beheer-formulier";
import { formatDatum, STATUS_LABEL } from "./opmaak";
import s from "../../dashboard/dashboard.module.css";
import a from "../admin.module.css";

const ACTIE_LABEL: Record<string, string> = {
  tenant_aangemaakt: "Klant aangemaakt",
  domeinen_gewijzigd: "Domeinen gewijzigd",
  status_gewijzigd: "Status gewijzigd",
  gebruiker_toegevoegd: "Gebruiker toegevoegd",
  instellingen_gewijzigd: "Instellingen gewijzigd",
  tenant_verwijderd: "Klant verwijderd",
};

/**
 * Beheerpaneel in het klantdetail. Bewust geen
 * knop om een klant te verwijderen: dat blijft een script met droogloop
 * (scripts/verwijder-tenant.mjs).
 */
export function BeheerPaneel({
  tenant,
  gebruikers,
  audit,
}: {
  tenant: TenantDetail;
  gebruikers: TenantGebruiker[];
  audit: AuditRegel[];
}) {
  const id = <input type="hidden" name="tenantId" value={tenant.tenantId} />;

  return (
    <>
      <section className={s.sectie}>
        <h2 className={s.sectieTitel}>Status</h2>
        <p className={a.toelichting}>
          Nu: <strong>{STATUS_LABEL[tenant.status]}</strong>. Inactief is de noodrem: de widget
          stopt direct op alle sites van deze klant.
        </p>
        <div className={a.knopRij}>
          {/* Altijd alle drie, de huidige uitgeschakeld: zo blijft de melding
              staan nadat de pagina met de nieuwe status ververst. */}
          {(["trial", "active", "inactive"] as const).map((st) => (
            <BeheerFormulier
              key={st}
              actie={statusActie}
              knop={`Zet op ${STATUS_LABEL[st].toLowerCase()}`}
              knopKlasse={st === "inactive" ? s.knopGevaar : s.knopSecundair}
              uitgeschakeld={st === tenant.status}
            >
              {id}
              <input type="hidden" name="status" value={st} />
            </BeheerFormulier>
          ))}
        </div>
      </section>

      <section className={s.sectie}>
        <h2 className={s.sectieTitel}>Domeinen (allowed_origins)</h2>
        <p className={a.toelichting}>
          Eén per regel, met https://. Alleen het domein, geen pad. Vul www én zonder www in als de
          site op allebei bereikbaar is.
        </p>
        <BeheerFormulier actie={domeinenActie} knop="Domeinen opslaan">
          {id}
          <label className={s.label} htmlFor="domeinen">
            Domeinen
          </label>
          <textarea
            className={s.veld}
            id="domeinen"
            name="domeinen"
            rows={4}
            defaultValue={tenant.allowedOrigins.join("\n")}
            spellCheck={false}
          />
        </BeheerFormulier>
      </section>

      <section className={s.sectie}>
        <h2 className={s.sectieTitel}>Instellingen</h2>
        <BeheerFormulier actie={instellingenActie} knop="Instellingen opslaan">
          {id}
          <label className={s.label} htmlFor="naam">
            Bedrijfsnaam
          </label>
          <input
            className={s.veld}
            id="naam"
            name="naam"
            defaultValue={tenant.naam}
            maxLength={120}
            required
          />
          <label className={s.label} htmlFor="contactEmail">
            Contactadres
          </label>
          <input
            className={s.veld}
            id="contactEmail"
            name="contactEmail"
            type="email"
            defaultValue={tenant.contactEmail}
            required
          />
          <label className={s.label} htmlFor="notificationEmail">
            Notificatieadres <span className={s.kpiHint}>(leeg = contactadres)</span>
          </label>
          <input
            className={s.veld}
            id="notificationEmail"
            name="notificationEmail"
            type="email"
            defaultValue={tenant.notificationEmail ?? ""}
          />
          <label className={s.label} htmlFor="widgetKleur">
            Widgetkleur
          </label>
          <input
            className={s.veld}
            id="widgetKleur"
            name="widgetKleur"
            defaultValue={tenant.widgetKleur}
            pattern="#[0-9a-fA-F]{6}"
            required
          />
          <label className={s.label} htmlFor="welkomsttekst">
            Welkomsttekst
          </label>
          <textarea
            className={s.veld}
            id="welkomsttekst"
            name="welkomsttekst"
            rows={3}
            maxLength={300}
            defaultValue={tenant.welkomsttekst ?? ""}
          />
          <label className={s.label} htmlFor="privacyUrl">
            Privacy-URL
          </label>
          <input
            className={s.veld}
            id="privacyUrl"
            name="privacyUrl"
            type="url"
            defaultValue={tenant.privacyUrl ?? ""}
          />
        </BeheerFormulier>
        <p className={a.toelichting}>
          Widget-key: <code>{tenant.widgetKey}</code>. Klant sinds {formatDatum(tenant.aangemaakt)}.
        </p>
      </section>

      <section className={s.sectie}>
        <h2 className={s.sectieTitel}>Gebruikers</h2>
        {gebruikers.length === 0 ? (
          <p className={s.leegStaat}>
            Nog geen gebruikers. Zonder gebruiker ziet niemand de leads.
          </p>
        ) : (
          <div className={s.tabelWrap}>
            <table className={s.tabel}>
              <thead>
                <tr>
                  <th>E-mail</th>
                  <th>Rol</th>
                  <th>Account</th>
                  <th>Laatste login</th>
                </tr>
              </thead>
              <tbody>
                {gebruikers.map((g) => (
                  <tr key={g.userId}>
                    <td>{g.email}</td>
                    <td>{g.rol === "owner" ? "Eigenaar" : "Lid"}</td>
                    <td>{g.bevestigd ? "Actief" : "Uitnodiging open"}</td>
                    <td>{formatDatum(g.laatsteLogin)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <BeheerFormulier actie={gebruikerToevoegenActie} knop="Gebruiker toevoegen">
          {id}
          <label className={s.label} htmlFor="gebruikerEmail">
            E-mailadres
          </label>
          <input className={s.veld} id="gebruikerEmail" name="email" type="email" required />
          <label className={s.label} htmlFor="rol">
            Rol
          </label>
          <select className={s.veld} id="rol" name="rol" defaultValue="member">
            <option value="member">Lid</option>
            <option value="owner">Eigenaar (mag instellingen wijzigen)</option>
          </select>
        </BeheerFormulier>
      </section>

      <section className={s.sectie}>
        <h2 className={s.sectieTitel}>Auditlog</h2>
        {audit.length === 0 ? (
          <p className={s.leegStaat}>Nog geen beheeracties.</p>
        ) : (
          <ul className={a.auditLijst}>
            {audit.map((r) => (
              <li key={`${r.actie}-${r.moment.toISOString()}`}>
                <span>{ACTIE_LABEL[r.actie] ?? r.actie}</span>
                <span className={s.kpiHint}>
                  {r.moment.toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam" })}
                  {r.bron === "script" ? " (script)" : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
