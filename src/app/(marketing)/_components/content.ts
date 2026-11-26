import type { ComponentType } from "react";
import {
  IconChat,
  IconDashboard,
  IconEmbed,
  IconMail,
  IconPhoto,
  IconScore,
  IconShield,
} from "./icons";

/**
 * Inhoudelijke bouwstenen die meerdere pagina's delen (home, features,
 * zo-werkt-het). Eén bron van waarheid voor de feature-teksten en de
 * 7-stappen-flow. Teksten zijn niche-licht: "tuin/hovenier" zit in losse
 * voorbeelden, de features zelf zijn branche-onafhankelijk geformuleerd.
 */

export interface Feature {
  icon: ComponentType<{ size?: number }>;
  titel: string;
  kort: string;
  lang: string;
  punten: string[];
  screenshot?: { src: string; alt: string };
}

export const FEATURES: Feature[] = [
  {
    icon: IconChat,
    titel: "AI-intakegesprek",
    kort: "Een vriendelijke assistent stelt automatisch de juiste vragen tot de aanvraag compleet is.",
    screenshot: { src: "/screenshots/widget-gesprek.png", alt: "Widget: gesprek in uitvoering" },
    lang: "Bezoekers chatten in gewone taal met een assistent die precies de juiste vragen stelt voor jouw vak: werkzaamheden, locatie, omvang, budgetindicatie en gewenste startdatum. De vragen komen uit een brancheprofiel, dus de intake past zich aan je type bedrijf aan.",
    punten: [
      "Natuurlijk gesprek in het Nederlands",
      "Vragenset per branche instelbaar",
      "Maximaal aantal berichten per gesprek (kostenbeheersing)",
      "Bezoeker weet altijd dat het een AI is (transparant, conform de AI Act)",
    ],
  },
  {
    icon: IconScore,
    titel: "Samenvatting + leadscore",
    kort: "Elke aanvraag wordt een nette samenvatting met een leadscore: hoog, medium of laag.",
    screenshot: {
      src: "/screenshots/widget-samenvatting.png",
      alt: "Widget: samenvatting met leadscore",
    },
    lang: "Na het gesprek krijg je een gestructureerde samenvatting (naam, contact, plaats, project, wensen, budget en timing) plus een leadscore zodat je meteen ziet welke aanvragen er echt toe doen. De samenvatting komt uit gevalideerde velden, nooit uit ruwe AI-tekst.",
    punten: [
      "Overzichtelijke samenvatting per aanvraag",
      "Leadscore hoog / medium / laag",
      "Server-side gevalideerd en veilig weergegeven",
      "Bezoeker bevestigt vóór verzending",
    ],
  },
  {
    icon: IconPhoto,
    titel: "Foto-upload",
    kort: "Bezoekers sturen direct foto's mee van de situatie, veilig opgeslagen.",
    screenshot: { src: "/screenshots/foto-in-chat.png", alt: "Widget: foto-upload in het gesprek" },
    lang: "Een beeld zegt meer dan tien vragen. Bezoekers kunnen foto's van de situatie meesturen. Die worden gecontroleerd op echt bestandstype, ontdaan van locatiegegevens (EXIF/GPS) en privé opgeslagen: alleen jij ziet ze, via tijdelijke beveiligde links.",
    punten: [
      "Controle op echt bestandstype (geen verhulde bestanden)",
      "Locatiegegevens (EXIF/GPS) automatisch verwijderd",
      "Privé-opslag met beveiligde, tijdelijke links",
      "Maximale bestandsgrootte afgedwongen",
    ],
  },
  {
    icon: IconMail,
    titel: "Notificatie per e-mail",
    kort: "Bij elke nieuwe lead krijg je direct een nette e-mail met alle gegevens.",
    screenshot: {
      src: "/screenshots/mail-lead.png",
      alt: "E-mailnotificatie: nieuwe lead met leadscore",
    },
    lang: "Zodra een aanvraag binnen is, ploft er een verzorgde e-mail in je inbox met de samenvatting en leadscore. Reageer snel, win de klus. De mail-inhoud wordt veilig opgemaakt, zodat ingevulde tekst nooit iets kan uitvoeren.",
    punten: [
      "Directe e-mail bij elke nieuwe aanvraag",
      "Samenvatting + leadscore in de mail",
      "Veilig opgemaakt (geen injectie via bezoekerstekst)",
      "Een mislukte mail blokkeert de aanvraag nooit",
    ],
  },
  {
    icon: IconDashboard,
    titel: "Dashboard",
    kort: "Alle leads, gesprekken en instellingen overzichtelijk op één plek.",
    screenshot: {
      src: "/screenshots/dashboard-leads.png",
      alt: "Dashboard: leadoverzicht met statussen en scores",
    },
    lang: "In je beveiligde dashboard zie je al je aanvragen, filtert op status, opent de details met foto's en het volledige gesprek, en beheert je instellingen. Met kerncijfers zoals leads deze maand en het aantal hoge leadscores.",
    punten: [
      "Leadoverzicht met statusfilter",
      "Detailpagina met gesprek en foto's",
      "Kerncijfers in één oogopslag",
      "Inloggen met e-mail; data per klant strikt gescheiden",
    ],
  },
  {
    icon: IconEmbed,
    titel: "Twee manieren van insluiten",
    kort: "Als zwevende chatbubble óf als groot chatvenster middenin je pagina.",
    screenshot: {
      src: "/screenshots/twee-implementaties.png",
      alt: "Widget: bubble-variant naast inline-variant",
    },
    lang: "Plaats de assistent als discrete zwevende knop rechtsonder, of als volwaardig chatvenster midden in een landings- of offertepagina. Eén regel code om in te sluiten; werkt zelfs met een nette terugvaloptie als JavaScript uitstaat.",
    punten: [
      "Zwevende bubble of inline-chatvenster",
      "Insluiten met één code-snippet",
      "Werkt op je eigen domein, veilig afgeschermd",
      "Terugvaloptie zonder JavaScript",
    ],
  },
];

export interface Voordeel {
  icon: ComponentType<{ size?: number }>;
  titel: string;
  tekst: string;
}

export const SECURITY: Voordeel = {
  icon: IconShield,
  titel: "Privacy en veiligheid ingebouwd",
  tekst:
    "Alle gegevens staan in de EU, met bewaartermijnen en een verwijderproces. Data van klanten is strikt van elkaar gescheiden, en de assistent is beveiligd tegen misbruik. Veiligheid zit in het ontwerp, niet als bijzaak.",
};

export interface Stap {
  nummer: number;
  titel: string;
  tekst: string;
}

export const STAPPEN: Stap[] = [
  {
    nummer: 1,
    titel: "Bezoeker op je website",
    tekst:
      "Een potentiële klant landt op je site en ziet de uitnodiging om een offerte aan te vragen.",
  },
  {
    nummer: 2,
    titel: "De chat opent",
    tekst: "De assistent begroet de bezoeker en start een kort, vriendelijk gesprek.",
  },
  {
    nummer: 3,
    titel: "Slimme intake",
    tekst:
      "Werkzaamheden, plaats, omvang, budget, timing en contactgegevens, eventueel met foto's.",
  },
  {
    nummer: 4,
    titel: "Samenvatting + leadscore",
    tekst: "De assistent maakt een nette samenvatting en bepaalt hoe kansrijk de aanvraag is.",
  },
  {
    nummer: 5,
    titel: "Veilig opgeslagen",
    tekst: "De aanvraag en eventuele foto's worden veilig opgeslagen in de EU.",
  },
  {
    nummer: 6,
    titel: "Mail naar jou",
    tekst: "Je ontvangt direct een verzorgde e-mail met de aanvraag en de leadscore.",
  },
  {
    nummer: 7,
    titel: "Zichtbaar in je dashboard",
    tekst: "Alles staat overzichtelijk klaar in je dashboard, klaar om op te volgen.",
  },
];
