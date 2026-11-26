import "server-only";
import { z } from "zod";
import { leesDagBudgetConfig } from "@/lib/llm/budget";
import { getDemoTenantKey } from "@/lib/widget/demo";
import { vereisAdminActie } from "./toegang";
import type { Periode } from "./periode";
import {
  overzichtRijSchema,
  tenantRijSchema,
  trendRijSchema,
  type PlatformOverzicht,
  type TenantCijfers,
  type TrendDag,
} from "./cijfers-types";

export type { PlatformOverzicht, TenantCijfers, TrendDag } from "./cijfers-types";

/**
 * Cijfers voor het admin-dashboard (PR C1). Leest uitsluitend via de
 * admin-functies in de database, met de sessie van de admin: geen
 * service-role. Elke functie hier begint met de guard, ook al doet de
 * database dezelfde check: zo faalt een vergeten guard in een pagina nooit
 * stil.
 */

export class CijfersFout extends Error {
  constructor(functie: string, code?: string) {
    // Alleen de functienaam en foutcode: nooit data in de melding.
    super(`${functie} mislukt (${code ?? "onbekend"})`);
    this.name = "CijfersFout";
  }
}

function periodeArgs(periode: Periode) {
  return { p_van: periode.van.toISOString(), p_tot: periode.tot.toISOString() };
}

export async function haalKostenPerTenant(periode: Periode): Promise<TenantCijfers[]> {
  const { supabase } = await vereisAdminActie();
  const { data, error } = await supabase.rpc("admin_kosten_per_tenant", {
    ...periodeArgs(periode),
    p_uitgesloten_widget_key: getDemoTenantKey(),
  });
  if (error) throw new CijfersFout("admin_kosten_per_tenant", error.code);
  return z.array(tenantRijSchema).parse(data);
}

export async function haalPlatformOverzicht(periode: Periode): Promise<PlatformOverzicht> {
  const { supabase } = await vereisAdminActie();
  const { data, error } = await supabase.rpc("admin_platform_overzicht", {
    ...periodeArgs(periode),
    p_uitgesloten_widget_key: getDemoTenantKey(),
  });
  if (error) throw new CijfersFout("admin_platform_overzicht", error.code);
  const [rij] = z.array(overzichtRijSchema).length(1).parse(data);
  return rij;
}

export async function haalTenantTrend(tenantId: string, periode: Periode): Promise<TrendDag[]> {
  const id = z.guid().parse(tenantId);
  const { supabase } = await vereisAdminActie();
  const { data, error } = await supabase.rpc("admin_tenant_trend", {
    p_tenant_id: id,
    ...periodeArgs(periode),
  });
  if (error) throw new CijfersFout("admin_tenant_trend", error.code);
  return z.array(trendRijSchema).parse(data);
}

/* ------------------------------------------------------------------ *
 * Configuratie (env vars)
 * ------------------------------------------------------------------ */

export interface AdminWeergaveConfig {
  /** Dagplafond van de dagrem, in eenheden; dezelfde waarde als de rem gebruikt. */
  dagremPlafond: number;
  /** Euro per dollar voor de indicatie, of null als niet ingesteld. */
  eurPerUsd: number | null;
  /** Vaste platformkosten per maand in eenheden (Vercel, Supabase, domein), of null. */
  vasteKostenPerMaand: number | null;
}

function positiefGetal(waarde: string | undefined): number | null {
  const tekst = waarde?.trim();
  if (!tekst || !/^\d+(\.\d+)?$/.test(tekst)) return null;
  const getal = Number(tekst);
  return Number.isFinite(getal) && getal > 0 ? getal : null;
}

export function leesAdminWeergaveConfig(
  bron: NodeJS.ProcessEnv = process.env,
): AdminWeergaveConfig {
  const vast = positiefGetal(bron.ADMIN_VASTE_KOSTEN_USD_PER_MAAND);
  return {
    dagremPlafond: leesDagBudgetConfig(bron).plafond,
    eurPerUsd: positiefGetal(bron.ADMIN_EUR_PER_USD),
    vasteKostenPerMaand: vast === null ? null : Math.round(vast * 10_000),
  };
}
