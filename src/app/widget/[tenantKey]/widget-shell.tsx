"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { MAX_FOTOS_PER_GESPREK } from "@/lib/widget/foto-limieten";
import { verkleinFoto } from "@/lib/widget/foto-verkleinen";
import s from "./widget.module.css";

/**
 * Chat-shell binnen het iframe (stap 9: volledig design).
 * - Theming per tenant via CSS-variabele --w-kleur (server-side
 *   gevalideerde hex) + eigen welkomsttekst.
 * - Signatuurmoment: samenvattingskaart met bevestigen/aanpassen vóór de
 *   aanvraag definitief wordt (POST /api/widget/confirm).
 * - Alles wordt als platte tekst gerenderd (React escapet); postMessage
 *   draagt alleen een sluit-signaal.
 */

interface Bericht {
  rol: "user" | "assistant";
  tekst: string;
  /** Blob-URL van een geüploade foto, voor een thumbnail in de chatbubbel. */
  preview?: string;
}

interface SamenvattingsRegel {
  label: string;
  waarde: string;
}

type SessieStatus =
  | { fase: "laden" }
  | {
      fase: "klaar";
      tenantName: string;
      sessionToken: string;
      privacyUrl: string | null;
      /** Publieke demo: geen foto-upload. */
      demo: boolean;
    }
  | { fase: "fout"; melding: string };

const FOUT_MELDING = "Er ging iets mis bij het starten van de chat. Probeer het later opnieuw.";
const STANDAARD_WELKOM =
  "Welkom! Ik help je graag bij het opstellen van een offerte-aanvraag. Waarmee kan ik je helpen?";

const TEKST_LICHT = "#ffffff";
const TEKST_DONKER = "#1b1d1b";

/**
 * Kiest de best leesbare tekstkleur (wit of donker) bovenop de merkkleur,
 * zodat een lichte merkkleur geen onleesbare witte tekst geeft. Gebruikt de
 * WCAG-luminantie en het echte contrastgetal: de kleur met het hoogste
 * contrast wint. Deze waarde voedt --w-tekst, die alle "tekst op merkkleur"-
 * plekken (header, bezoekersbubbel, knoppen) aanstuurt.
 */
function leesbareTekstKleur(hex: string): string {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!match) return TEKST_LICHT;
  const getal = parseInt(match[1], 16);
  const kanaal = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const luminantie =
    0.2126 * kanaal((getal >> 16) & 255) +
    0.7152 * kanaal((getal >> 8) & 255) +
    0.0722 * kanaal(getal & 255);
  // Contrast t.o.v. wit (luminantie 1) vs. donkere inkt (~0.013).
  const contrastWit = 1.05 / (luminantie + 0.05);
  const contrastDonker = (luminantie + 0.05) / (0.013 + 0.05);
  return contrastDonker > contrastWit ? TEKST_DONKER : TEKST_LICHT;
}

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: string | HTMLElement,
        opties: {
          sitekey: string;
          callback: (token: string) => void;
          "error-callback"?: () => void;
        },
      ) => string;
    };
  }
}

export function WidgetShell({
  tenantKey,
  turnstileSiteKey,
  embed = false,
}: {
  tenantKey: string;
  turnstileSiteKey: string | null;
  /** Inline-embed: rendert als volledig venster zonder sluitknop. */
  embed?: boolean;
}) {
  const [sessie, setSessie] = useState<SessieStatus>({ fase: "laden" });
  const [kleur, setKleur] = useState("#1f6f43");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileContainer = useRef<HTMLDivElement>(null);
  const turnstileGestart = useRef(false);
  const [berichten, setBerichten] = useState<Bericht[]>([]);
  const [invoer, setInvoer] = useState("");
  const [bezig, setBezig] = useState(false);
  const [samenvatting, setSamenvatting] = useState<SamenvattingsRegel[] | null>(null);
  const [bevestigBezig, setBevestigBezig] = useState(false);
  const [afgerond, setAfgerond] = useState(false);
  const [foutmelding, setFoutmelding] = useState<string | null>(null);
  const [fotoAantal, setFotoAantal] = useState(0);
  const [fotoBezig, setFotoBezig] = useState(false);
  const fotoInput = useRef<HTMLInputElement>(null);
  const tekstInput = useRef<HTMLInputElement>(null);
  const onderkant = useRef<HTMLDivElement>(null);

  // Turnstile-script laden en renderen zodra de feature aanstaat.
  useEffect(() => {
    if (!turnstileSiteKey || turnstileGestart.current) return;
    turnstileGestart.current = true;

    const render = () => {
      if (window.turnstile && turnstileContainer.current) {
        window.turnstile.render(turnstileContainer.current, {
          sitekey: turnstileSiteKey,
          callback: (token) => setTurnstileToken(token),
          "error-callback": () => setSessie({ fase: "fout", melding: FOUT_MELDING }),
        });
      }
    };

    if (window.turnstile) {
      render();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onload = render;
    script.onerror = () => setSessie({ fase: "fout", melding: FOUT_MELDING });
    document.head.appendChild(script);
  }, [turnstileSiteKey]);

  useEffect(() => {
    // Met Turnstile actief: wachten op het token vóór de sessie start.
    if (turnstileSiteKey && !turnstileToken) return;

    let actief = true;
    (async () => {
      try {
        const res = await fetch("/api/widget/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tenantKey,
            ...(turnstileToken ? { turnstileToken } : {}),
          }),
        });
        if (!actief) return;
        if (!res.ok) {
          setSessie({
            fase: "fout",
            melding:
              res.status === 404
                ? "Deze chat is niet beschikbaar. Neem rechtstreeks contact op met het bedrijf."
                : FOUT_MELDING,
          });
          return;
        }
        const data: {
          sessionToken: string;
          tenantName: string;
          widgetKleur: string;
          welkomsttekst: string | null;
          privacyUrl: string | null;
          demo?: boolean;
        } = await res.json();
        if (!actief) return;
        // Extra client-side check op de kleur vóór hij een CSS-var wordt.
        if (/^#[0-9a-fA-F]{6}$/.test(data.widgetKleur)) setKleur(data.widgetKleur);
        setSessie({
          fase: "klaar",
          tenantName: data.tenantName,
          sessionToken: data.sessionToken,
          privacyUrl: data.privacyUrl,
          demo: data.demo === true,
        });
        setBerichten([{ rol: "assistant", tekst: data.welkomsttekst ?? STANDAARD_WELKOM }]);
      } catch {
        if (actief) setSessie({ fase: "fout", melding: FOUT_MELDING });
      }
    })();
    return () => {
      actief = false;
    };
  }, [tenantKey, turnstileSiteKey, turnstileToken]);

  useEffect(() => {
    onderkant.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [berichten, bezig, samenvatting]);

  async function verstuur() {
    if (sessie.fase !== "klaar" || bezig || afgerond) return;
    const tekst = invoer.trim();
    if (!tekst) return;

    setInvoer("");
    setFoutmelding(null);
    setSamenvatting(null);
    setBerichten((b) => [...b, { rol: "user", tekst }]);
    setBezig(true);

    try {
      const res = await fetch("/api/widget/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionToken: sessie.sessionToken, message: tekst }),
      });
      if (!res.ok) {
        setFoutmelding(
          res.status === 401
            ? "Je sessie is verlopen — sluit de chat en open hem opnieuw."
            : res.status === 429
              ? "Rustig aan — probeer het zo weer."
              : "Er ging iets mis — probeer het opnieuw. Je gesprek blijft bewaard.",
        );
        return;
      }
      const data: {
        reply: string;
        completed: boolean;
        bevestigen?: boolean;
        samenvatting?: SamenvattingsRegel[];
      } = await res.json();
      setBerichten((b) => [...b, { rol: "assistant", tekst: data.reply }]);
      if (data.completed) setAfgerond(true);
      if (data.bevestigen && data.samenvatting) setSamenvatting(data.samenvatting);
    } catch {
      setFoutmelding("Er ging iets mis — probeer het opnieuw. Je gesprek blijft bewaard.");
    } finally {
      setBezig(false);
    }
  }

  async function bevestig() {
    if (sessie.fase !== "klaar" || bevestigBezig) return;
    setBevestigBezig(true);
    setFoutmelding(null);
    try {
      const res = await fetch("/api/widget/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionToken: sessie.sessionToken }),
      });
      if (!res.ok) {
        setFoutmelding("Versturen mislukte — probeer het opnieuw.");
        return;
      }
      setSamenvatting(null);
      setAfgerond(true);
    } catch {
      setFoutmelding("Versturen mislukte — probeer het opnieuw.");
    } finally {
      setBevestigBezig(false);
    }
  }

  function pasAan() {
    setSamenvatting(null);
    setBerichten((b) => [
      ...b,
      {
        rol: "assistant",
        tekst: "Geen probleem! Typ hieronder wat er anders moet, dan pas ik het aan.",
      },
    ]);
    tekstInput.current?.focus();
  }

  async function uploadFoto(file: File) {
    if (sessie.fase !== "klaar" || fotoBezig || afgerond) return;
    setFoutmelding(null);
    setFotoBezig(true);
    let preview: string | null = null;
    try {
      // Eerst verkleinen: telefoonfoto's zijn vaak groter dan de 4,5 MB die
      // Vercel per request toelaat.
      const foto = await verkleinFoto(file);
      if (!foto) {
        setFoutmelding("Deze foto is te groot of kan niet worden gelezen. Kies een andere foto.");
        return;
      }
      preview = URL.createObjectURL(foto);
      const form = new FormData();
      form.append("sessionToken", sessie.sessionToken);
      form.append("file", foto, "foto.jpg");
      const res = await fetch("/api/widget/photo", { method: "POST", body: form });
      // Een 413 van Vercel zelf is geen JSON; dan valt de melding terug.
      const data: { error?: unknown; aantal?: number; max?: number } = await res
        .json()
        .catch(() => ({}));
      if (!res.ok) {
        URL.revokeObjectURL(preview);
        setFoutmelding(
          typeof data.error === "string"
            ? data.error
            : res.status === 413
              ? "Deze foto is te groot. Kies een kleinere foto."
              : "Foto uploaden mislukte. Probeer het opnieuw.",
        );
        return;
      }
      const aantal = data.aantal ?? 0;
      const max = data.max ?? MAX_FOTOS_PER_GESPREK;
      const fotoPreview = preview;
      setFotoAantal(aantal);
      setBerichten((b) => [
        ...b,
        { rol: "user", tekst: `Foto ${aantal}/${max}`, preview: fotoPreview },
      ]);
    } catch {
      if (preview) URL.revokeObjectURL(preview);
      setFoutmelding("Foto uploaden mislukte. Probeer het opnieuw.");
    } finally {
      setFotoBezig(false);
      if (fotoInput.current) fotoInput.current.value = "";
    }
  }

  function sluit() {
    // Alleen een sluit-signaal; de loader checkt zelf event.origin.
    window.parent.postMessage({ type: "offerte-agent:sluit" }, "*");
  }

  const klaar = sessie.fase === "klaar";
  const invoerUit = !klaar || bezig || afgerond || samenvatting !== null;

  // Het tekstvak wordt tijdens het versturen disabled (en verliest dan de
  // focus). Zodra het weer bruikbaar is, geven we de focus terug zodat de
  // bezoeker direct kan doortypen zonder opnieuw te klikken.
  useEffect(() => {
    if (!invoerUit) tekstInput.current?.focus();
  }, [invoerUit]);

  const statusTekst =
    sessie.fase === "fout" ? "Niet beschikbaar" : klaar ? "Reageert meestal direct" : "Verbinden…";

  return (
    <div
      className={s.scherm}
      style={
        {
          "--w-kleur": kleur,
          "--w-tekst": leesbareTekstKleur(kleur),
        } as React.CSSProperties
      }
    >
      <header className={s.kop}>
        <div className={s.kopIdentiteit}>
          <span className={s.avatar} aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M12 21v-8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M12 13c0-3.1 2.3-5.4 5.2-5.4-.2 3-2.4 5.4-5.2 5.4Z" fill="currentColor" />
              <path d="M12 13.5c0-2.5-1.9-4.4-4.4-4.4.2 2.5 2 4.4 4.4 4.4Z" fill="currentColor" />
            </svg>
          </span>
          <span className={s.kopTekst}>
            <span className={s.kopTitel}>{klaar ? sessie.tenantName : "Offerte-assistent"}</span>
            <span className={`${s.kopStatus} ${klaar ? "" : s.kopStatusUit}`}>{statusTekst}</span>
          </span>
        </div>
        {/* Inline-embed staat middenin een pagina; daar is geen overlay om te
            sluiten, dus geen sluitknop. */}
        {!embed && (
          <button type="button" onClick={sluit} aria-label="Sluit de chat" className={s.sluitKnop}>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        )}
      </header>

      <div className={s.gesprek} aria-live="polite">
        {/* EU AI Act art. 50 lid 1: vóór het gesprek expliciet melden dat de
            bezoeker met een AI-systeem praat en niet met een mens. "Digitale
            assistent" is daarvoor te vaag. */}
        <p className={s.transparantie}>
          Je chat met een AI-assistent, niet met een mens. Het gesprek wordt opgeslagen om je
          aanvraag te verwerken.{" "}
          <a
            href={klaar && sessie.privacyUrl ? sessie.privacyUrl : "/privacy"}
            target="_blank"
            rel="noopener noreferrer"
          >
            Privacyverklaring
          </a>
        </p>

        {sessie.fase === "laden" && (
          <p className={s.bubbelAssistent + " " + s.bubbel}>Verbinden…</p>
        )}
        {sessie.fase === "fout" && <p className={s.fout}>{sessie.melding}</p>}
        {/* Turnstile rendert hier alleen wanneer de feature actief is. */}
        <div ref={turnstileContainer} />

        {berichten.map((b, i) =>
          b.preview ? (
            <div key={i} className={`${s.bubbel} ${s.bubbelBezoeker} ${s.bubbelFoto}`}>
              <img src={b.preview} alt={b.tekst} className={s.fotoPreview} />
              <span className={s.fotoLabel}>{b.tekst}</span>
            </div>
          ) : (
            <p
              key={i}
              className={`${s.bubbel} ${b.rol === "user" ? s.bubbelBezoeker : s.bubbelAssistent}`}
            >
              {b.tekst}
            </p>
          ),
        )}

        {bezig && (
          <span className={s.typing} role="status" aria-label="De assistent typt">
            <span />
            <span />
            <span />
          </span>
        )}

        {samenvatting && klaar && (
          <div className={s.kaart}>
            <p className={s.kaartTitel}>
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
                <path
                  d="M8.5 12.2l2.3 2.3 4.7-4.8"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Dit sturen we naar {sessie.tenantName}:
            </p>
            <dl className={s.kaartLijst}>
              {samenvatting.map((regel) => (
                <Fragment key={regel.label}>
                  <dt>{regel.label}</dt>
                  <dd>{regel.waarde}</dd>
                </Fragment>
              ))}
            </dl>
            <div className={s.kaartKnoppen}>
              <button
                type="button"
                className={s.primair}
                onClick={bevestig}
                disabled={bevestigBezig}
              >
                {bevestigBezig ? "Versturen…" : "Klopt, verstuur"}
              </button>
              <button
                type="button"
                className={s.secundair}
                onClick={pasAan}
                disabled={bevestigBezig}
              >
                Iets aanpassen
              </button>
            </div>
          </div>
        )}

        {foutmelding && <p className={s.fout}>{foutmelding}</p>}
        {afgerond && (
          <p className={s.gelukt}>
            Je aanvraag is verstuurd! {klaar ? sessie.tenantName : "Het bedrijf"} neemt zo snel
            mogelijk contact met je op. Je kunt de chat sluiten.
          </p>
        )}
        <div ref={onderkant} />
      </div>

      <footer className={s.voet}>
        <form
          className={s.composer}
          onSubmit={(e) => {
            e.preventDefault();
            verstuur();
          }}
        >
          <input
            ref={fotoInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadFoto(file);
            }}
          />
          {!(sessie.fase === "klaar" && sessie.demo) && (
            <button
              type="button"
              className={s.fotoKnop}
              onClick={() => fotoInput.current?.click()}
              disabled={invoerUit || fotoBezig || fotoAantal >= 5}
              aria-label="Voeg een foto toe"
              title="Voeg een foto toe (optioneel)"
            >
              {fotoBezig ? (
                "…"
              ) : (
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <rect
                    x="3"
                    y="5"
                    width="18"
                    height="14"
                    rx="2.5"
                    stroke="currentColor"
                    strokeWidth="1.7"
                  />
                  <circle cx="8.5" cy="10" r="1.6" fill="currentColor" />
                  <path
                    d="M4 17l4.5-4 3 2.5L15 11l5 5"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
          )}
          <input
            ref={tekstInput}
            type="text"
            className={s.invoer}
            value={invoer}
            onChange={(e) => setInvoer(e.target.value)}
            disabled={invoerUit}
            maxLength={2000}
            placeholder={afgerond ? "De aanvraag is verstuurd" : "Typ je bericht…"}
            aria-label="Bericht"
          />
          <button
            type="submit"
            className={s.stuurKnop}
            disabled={invoerUit || !invoer.trim()}
            aria-label="Verstuur bericht"
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M12 19V6M12 6l-6 6M12 6l6 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </form>
        <p className={s.poweredBy}>Mogelijk gemaakt door Vakbalie</p>
      </footer>
    </div>
  );
}
