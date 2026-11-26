import type { MockResponder } from "@/lib/llm";

/**
 * Mock voor de opvolgmail- en belscriptgeneratie (mock-first):
 * lokaal en in CI werkt de feature volledig zonder ANTHROPIC_API_KEY en
 * zonder kosten.
 *
 * De mock leest de al gestructureerde blokken uit het gebruikersbericht
 * terug in plaats van te doen alsof hij taal begrijpt. Zo blijft de output
 * plausibel (de naam en plaats van de aanvrager kloppen) zonder een halve
 * taalmodelimitatie te bouwen die alsnog nooit lijkt op het echte werk.
 */

function leesVeld(bericht: string, label: string): string | null {
  const match = new RegExp(`^${label}: (.+)$`, "m").exec(bericht);
  return match?.[1]?.trim() ?? null;
}

/** Bedrijfsnaam staat in de systeemprompt ("... medewerker van X een ..."). */
function leesBedrijfsnaam(system: string): string {
  return /medewerker van (.+?) een/.exec(system)?.[1]?.trim() ?? "ons bedrijf";
}

export const opvolgMockResponder: MockResponder = (request) => {
  const bericht = request.messages.at(-1)?.content ?? "";
  const bedrijfsnaam = leesBedrijfsnaam(request.system);
  const naam = leesVeld(bericht, "Naam aanvrager");
  const plaats = leesVeld(bericht, "Plaats");
  const werk = leesVeld(bericht, "Werkzaamheden");
  const aanhef = naam ? `Hallo ${naam},` : "Hallo,";

  if (request.schemaName === "belscript") {
    return {
      opening: `${aanhef.replace(",", "")}, je spreekt met ${bedrijfsnaam}. Je hebt via onze website een aanvraag gedaan${
        werk ? ` voor ${werk.toLowerCase()}` : ""
      }. Bel ik gelegen?`,
      punten: [
        werk
          ? `Kort doornemen wat je precies wilt laten doen: ${werk.toLowerCase()}.`
          : "Kort doornemen wat je precies wilt laten doen.",
        plaats
          ? `Bevestigen dat het om een locatie in ${plaats} gaat en vragen naar de bereikbaarheid.`
          : "Vragen naar de locatie en de bereikbaarheid.",
        "Vragen wanneer het uitkomt om langs te komen voor een opname ter plaatse.",
      ],
      afsluiting:
        "Ik zet een afspraak in de agenda en stuur je daarna een bevestiging. Bedankt voor het gesprek.",
    };
  }

  return {
    onderwerp: werk ? `Je aanvraag voor ${werk.toLowerCase()}` : "Je offerteaanvraag",
    tekst: [
      aanhef,
      "",
      `Bedankt voor je aanvraag via onze website${plaats ? ` voor je tuin in ${plaats}` : ""}.`,
      werk
        ? `Je gaf aan dat het gaat om ${werk.toLowerCase()}. Ik denk graag met je mee over de aanpak.`
        : "Ik denk graag met je mee over de aanpak.",
      "",
      "Om een passend voorstel te maken kom ik het liefst even langs om de situatie te bekijken.",
      "Laat je weten welke dag en welk dagdeel jou schikt? Dan stem ik daarop af.",
      "",
      "Met vriendelijke groet,",
      bedrijfsnaam,
    ].join("\n"),
  };
};
