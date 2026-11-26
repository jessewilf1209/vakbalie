import type { Metadata } from "next";
import { instellingenOpslaanActie, verstuurTestMailActie } from "./acties";
import { KopieerKnop } from "./kopieer-knop";
import { KleurVeld } from "./_components/kleur-veld";
import { buildEmbedSnippet } from "@/lib/widget/embed";
import { getSupabaseServer } from "@/lib/supabase/server";
import s from "../../dashboard.module.css";

export const metadata: Metadata = {
  title: "Instellingen",
};

export const dynamic = "force-dynamic";

interface ZoekParams {
  opgeslagen?: string;
  fout?: string;
  testmail?: string;
}

/**
 * Instellingen per tenant: widgetkleur, welkomsttekst,
 * notificatie-adres, privacylink en de embed-snippet. De widget-key en
 * toegestane origins zijn bewust alleen-lezen — wijzigen kan alleen via
 * ons (kolom-grants in migration 20260612000001).
 */
export default async function InstellingenPagina({
  searchParams,
}: {
  searchParams: Promise<ZoekParams>;
}) {
  const sp = await searchParams;
  const supabase = await getSupabaseServer();

  // RLS: alleen de eigen tenant. Eén tenant per gebruiker in de MVP.
  const { data: tenants } = await supabase
    .from("tenants")
    .select(
      "id, name, contact_email, widget_key, widget_kleur, welkomsttekst, privacy_url, notification_email, allowed_origins",
    )
    .limit(1);
  const tenant = tenants?.[0];
  if (!tenant) return null; // layout toont al de niet-gekoppeld-melding

  const basisUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const snippet = `<script src="${basisUrl}/widget.js" data-tenant-key="${tenant.widget_key}" async></script>`;
  const embedSnippet = buildEmbedSnippet({
    appUrl: basisUrl,
    tenantKey: tenant.widget_key,
    contactEmail: tenant.notification_email ?? tenant.contact_email,
  });

  return (
    <>
      <h1 className={s.paginaTitel}>Instellingen</h1>

      {sp.opgeslagen && <p className={s.melding}>Instellingen opgeslagen.</p>}
      {sp.fout && (
        <p className={s.foutmelding}>
          Opslaan mislukt. Controleer de velden (kleur als #rrggbb, geldig e-mailadres, privacylink
          met https://).
        </p>
      )}
      {sp.testmail === "ok" && (
        <p className={s.melding}>
          Testmail verstuurd naar {tenant.notification_email ?? tenant.contact_email}.
        </p>
      )}
      {sp.testmail === "fout" && (
        <p className={s.foutmelding}>
          Testmail versturen mislukt. Controleer de e-mailinstellingen.
        </p>
      )}

      <section className={s.sectie}>
        <h2 className={s.sectieTitel}>Widget</h2>
        <form action={instellingenOpslaanActie} className={s.instellingenFormulier}>
          <input type="hidden" name="tenantId" value={tenant.id} />

          <label htmlFor="widgetKleur" className={s.label}>
            Kleur van de chatknop
          </label>
          <KleurVeld defaultValue={tenant.widget_kleur ?? "#1f6f43"} />

          <label htmlFor="welkomsttekst" className={s.label}>
            Welkomsttekst (max. 300 tekens)
          </label>
          <textarea
            id="welkomsttekst"
            name="welkomsttekst"
            maxLength={300}
            rows={3}
            defaultValue={tenant.welkomsttekst ?? ""}
            placeholder="Hallo! Vertel kort waar we u mee kunnen helpen, dan maken wij een offerte."
            className={s.veld}
          />

          <label htmlFor="notificationEmail" className={s.label}>
            E-mailadres voor nieuwe leads
          </label>
          <input
            id="notificationEmail"
            name="notificationEmail"
            type="email"
            defaultValue={tenant.notification_email ?? ""}
            placeholder={tenant.contact_email}
            className={s.veld}
          />
          <p className={s.veldUitleg}>Leeg = het algemene contactadres ({tenant.contact_email}).</p>

          <label htmlFor="privacyUrl" className={s.label}>
            Link naar jullie privacyverklaring
          </label>
          <input
            id="privacyUrl"
            name="privacyUrl"
            type="url"
            defaultValue={tenant.privacy_url ?? ""}
            placeholder="https://jullie-website.nl/privacy"
            className={s.veld}
          />
          <p className={s.veldUitleg}>
            Deze link staat onderin de widget. Leeg = onze algemene privacypagina.
          </p>

          <div>
            <button type="submit" className={s.knopPrimair}>
              Opslaan
            </button>
          </div>
        </form>

        <form action={verstuurTestMailActie} style={{ marginTop: "0.75rem" }}>
          <input type="hidden" name="tenantId" value={tenant.id} />
          <button type="submit" className={s.knopSecundair}>
            Stuur testmail
          </button>
          <p className={s.veldUitleg}>
            Stuurt een proefmail naar{" "}
            <strong>{tenant.notification_email ?? tenant.contact_email}</strong> om te controleren
            of notificaties werken.
          </p>
        </form>

        <p className={s.veldUitleg}>Wijzigingen gelden direct voor nieuwe widget-sessies.</p>
      </section>

      <section className={s.sectie}>
        <h2 className={s.sectieTitel}>Widget op jullie website zetten</h2>
        <p className={s.veldUitleg}>
          Plak deze regel vlak voor de sluitende <code>&lt;/body&gt;</code>-tag, of laat het jullie
          websitebouwer doen:
        </p>
        <pre className={s.snippet}>
          <code>{snippet}</code>
        </pre>
        <KopieerKnop tekst={snippet} />
      </section>

      <section className={s.sectie}>
        <h2 className={s.sectieTitel}>Of: de assistent middenin een pagina</h2>
        <p className={s.veldUitleg}>
          Wil je de assistent niet als zwevende knop maar als groot chatvenster op je offertepagina
          (op de plek van je oude formulier)? Plak dan dit blok daar. De contactregel werkt ook
          zonder JavaScript en wordt vervangen door de assistent zodra de pagina laadt — zo gaat er
          nooit een bezoeker verloren. De zwevende knop wordt op die pagina automatisch verborgen.
        </p>
        <pre className={s.snippet}>
          <code>{embedSnippet}</code>
        </pre>
        <KopieerKnop tekst={embedSnippet} />
      </section>

      <section className={s.sectie}>
        <h2 className={s.sectieTitel}>Toegestane websites</h2>
        <p className={s.veldUitleg}>
          De widget werkt alleen op deze adressen. Wil je een website toevoegen of wijzigen? Neem
          contact met ons op.
        </p>
        {tenant.allowed_origins.length === 0 ? (
          <p className={s.foutmelding}>
            Nog geen websites geregistreerd — de widget werkt nu nergens. Neem contact met ons op.
          </p>
        ) : (
          <ul className={s.redenen}>
            {tenant.allowed_origins.map((origin: string) => (
              <li key={origin}>{origin}</li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
