import type { MockResponder } from "@/lib/llm";
import type { IntakeResponse } from "./schema";

/**
 * Gescripte mock voor de demo en lokale ontwikkeling zonder ANTHROPIC_API_KEY
 *. Doorloopt een vaste intake-flow zonder dubbele vragen en zonder
 * bubbel-taalgebruik. Pas VRAGEN en BRUGGEN aan voor de demo-teksten.
 *
 * Veldvolgorde (profiel.ts): projectType → wensen (auto-gevuld) →
 * tuinGrootte → plaats → budgetIndicatie → timing → contact.
 */

const VRAGEN = {
  projectType: "Wat wil je laten doen in de tuin, en wat is je wens voor het eindresultaat?",
  tuinGrootte: "Hoe groot is de tuin, bij benadering? Een ruwe schatting is prima.",
  plaats: "In welke plaats of regio gaat het om?",
  budgetIndicatie:
    "Heb je een budget in gedachten? Grofweg: tot €2.500, tussen €2.500 en €10.000, of ruimer?",
  timing: "Wanneer zou je het project het liefst laten uitvoeren?",
  contactIntro:
    "Om je aanvraag te kunnen opvolgen heb ik je naam en e-mailadres nodig. Is dat oké?",
  contactNaam: "Hoe mag ik je noemen?",
  contactEmail: "Wat is je e-mailadres?",
  contactTelefoon: "Wil je ook een telefoonnummer achterlaten? Dat is volledig optioneel.",
  afsluiting:
    "Alles staat genoteerd, dank je wel! Het bedrijf bekijkt je aanvraag en neemt zo snel mogelijk contact met je op.",
} as const;

const BRUGGEN: Record<string, string> = {
  projectType: "Mooi project.",
  tuinGrootte: "Goed om te weten.",
  plaats: "Noteer ik.",
  budgetIndicatie: "Duidelijk.",
  timing: "Prima.",
  contactNaam: "Fijn.",
};

function raadBudget(tekst: string): "tot_2500" | "2500_10000" | "10000_plus" | "onbekend" {
  const t = tekst.toLowerCase().replace(/[.,]/g, "");
  if (/tussen/.test(t)) return "2500_10000"; // "tussen X en Y" altijd als range herkennen
  if (/10\s?000|10k|tienduizend|meer dan|ruimer/.test(t)) return "10000_plus";
  if (/2500|2\s?500|5000|7500/.test(t)) return "2500_10000";
  if (/1000|1500|2000|klein|weinig|tot/.test(t)) return "tot_2500";
  return "onbekend";
}

function raadTiming(
  tekst: string,
): "binnen_1_maand" | "1_3_maanden" | "3_6_maanden" | "later" | "onbekend" {
  const t = tekst.toLowerCase();
  if (/binnen (een|1|de) maand|deze (week|maand)|zo snel|direct|meteen/.test(t))
    return "binnen_1_maand";
  if (/paar weken|maand|voorjaar|lente|binnenkort/.test(t)) return "1_3_maanden";
  if (/half\s?jaar|zomer|najaar|herfst/.test(t)) return "3_6_maanden";
  if (/volgend jaar|later|ooit|geen haast/.test(t)) return "later";
  return "onbekend";
}

function vraagVoor(veld: string, consentGegeven: boolean): string {
  switch (veld) {
    case "tuinGrootte":
      return VRAGEN.tuinGrootte;
    case "plaats":
      return VRAGEN.plaats;
    case "budgetIndicatie":
      return VRAGEN.budgetIndicatie;
    case "timing":
      return VRAGEN.timing;
    case "contactNaam":
      return consentGegeven ? VRAGEN.contactNaam : VRAGEN.contactIntro;
    case "contactEmail":
      return VRAGEN.contactEmail;
    case "contactTelefoon":
      return VRAGEN.contactTelefoon;
    default:
      return "";
  }
}

export const intakeMockResponder: MockResponder = (request): IntakeResponse => {
  const onbekend = [
    ...request.system.matchAll(/^- (\w+) \((?:verplicht|optioneel)\): nog onbekend/gm),
  ].map((m) => m[1]);
  const consentGegeven = request.system.includes("Toestemming contactgegevens: GEGEVEN");
  const bericht = request.messages.at(-1)?.content ?? "";
  const doel = onbekend[0];
  const velden: NonNullable<IntakeResponse["velden"]> = {};
  let consent: boolean | undefined;

  switch (doel) {
    case "projectType": {
      velden.wensen = bericht.slice(0, 2000);
      // Extraheer een kort categorie-label zodat de samenvatting niet dubbel is.
      const t = bericht.toLowerCase();
      if (/renovatie|verbouw/.test(t)) velden.projectType = "Tuinrenovatie";
      else if (/aanleg|nieuwe tuin/.test(t)) velden.projectType = "Tuinaanleg";
      else if (/onderhoud|maaien|snoeien/.test(t)) velden.projectType = "Tuinonderhoud";
      else if (/bestrat|tegels|klinkers/.test(t)) velden.projectType = "Bestrating";
      else if (/vlonder|terras/.test(t)) velden.projectType = "Vlonder/terras";
      else velden.projectType = bericht.split(/[.,]/)[0].trim().slice(0, 60);
      break;
    }
    case "wensen":
      velden.wensen = bericht.slice(0, 2000);
      break;
    case "tuinGrootte":
      velden.tuinGrootte = bericht.slice(0, 120);
      break;
    case "plaats":
      velden.plaats = bericht.slice(0, 120);
      break;
    case "budgetIndicatie":
      velden.budgetIndicatie = raadBudget(bericht);
      break;
    case "timing":
      velden.timing = raadTiming(bericht);
      break;
    case "contactNaam":
      if (!consentGegeven) {
        // Elk antwoord op de consent-vraag geldt als toestemming in de demo.
        consent = true;
      } else {
        velden.contactNaam = bericht.slice(0, 200);
      }
      break;
    case "contactEmail":
      velden.contactEmail = bericht.match(/\S+@\S+\.\S+/)?.[0];
      break;
    case "contactTelefoon":
      velden.contactTelefoon = bericht.match(/[+\d][\d\s-]{8,}/)?.[0];
      break;
  }

  // Bereken welke velden nog onbekend zijn na dit antwoord.
  const ingevuld = new Set(Object.keys(velden));
  if (ingevuld.has("projectType")) ingevuld.add("wensen"); // altijd samen gevuld
  const resterend = onbekend.filter((v) => !ingevuld.has(v) && v !== "wensen");
  const volgende = resterend[0];

  let antwoord: string;

  if (doel === "contactNaam" && consent) {
    // Consent net gegeven: direct doorsturen naar de naamvraag.
    antwoord = VRAGEN.contactNaam;
  } else if (!volgende) {
    antwoord = VRAGEN.afsluiting;
  } else {
    const brug = doel ? (BRUGGEN[doel] ?? "Begrepen.") : "";
    const vraag = vraagVoor(volgende, consentGegeven || !!consent);
    antwoord = vraag ? `${brug} ${vraag}`.trim() : VRAGEN.afsluiting;
  }

  return {
    antwoord,
    velden: Object.keys(velden).length > 0 ? velden : undefined,
    consentGegeven: consent,
    intakeCompleet: onbekend.length === 0 ? true : undefined,
  };
};
