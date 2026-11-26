import type { SamenvattingsRegel } from "@/lib/intake/samenvatting";
import type { LeadscoreCategorie } from "@/lib/leadscore";
import type { EmailBericht } from "./types";

/**
 * Notificatiemail bij een nieuwe lead.
 *
 * KERNREGEL (stap 2.3): álle door bezoekers of LLM aangeleverde velden
 * worden HTML-escaped vóór ze de template ingaan. Een bezoeker die
 * <script> of nep-HTML in zijn tuinwensen typt mag nooit opmaak of inhoud
 * injecteren. De mail bevat alleen kerngegevens, niet het
 * volledige gesprek.
 */

export function escapeHtml(tekst: string): string {
  return tekst
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Newlines uit kopregels: voorkomt header-injectie via onderwerp. */
export function veiligOnderwerp(tekst: string): string {
  return tekst.replace(/[\r\n]+/g, " ").slice(0, 200);
}

const SCORE_LABEL: Record<LeadscoreCategorie, string> = {
  hoog: "Hoog",
  middel: "Middel",
  laag: "Laag",
};

const SCORE_KLEUR: Record<LeadscoreCategorie, string> = {
  hoog: "#1d5c39",
  middel: "#8a6d1a",
  laag: "#666666",
};

export interface NieuweLeadMailInput {
  bedrijfsnaam: string;
  plaats: string | null;
  projectType: string | null;
  samenvatting: SamenvattingsRegel[];
  score: { categorie: LeadscoreCategorie; redenen: string[] };
  dashboardUrl: string;
}

export function bouwNieuweLeadMail(input: NieuweLeadMailInput): Omit<EmailBericht, "aan"> {
  const onderwerp = veiligOnderwerp(
    `Nieuwe offerte-aanvraag — ${input.plaats ?? "onbekende plaats"}, ${
      input.projectType ?? "aanvraag"
    }`,
  );

  const regelsHtml = input.samenvatting
    .map(
      (r) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#555;vertical-align:top;">${escapeHtml(
          r.label,
        )}</td><td style="padding:4px 0;">${escapeHtml(r.waarde)}</td></tr>`,
    )
    .join("");

  const redenenHtml =
    input.score.redenen.length > 0
      ? `<p style="margin:4px 0 0;color:#555;font-size:13px;">${input.score.redenen
          .map(escapeHtml)
          .join(" · ")}</p>`
      : "";

  // Platte, robuuste HTML — mailclients zijn geen browsers (stap 2.2).
  const html = `<!doctype html>
<html lang="nl"><body style="margin:0;padding:24px;background:#f5f5f4;font-family:Arial,Helvetica,sans-serif;color:#222;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;padding:24px;">
    <h1 style="margin:0 0 4px;font-size:18px;">Nieuwe offerte-aanvraag</h1>
    <p style="margin:0 0 16px;color:#555;font-size:14px;">via de chat op de site van ${escapeHtml(
      input.bedrijfsnaam,
    )}</p>
    <p style="margin:0 0 16px;">
      <span style="display:inline-block;padding:4px 10px;border-radius:999px;background:${
        SCORE_KLEUR[input.score.categorie]
      };color:#fff;font-size:13px;font-weight:bold;">Leadscore: ${
        SCORE_LABEL[input.score.categorie]
      }</span>
    </p>
    ${redenenHtml}
    <table style="margin:16px 0;border-collapse:collapse;font-size:14px;">${regelsHtml}</table>
    <p style="margin:16px 0 0;">
      <a href="${escapeHtml(input.dashboardUrl)}" style="display:inline-block;padding:10px 18px;background:#1f6f43;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;">Bekijk in dashboard</a>
    </p>
  </div>
</body></html>`;

  const tekst = [
    "Nieuwe offerte-aanvraag",
    `Leadscore: ${SCORE_LABEL[input.score.categorie]}`,
    ...(input.score.redenen.length > 0 ? [input.score.redenen.join(" / ")] : []),
    "",
    ...input.samenvatting.map((r) => `${r.label}: ${r.waarde}`),
    "",
    `Bekijk in dashboard: ${input.dashboardUrl}`,
  ].join("\n");

  return { onderwerp, html, tekst };
}
