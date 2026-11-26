"use client";
import { useState } from "react";
import s from "../../../dashboard.module.css";

function hexNaarLuminantie(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrastTegen(hex: string, achtergrondLum: number): number {
  const lum = hexNaarLuminantie(hex);
  const l1 = Math.max(lum, achtergrondLum);
  const l2 = Math.min(lum, achtergrondLum);
  return (l1 + 0.05) / (l2 + 0.05);
}

interface Props {
  defaultValue: string;
}

export function KleurVeld({ defaultValue }: Props) {
  const geldigHex = /^#[0-9a-fA-F]{6}$/.test(defaultValue);
  const [kleur, setKleur] = useState(geldigHex ? defaultValue : "#1f6f43");
  const contrastMetWit = contrastTegen(kleur, 1);
  const teLicht = contrastMetWit < 3;

  return (
    <div className={s.kleurVeldWrap}>
      <input
        id="widgetKleur"
        name="widgetKleur"
        type="color"
        value={kleur}
        onChange={(e) => setKleur(e.target.value)}
        className={s.kleurVeld}
      />
      <span className={s.kleurPreview} style={{ background: kleur }} aria-hidden="true">
        <span style={{ color: "#fff", fontSize: "0.75rem", fontWeight: 600 }}>Chat</span>
      </span>
      {teLicht && (
        <p className={s.kleurWaarschuwing}>
          Deze kleur is te licht, witte tekst op de widget-knop wordt onleesbaar. Kies een
          donkerdere kleur.
        </p>
      )}
    </div>
  );
}
