"use client";

import { useActionState, useState } from "react";
import {
  bevestigMfaInstellenActie,
  startMfaInstellenActie,
  type MfaInstellenStap,
} from "../../acties";
import s from "../../../dashboard/dashboard.module.css";

/** Twee stappen: koppeling starten (QR tonen), daarna de eerste code bevestigen. */
export function MfaInstellen() {
  const [gestart, setGestart] = useState<MfaInstellenStap>({ stap: "start" });
  const [bezig, setBezig] = useState(false);

  if (gestart.stap === "start") {
    return (
      <>
        {gestart.fout && <p className={s.foutmelding}>{gestart.fout}</p>}
        <button
          type="button"
          className={s.knopPrimair}
          disabled={bezig}
          onClick={async () => {
            setBezig(true);
            setGestart(await startMfaInstellenActie());
            setBezig(false);
          }}
        >
          {bezig ? "Bezig…" : "Start koppelen"}
        </button>
      </>
    );
  }

  return <Bevestigen key={gestart.factorId} gestart={gestart} />;
}

function Bevestigen({ gestart }: { gestart: Extract<MfaInstellenStap, { stap: "scannen" }> }) {
  const [stap, bevestig, bezig] = useActionState(bevestigMfaInstellenActie, gestart);

  if (stap.stap === "start") {
    // Sessie verlopen of status veranderd: opnieuw beginnen.
    return <p className={s.foutmelding}>{stap.fout}</p>;
  }

  return (
    <form action={bevestig}>
      <p className={s.authSub}>1. Scan deze QR-code met je app.</p>
      {/* SVG-data-URL van Supabase Auth; next/image voegt hier niets toe. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={stap.qr} alt="QR-code voor de authenticator-app" width={200} height={200} />
      <p className={s.veldUitleg}>
        Lukt scannen niet? Voer deze sleutel handmatig in: <code>{stap.geheim}</code>
      </p>

      <p className={s.authSub}>2. Vul de code uit de app in.</p>
      {stap.fout && <p className={s.foutmelding}>{stap.fout}</p>}
      <input type="hidden" name="factorId" value={stap.factorId} />
      <label className={s.label} htmlFor="code">
        Code
      </label>
      <input
        className={s.veld}
        id="code"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9 ]{6,7}"
        maxLength={7}
        required
      />
      <button type="submit" className={s.knopPrimair} disabled={bezig}>
        {bezig ? "Bezig…" : "Koppelen bevestigen"}
      </button>
    </form>
  );
}
