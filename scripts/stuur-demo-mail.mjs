/**
 * Stuurt een realistische demo-notificatiemail naar Mailpit voor screenshots.
 * Gebruik: node scripts/stuur-demo-mail.mjs
 * Mailpit draait lokaal op SMTP-poort 54325 (Supabase default).
 */

import net from "net";

const SMTP_HOST = "127.0.0.1";
const SMTP_PORT = 54325;

const VAN = "noreply@offerte-agent.nl";
const NAAM_VAN = "Offerte-Agent";
const AAN = "demo@groenservice.nl";
const NAAM_AAN = "Groen Service Demo";
const DASHBOARD_URL = "http://localhost:3000/dashboard/leads/00000000-0000-0000-0000-000000000001";

const ONDERWERP = "Nieuwe offerte-aanvraag — Utrecht, Tuinrenovatie";

const HTML = `<!doctype html>
<html lang="nl"><body style="margin:0;padding:24px;background:#f5f5f4;font-family:Arial,Helvetica,sans-serif;color:#222;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;padding:24px;">
    <h1 style="margin:0 0 4px;font-size:18px;">Nieuwe offerte-aanvraag</h1>
    <p style="margin:0 0 16px;color:#555;font-size:14px;">via de chat op de site van Groen Service Demo</p>
    <p style="margin:0 0 16px;">
      <span style="display:inline-block;padding:4px 10px;border-radius:999px;background:#1d5c39;color:#fff;font-size:13px;font-weight:bold;">Leadscore: Hoog</span>
    </p>
    <p style="margin:4px 0 0;color:#555;font-size:13px;">Concreet project · Budget aanwezig · Timing duidelijk</p>
    <table style="margin:16px 0;border-collapse:collapse;font-size:14px;">
      <tr><td style="padding:4px 12px 4px 0;color:#555;vertical-align:top;">Naam</td><td style="padding:4px 0;">Sophie van den Berg</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#555;vertical-align:top;">Telefoon</td><td style="padding:4px 0;">06 12 34 56 78</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#555;vertical-align:top;">E-mail</td><td style="padding:4px 0;">sophie@example.nl</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#555;vertical-align:top;">Plaats</td><td style="padding:4px 0;">Utrecht</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#555;vertical-align:top;">Werkzaamheden</td><td style="padding:4px 0;">Tuinrenovatie</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#555;vertical-align:top;">Wensen</td><td style="padding:4px 0;">Complete renovatie achtertuin, nieuwe bestrating, border met vaste planten en een zithoek met vlonder. Tuin is nu kaal en heeft weinig structuur.</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#555;vertical-align:top;">Tuingrootte</td><td style="padding:4px 0;">50 tot 100 m²</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#555;vertical-align:top;">Budget</td><td style="padding:4px 0;">€ 5.000 tot € 15.000</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#555;vertical-align:top;">Timing</td><td style="padding:4px 0;">Binnen 3 maanden</td></tr>
    </table>
    <p style="margin:16px 0 0;">
      <a href="${DASHBOARD_URL}" style="display:inline-block;padding:10px 18px;background:#1f6f43;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;">Bekijk in dashboard</a>
    </p>
  </div>
</body></html>`;

const TEKST = [
  "Nieuwe offerte-aanvraag",
  "Leadscore: Hoog",
  "Concreet project / Budget aanwezig / Timing duidelijk",
  "",
  "Naam: Sophie van den Berg",
  "Telefoon: 06 12 34 56 78",
  "E-mail: sophie@example.nl",
  "Plaats: Utrecht",
  "Werkzaamheden: Tuinrenovatie",
  "Wensen: Complete renovatie achtertuin, nieuwe bestrating, border met vaste planten en een zithoek met vlonder.",
  "Tuingrootte: 50 tot 100 m²",
  "Budget: € 5.000 tot € 15.000",
  "Timing: Binnen 3 maanden",
  "",
  `Bekijk in dashboard: ${DASHBOARD_URL}`,
].join("\r\n");

// Standaard e-mailheaders + body, afgesloten met CRLF.CRLF
const MAIL_DATA = [
  `From: ${NAAM_VAN} <${VAN}>`,
  `To: ${NAAM_AAN} <${AAN}>`,
  `Subject: ${ONDERWERP}`,
  "MIME-Version: 1.0",
  'Content-Type: multipart/alternative; boundary="boundary_alt"',
  "",
  "--boundary_alt",
  'Content-Type: text/plain; charset="UTF-8"',
  "",
  TEKST,
  "",
  "--boundary_alt",
  'Content-Type: text/html; charset="UTF-8"',
  "",
  HTML,
  "",
  "--boundary_alt--",
  ".",
].join("\r\n");

function smtp(commando) {
  return new Promise((resolve, reject) => {
    const client = net.createConnection(SMTP_PORT, SMTP_HOST);
    const regels = [];
    let buffer = "";
    let stap = 0;

    const stappen = [
      { wacht: "220", stuur: `EHLO localhost\r\n` },
      { wacht: "250", stuur: `MAIL FROM:<${VAN}>\r\n` },
      { wacht: "250", stuur: `RCPT TO:<${AAN}>\r\n` },
      { wacht: "250", stuur: `DATA\r\n` },
      { wacht: "354", stuur: `${MAIL_DATA}\r\n` },
      { wacht: "250", stuur: `QUIT\r\n` },
      { wacht: "221", stuur: null },
    ];

    client.on("data", (chunk) => {
      buffer += chunk.toString();
      const lijnen = buffer.split("\r\n");
      buffer = lijnen.pop();

      for (const lijn of lijnen) {
        regels.push(lijn);
        const verwacht = stappen[stap]?.wacht;
        if (verwacht && lijn.startsWith(verwacht) && !lijn.startsWith(`${verwacht}-`)) {
          const volgende = stappen[stap + 1];
          stap++;
          if (volgende?.stuur) {
            client.write(volgende.stuur);
          } else {
            client.end();
            resolve(regels);
          }
        }
      }
    });

    client.on("error", reject);
    client.on("connect", () => {});
  });
}

try {
  const log = await smtp();
  console.log("Mail verstuurd naar Mailpit. Open http://localhost:54324");
  console.log(log.filter((r) => r.startsWith("2") || r.startsWith("3")).join("\n"));
} catch (err) {
  console.error("Mislukt:", err.message);
  console.error("Controleer of Supabase lokaal draait: npx supabase start");
}
