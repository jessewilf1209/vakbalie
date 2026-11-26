import type { Metadata } from "next";
import { paginaMetadata } from "../_components/pagina-metadata";
import s from "../marketing.module.css";
import c from "./contact.module.css";
import { SITE } from "../_components/site-config";

export const metadata: Metadata = paginaMetadata({
  pad: "/contact",
  titel: "Contact: plan een kennismaking of pilot",
  beschrijving:
    "Benieuwd of de AI-offerteassistent bij jouw hoveniersbedrijf past? Mail ons voor een vrijblijvende kennismaking of een pilot. We denken graag met je mee.",
});

export default function ContactPage() {
  const mailHref = `mailto:${SITE.email}?subject=${encodeURIComponent("Interesse in Vakbalie")}`;

  return (
    <section className={`${s.container} ${c.wrap}`}>
      <div className={s.grid}>
        <div className={c.main}>
          <h1 className={s.h1}>Laten we kennismaken</h1>
          <p className={c.lead}>
            Benieuwd of de assistent bij jouw bedrijf past, of klaar voor een pilot? Stuur een
            bericht, we denken graag met je mee en laten je de demo zien in jouw situatie.
          </p>

          <div className={c.methods}>
            <a className={c.method} href={mailHref}>
              <span>
                <span className={c.methodLabel}>E-mail</span>
                <br />
                <span className={c.methodValue}>{SITE.email}</span>
              </span>
            </a>
          </div>
        </div>

        <aside className={c.aside}>
          <h2 className={c.asideTitle}>Wat je van ons kunt verwachten</h2>
          <ul className={c.checklist}>
            <li className={c.checklistItem}>
              Een korte, vrijblijvende kennismaking, geen verkooppraatje.
            </li>
            <li className={c.checklistItem}>
              We laten de assistent zien met intakevragen die bij jouw vak passen.
            </li>
            <li className={c.checklistItem}>
              Heldere afspraken over privacy en de gegevens van jouw klanten.
            </li>
            <li className={c.checklistItem}>
              Een eerlijk advies of dit nu wel of niet bij je past.
            </li>
          </ul>
        </aside>
      </div>
    </section>
  );
}
