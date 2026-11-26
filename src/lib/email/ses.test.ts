import { afterEach, describe, expect, it, vi } from "vitest";
import { bouwSesVerzoek, SesEmailProvider, type SesClient } from "./ses";
import type { EmailBericht } from "./types";

const AFZENDER = "aanvragen@vakbalie.nl";

const bericht: EmailBericht = {
  aan: "vakman@groenenco.test",
  onderwerp: "Nieuwe offerte-aanvraag: Epe, aanleg",
  html: "<p>Nieuwe aanvraag</p>",
  tekst: "Nieuwe aanvraag",
};

function sesFout(naam: string, status?: number, fault?: "client" | "server") {
  return Object.assign(new Error("Email address is not verified: prive@example.com"), {
    name: naam,
    ...(status ? { $metadata: { httpStatusCode: status } } : {}),
    ...(fault ? { $fault: fault } : {}),
  });
}

function maakProvider(send: SesClient["send"], configuratieSet?: string) {
  return new SesEmailProvider(
    { regio: "eu-north-1", afzender: AFZENDER, configuratieSet },
    { send },
  );
}

describe("bouwSesVerzoek", () => {
  it("bouwt een eenvoudig bericht met html en platte tekst", () => {
    expect(bouwSesVerzoek(bericht, { afzender: AFZENDER })).toEqual({
      FromEmailAddress: AFZENDER,
      Destination: { ToAddresses: ["vakman@groenenco.test"] },
      Content: {
        Simple: {
          Subject: { Data: bericht.onderwerp, Charset: "UTF-8" },
          Body: {
            Html: { Data: "<p>Nieuwe aanvraag</p>", Charset: "UTF-8" },
            Text: { Data: "Nieuwe aanvraag", Charset: "UTF-8" },
          },
        },
      },
    });
  });

  it("zet de weergavenaam vóór het afzenderadres", () => {
    const verzoek = bouwSesVerzoek(
      { ...bericht, afzenderNaam: "Groen & Co" },
      { afzender: AFZENDER },
    );
    expect(verzoek.FromEmailAddress).toBe(`"Groen & Co" <${AFZENDER}>`);
  });

  it("haalt een headerinjectie uit de weergavenaam", () => {
    const verzoek = bouwSesVerzoek(
      { ...bericht, afzenderNaam: "Kwaad\r\nBcc: stiekem@aanvaller.test" },
      { afzender: AFZENDER },
    );
    expect(verzoek.FromEmailAddress).not.toMatch(/[\r\n]/);
    expect(verzoek.FromEmailAddress).toContain(`<${AFZENDER}>`);
  });

  it("zet reply-to en de configuration set alleen als ze zijn opgegeven", () => {
    const kaal = bouwSesVerzoek(bericht, { afzender: AFZENDER });
    expect(kaal).not.toHaveProperty("ReplyToAddresses");
    expect(kaal).not.toHaveProperty("ConfigurationSetName");

    const vol = bouwSesVerzoek(
      { ...bericht, replyTo: "info@groenenco.test" },
      { afzender: AFZENDER, configuratieSet: "transactioneel" },
    );
    expect(vol.ReplyToAddresses).toEqual(["info@groenenco.test"]);
    expect(vol.ConfigurationSetName).toBe("transactioneel");
  });
});

describe("SesEmailProvider", () => {
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

  afterEach(() => {
    consoleError.mockClear();
  });

  it("verstuurt het gebouwde verzoek en meldt succes", async () => {
    const send = vi.fn<SesClient["send"]>(async () => ({ MessageId: "test" }));
    const resultaat = await maakProvider(send, "transactioneel").verstuur(bericht);

    expect(resultaat).toEqual({ ok: true });
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0]![0].input).toEqual(
      bouwSesVerzoek(bericht, { afzender: AFZENDER, configuratieSet: "transactioneel" }),
    );
  });

  it.each([
    ["MessageRejected", 400, "client", "afgewezen"],
    ["MailFromDomainNotVerifiedException", 400, "client", "afgewezen"],
    ["AccountSuspendedException", 400, "client", "afgewezen"],
    ["SendingPausedException", 400, "client", "afgewezen"],
    ["AccessDeniedException", 403, "client", "afgewezen"],
    ["CredentialsProviderError", undefined, undefined, "afgewezen"],
    ["TooManyRequestsException", 429, "client", "netwerk"],
    ["LimitExceededException", 400, "client", "netwerk"],
    ["InternalServiceErrorException", 500, "server", "netwerk"],
    ["TimeoutError", undefined, undefined, "netwerk"],
  ] as const)("%s geeft reden %s", async (naam, status, fault, reden) => {
    const provider = maakProvider(async () => {
      throw sesFout(naam, status, fault);
    });
    expect(await provider.verstuur(bericht)).toEqual({ ok: false, reden });
  });

  it("geeft bij MessageRejected een herkenbare regel over de sandbox", async () => {
    await maakProvider(async () => {
      throw sesFout("MessageRejected", 400, "client");
    }).verstuur(bericht);

    expect(consoleError).toHaveBeenCalledExactlyOnceWith(
      "ses-verzending afgewezen (MessageRejected)",
      expect.objectContaining({ hint: expect.stringContaining("sandbox") }),
    );
  });

  it("logt nooit het adres of de foutmelding van SES", async () => {
    for (const naam of ["MessageRejected", "BadRequestException", "TimeoutError"]) {
      await maakProvider(async () => {
        throw sesFout(naam, 400, "client");
      }).verstuur(bericht);
    }
    const gelogd = JSON.stringify(consoleError.mock.calls);
    expect(gelogd).not.toContain("prive@example.com");
    expect(gelogd).not.toContain("vakman@groenenco.test");
  });
});
