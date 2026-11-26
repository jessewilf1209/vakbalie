"use client";
import { useEffect } from "react";
import { ANALYTICS_EVENT_PAD, ANALYTICS_SCRIPT_PAD } from "@/lib/analytics";

type PlausibleStub = ((...args: unknown[]) => void) & {
  q?: unknown[][];
  o?: Record<string, unknown>;
  init?: (opties?: Record<string, unknown>) => void;
};

declare global {
  interface Window {
    plausible?: PlausibleStub;
  }
}

/**
 * Laadt Plausible (cookieloos) op de marketingpagina's. Alleen gerenderd
 * als NEXT_PUBLIC_PLAUSIBLE_SCRIPT gezet is (zie src/lib/analytics.ts).
 *
 * Doet in een effect wat de officiële snippet inline doet: eerst een stub
 * die aanroepen in een wachtrij zet en de init-opties bewaart, dan het
 * script. Zo is er geen inline <script> nodig (CSP-vriendelijk). Bewust
 * niet in de widget: die draait op de sites van klanten.
 */
export function Analytics() {
  useEffect(() => {
    if (window.plausible) return; // al geladen (client-side navigatie)
    const stub: PlausibleStub = (...args: unknown[]) => {
      (stub.q = stub.q ?? []).push(args);
    };
    stub.init = (opties) => {
      stub.o = opties ?? {};
    };
    window.plausible = stub;
    stub.init({ endpoint: ANALYTICS_EVENT_PAD });

    const script = document.createElement("script");
    script.async = true;
    script.src = ANALYTICS_SCRIPT_PAD;
    document.head.appendChild(script);
  }, []);
  return null;
}
