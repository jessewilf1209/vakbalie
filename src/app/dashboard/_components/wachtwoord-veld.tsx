"use client";
import { useState } from "react";
import s from "../dashboard.module.css";

interface Props {
  id: string;
  name: string;
  autoComplete: string;
  minLength?: number;
  required?: boolean;
}

export function WachtwoordVeld({ id, name, autoComplete, minLength, required }: Props) {
  const [zichtbaar, setZichtbaar] = useState(false);
  return (
    <div className={s.wachtwoordWrap}>
      <input
        className={s.veld}
        id={id}
        name={name}
        type={zichtbaar ? "text" : "password"}
        autoComplete={autoComplete}
        minLength={minLength}
        required={required}
      />
      <button
        type="button"
        className={s.oogKnop}
        aria-label={zichtbaar ? "Wachtwoord verbergen" : "Wachtwoord tonen"}
        onClick={() => setZichtbaar((v) => !v)}
      >
        {zichtbaar ? "Verberg" : "Toon"}
      </button>
    </div>
  );
}
