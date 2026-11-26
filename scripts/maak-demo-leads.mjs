/**
 * Voegt realistische demo-leads in voor screenshot-sessies.
 * ALLEEN voor de lokale stack: node scripts/maak-demo-leads.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((r) => r.includes("=") && !r.trim().startsWith("#"))
    .map((r) => [r.slice(0, r.indexOf("=")).trim(), r.slice(r.indexOf("=") + 1).trim()]),
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(url ?? "")) {
  console.error("Weigert: dit script is alleen voor de lokale stack.");
  process.exit(1);
}

const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const TENANT_ID = "00000000-0000-0000-0000-000000000001";

const leads = [
  {
    tenant_id: TENANT_ID,
    contact_name: "Sophie van den Berg",
    contact_email: "sophie.vdberg@gmail.com",
    contact_phone: "06-12345678",
    project_type: "Tuinrenovatie",
    project_description:
      "Complete tuinrenovatie. De achtertuin is verouderd en we willen een moderne, onderhoudsvriendelijke inrichting met nieuwe bestrating, een houten vlonder en vaste beplanting.",
    plaats: "Utrecht",
    tuin_grootte: "Ongeveer 80 m2",
    budget_indicatie: "2500_10000",
    timing: "binnen_1_maand",
    lead_score: 85,
    score_redenen: ["Budget bekend", "Timing binnen 3 maanden", "Verplichte velden compleet"],
    status: "new",
    consent_at: new Date().toISOString(),
    created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    tenant_id: TENANT_ID,
    contact_name: "Mark de Vries",
    contact_email: "mark.devries@outlook.com",
    contact_phone: "06-87654321",
    project_type: "Tuinaanleg",
    project_description:
      "Nieuwe tuin aanleggen bij nieuwbouwwoning. Grasveld, borders met vaste planten en een kindvriendelijk gedeelte met vlak gazon. Liefst ook wat privacy met een haag langs de zijkant.",
    plaats: "Amersfoort",
    tuin_grootte: "Ca. 120 m2",
    budget_indicatie: "10000_plus",
    timing: "1_3_maanden",
    lead_score: 90,
    score_redenen: ["Budget bekend", "Timing binnen 3 maanden", "Verplichte velden compleet"],
    status: "contacted",
    consent_at: new Date().toISOString(),
    created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    tenant_id: TENANT_ID,
    contact_name: "Linda Bakker",
    contact_email: "lindabakker84@gmail.com",
    contact_phone: null,
    project_type: "Tuinonderhoud",
    project_description:
      "Jaarlijks onderhoudscontract voor voor- en achtertuin. Gras maaien, borders schoffelen, hagen knippen en bladruimen in het najaar.",
    plaats: "Zeist",
    tuin_grootte: "Klein stadstuintje, ca. 40 m2",
    budget_indicatie: "tot_2500",
    timing: "1_3_maanden",
    lead_score: 55,
    score_redenen: ["Verplichte velden compleet"],
    status: "qualified",
    consent_at: new Date().toISOString(),
    created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    tenant_id: TENANT_ID,
    contact_name: "Peter Janssen",
    contact_email: "p.janssen@hetnet.nl",
    contact_phone: "06-11223344",
    project_type: "Bestrating",
    project_description:
      "Oprit en achterpad opnieuw bestraten. Huidige klinkers zijn verzakt en zien er slecht uit. Oppervlakte oprit ca. 30 m2, achterpad ca. 15 m2.",
    plaats: "Nieuwegein",
    tuin_grootte: "45 m2 totaal",
    budget_indicatie: "2500_10000",
    timing: "binnen_1_maand",
    lead_score: 80,
    score_redenen: ["Budget bekend", "Timing binnen 3 maanden", "Verplichte velden compleet"],
    status: "new",
    consent_at: new Date().toISOString(),
    created_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
  },
  {
    tenant_id: TENANT_ID,
    contact_name: "Emma Smits",
    contact_email: "emma.smits@icloud.com",
    contact_phone: "06-99887766",
    project_type: "Vlonder/terras",
    project_description:
      "Hardhouten vlonder aanleggen aan de achterzijde van de woning, aansluitend op de openslaande deuren. Afmetingen ongeveer 4 bij 5 meter. Eventueel met ingebouwde plantenbakken langs de rand.",
    plaats: "Hilversum",
    tuin_grootte: "Vlonder 20 m2",
    budget_indicatie: "2500_10000",
    timing: "3_6_maanden",
    lead_score: 65,
    score_redenen: ["Budget bekend", "Verplichte velden compleet"],
    status: "new",
    consent_at: new Date().toISOString(),
    created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000 - 3 * 60 * 60 * 1000).toISOString(),
  },
  {
    tenant_id: TENANT_ID,
    contact_name: "Thomas Kok",
    contact_email: "thomas.kok@gmail.com",
    contact_phone: "06-55443322",
    project_type: "Tuinrenovatie",
    project_description:
      "Achtertuin volledig opnieuw inrichten. Nu alleen maar gras en dat willen we vervangen door een combinatie van tegels, kunstgras en een verhoogd terras. Ook een schutting langs de achterzijde.",
    plaats: "Soest",
    tuin_grootte: "Ongeveer 60 m2",
    budget_indicatie: "10000_plus",
    timing: "binnen_1_maand",
    lead_score: 95,
    score_redenen: ["Budget bekend", "Timing binnen 3 maanden", "Verplichte velden compleet"],
    status: "qualified",
    consent_at: new Date().toISOString(),
    created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    tenant_id: TENANT_ID,
    contact_name: "Anneke Mulder",
    contact_email: "a.mulder@ziggo.nl",
    contact_phone: null,
    project_type: "Tuinonderhoud",
    project_description:
      "Grote wilg moet gerooid worden en de stomp gefreesd. Verder wil ik de borders opnieuw inplanten met inheemse planten die vlinders en bijen aantrekken.",
    plaats: "De Bilt",
    tuin_grootte: "Middelgrote tuin, ca. 70 m2",
    budget_indicatie: "tot_2500",
    timing: "later",
    lead_score: 35,
    score_redenen: ["Verplichte velden compleet"],
    status: "lost",
    consent_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    created_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    tenant_id: TENANT_ID,
    contact_name: "Bas van Dijk",
    contact_email: "bas.vandijk@gmail.com",
    contact_phone: "06-66778899",
    project_type: "Tuinaanleg",
    project_description:
      "Achtertuin nieuw aanleggen. We hebben net een huis gekocht en de tuin is momenteel een kale vlakte. We willen een loungeplek, gazon voor de kinderen en siergrassen langs de schutting.",
    plaats: "Houten",
    tuin_grootte: "90 m2",
    budget_indicatie: "2500_10000",
    timing: "1_3_maanden",
    lead_score: 75,
    score_redenen: ["Budget bekend", "Verplichte velden compleet"],
    status: "contacted",
    consent_at: new Date().toISOString(),
    created_at: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

const { error } = await admin.from("leads").insert(leads);

if (error) {
  console.error("Insert mislukt:", error.message);
  process.exit(1);
}

console.log(`${leads.length} demo-leads aangemaakt voor Groen & Co Hoveniers.`);
