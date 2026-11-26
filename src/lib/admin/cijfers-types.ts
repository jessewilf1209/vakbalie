import { z } from "zod";

/**
 * Vorm van wat de admin-functies in de database teruggeven (PR C1). Elke
 * rij wordt met Zod gevalideerd voordat het dashboard hem gebruikt: een
 * schemawijziging valt zo op als fout in plaats van als stil verkeerd getal.
 */

const aantal = z.number().int().nonnegative();
const moment = z
  .string()
  .nullable()
  .transform((w) => (w === null ? null : new Date(w)));

export const tenantRijSchema = z
  .object({
    tenant_id: z.guid(),
    naam: z.string(),
    status: z.enum(["trial", "active", "inactive"]),
    gesprekken: aantal,
    leads: aantal,
    fotos: aantal,
    aanroepen: aantal,
    input_tokens: aantal,
    output_tokens: aantal,
    kosten_intake: aantal,
    kosten_opvolgmail: aantal,
    kosten_belscript: aantal,
    kosten_totaal: aantal,
    notificatiemails: aantal,
    opvolgmails: aantal,
    afgerond_op_budget: aantal,
    rate_limit_geweigerd: aantal,
    dagrem_geweigerd: aantal,
    laatste_gesprek: moment,
    laatste_login: moment,
  })
  .transform((r) => ({
    tenantId: r.tenant_id,
    naam: r.naam,
    status: r.status,
    gesprekken: r.gesprekken,
    leads: r.leads,
    fotos: r.fotos,
    aanroepen: r.aanroepen,
    inputTokens: r.input_tokens,
    outputTokens: r.output_tokens,
    kostenIntake: r.kosten_intake,
    kostenOpvolgmail: r.kosten_opvolgmail,
    kostenBelscript: r.kosten_belscript,
    kostenTotaal: r.kosten_totaal,
    notificatiemails: r.notificatiemails,
    opvolgmails: r.opvolgmails,
    afgerondOpBudget: r.afgerond_op_budget,
    rateLimitGeweigerd: r.rate_limit_geweigerd,
    dagremGeweigerd: r.dagrem_geweigerd,
    laatsteGesprek: r.laatste_gesprek,
    laatsteLogin: r.laatste_login,
  }));
export type TenantCijfers = z.output<typeof tenantRijSchema>;

export const overzichtRijSchema = z
  .object({
    kosten_totaal: aantal,
    kosten_intake: aantal,
    gesprekken: aantal,
    leads: aantal,
    klanten_actief: aantal,
    klanten_trial: aantal,
    klanten_met_gesprekken: aantal,
    dagrem_stand: aantal,
  })
  .transform((r) => ({
    kostenTotaal: r.kosten_totaal,
    kostenIntake: r.kosten_intake,
    gesprekken: r.gesprekken,
    leads: r.leads,
    klantenActief: r.klanten_actief,
    klantenTrial: r.klanten_trial,
    klantenMetGesprekken: r.klanten_met_gesprekken,
    dagremStand: r.dagrem_stand,
  }));
export type PlatformOverzicht = z.output<typeof overzichtRijSchema>;

export const trendRijSchema = z
  .object({
    dag: z.iso.date(),
    gesprekken: aantal,
    leads: aantal,
    kosten_intake: aantal,
    kosten_opvolgmail: aantal,
    kosten_belscript: aantal,
    kosten_totaal: aantal,
    weigeringen: aantal,
  })
  .transform((r) => ({
    dag: r.dag,
    gesprekken: r.gesprekken,
    leads: r.leads,
    kostenIntake: r.kosten_intake,
    kostenOpvolgmail: r.kosten_opvolgmail,
    kostenBelscript: r.kosten_belscript,
    kostenTotaal: r.kosten_totaal,
    weigeringen: r.weigeringen,
  }));
export type TrendDag = z.output<typeof trendRijSchema>;
