import type { Metadata } from "next";
import { isEmbedMode } from "@/lib/widget/embed";
import { isValidTenantKeyFormat } from "@/lib/widget/tenant-key";
import { WidgetShell } from "./widget-shell";

export const metadata: Metadata = {
  title: "Offerte-assistent",
  // Widget-pagina's zijn embed-doelen, geen vindbare content.
  robots: { index: false, follow: false },
};

export default async function WidgetPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantKey: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const { tenantKey } = await params;
  const { mode } = await searchParams;

  if (!isValidTenantKeyFormat(tenantKey)) {
    // Neutrale melding: geen interne details over waarom de key ongeldig is.
    return (
      <main style={{ padding: "1.5rem", fontFamily: "system-ui, sans-serif" }}>
        <p>Deze chat is niet beschikbaar. Neem rechtstreeks contact op met het bedrijf.</p>
      </main>
    );
  }

  return (
    <WidgetShell
      tenantKey={tenantKey}
      // Feature-flag: zonder site-key staat de botcheck uit.
      turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null}
      // Inline-embed: volledig venster zonder sluitknop.
      embed={isEmbedMode(mode)}
    />
  );
}
