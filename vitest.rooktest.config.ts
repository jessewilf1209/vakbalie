import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import path from "path";
import { defineConfig } from "vitest/config";

/** Leest `.env.local` als die er is; een lege omgeving geeft later een duidelijke fout. */
function leesEnvLocal(): Record<string, string> {
  const bestand = path.resolve(__dirname, ".env.local");
  if (!existsSync(bestand)) return {};
  return parseEnv(readFileSync(bestand, "utf8")) as Record<string, string>;
}

/**
 * Rooktests tegen een ECHT model (`pnpm rooktest:llm`). Bewust een eigen
 * configuratie: de gewone testrun (`pnpm test`) en CI raken deze bestanden
 * nooit, want ze kosten geld en hebben inloggegevens nodig.
 *
 * Laadt `.env.local` volledig (ook variabelen zonder VITE_-voorvoegsel),
 * zodat `LLM_PROVIDER`, `AWS_PROFILE` en eventueel `ANTHROPIC_API_KEY` uit
 * dezelfde plek komen als bij `pnpm dev`.
 */
export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.rooktest.ts"],
    env: leesEnvLocal(),
    // Eén gesprek is een reeks echte aanroepen achter elkaar.
    testTimeout: 180_000,
    hookTimeout: 60_000,
    // Na elkaar, zodat het rapport leesbaar blijft en we geen throttling uitlokken.
    fileParallelism: false,
    sequence: { concurrent: false },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
