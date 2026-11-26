-- Vaste queries voor de meetlaag.
--
-- Bedoeld voor de SQL-editor van Supabase (alleen lezen), tot het
-- admin-dashboard er is. Bedragen: kosten_eenheden zijn tienduizendsten van
-- een dollar, dus / 10000.0 geeft dollars. Dagen en maanden in Amsterdamse
-- tijd, behalve query 3: de dagrem telt per UTC-dag.
--
-- AI-kosten zijn een berekening, geen factuur. Leg ze eens per maand naast de
-- AWS-rekening; wijkt het meer dan ongeveer 10% af, dan klopt een tarief in
-- LLM_PRIJS_INPUT_PER_MTOK of LLM_PRIJS_OUTPUT_PER_MTOK niet.

-- 1. Kosten en verbruik per klant, deze maand ---------------------------------
with periode as (
  select date_trunc('month', now() at time zone 'Europe/Amsterdam')
           at time zone 'Europe/Amsterdam' as van
),
ai as (
  select g.tenant_id,
         sum(g.kosten_eenheden) filter (where g.bron = 'intake')     as intake,
         sum(g.kosten_eenheden) filter (where g.bron = 'opvolgmail') as opvolgmail,
         sum(g.kosten_eenheden) filter (where g.bron = 'belscript')  as belscript,
         sum(g.kosten_eenheden)                                      as totaal,
         sum(g.input_tokens)  as input_tokens,
         sum(g.output_tokens) as output_tokens
  from public.llm_gebruik g, periode p
  where g.created_at >= p.van
  group by g.tenant_id
),
ev as (
  select e.tenant_id,
         count(*) filter (where e.soort = 'gesprek_gestart') as gesprekken,
         count(*) filter (where e.soort = 'lead_aangemaakt') as leads,
         count(*) filter (where e.soort in ('notificatiemail_verstuurd', 'opvolgmail_verstuurd')) as mails,
         count(*) filter (where e.soort in ('rate_limit_geweigerd', 'dagrem_geweigerd', 'afgerond_op_budget')) as weigeringen
  from public.gebruik_events e, periode p
  where e.created_at >= p.van
  group by e.tenant_id
)
select t.name,
       t.status,
       coalesce(ev.gesprekken, 0) as gesprekken,
       coalesce(ev.leads, 0)      as leads,
       round(100.0 * coalesce(ev.leads, 0) / nullif(ev.gesprekken, 0), 1) as conversie_pct,
       round(coalesce(ai.totaal, 0) / 10000.0, 4)     as ai_usd,
       round(coalesce(ai.intake, 0) / 10000.0, 4)     as intake_usd,
       round(coalesce(ai.opvolgmail, 0) / 10000.0, 4) as opvolgmail_usd,
       round(coalesce(ai.belscript, 0) / 10000.0, 4)  as belscript_usd,
       round(ai.intake / 10000.0 / nullif(ev.gesprekken, 0), 4) as intake_usd_per_gesprek,
       coalesce(ev.mails, 0)       as mails,
       coalesce(ev.weigeringen, 0) as weigeringen
from public.tenants t
left join ai on ai.tenant_id = t.id
left join ev on ev.tenant_id = t.id
order by ai_usd desc nulls last;

-- 2. Duurste gesprekken, laatste 30 dagen (uitschieters) ---------------------
select g.tenant_id,
       g.conversation_id,
       count(*)                                  as aanroepen,
       sum(g.input_tokens)                       as input_tokens,
       sum(g.output_tokens)                      as output_tokens,
       round(sum(g.kosten_eenheden) / 10000.0, 4) as usd
from public.llm_gebruik g
where g.bron = 'intake'
  and g.conversation_id is not null
  and g.created_at >= now() - interval '30 days'
group by g.tenant_id, g.conversation_id
order by usd desc
limit 20;

-- 3. Controle: som per UTC-dag tegenover de dagrem-teller ---------------------
-- Moet voor elke dag gelijk zijn. Kleine verschillen kunnen alleen ontstaan
-- als het boeken of het meten voor één aanroep mislukte (zie de Vercel-logs:
-- "dagbudget: kosten niet geboekt" of "meting: llm-gebruik niet vastgelegd").
-- Let op: rate_limits bewaart vensters maar 2 dagen, dus oudere dagen tonen leeg.
select d.dag,
       d.gemeten,
       r.teller as dagrem,
       d.gemeten - coalesce(r.teller, 0) as verschil
from (
  select date_trunc('day', created_at at time zone 'UTC') as dag,
         sum(kosten_eenheden) as gemeten
  from public.llm_gebruik
  group by 1
) d
left join public.rate_limits r
  on r.sleutel = 'llm-kosten:dag'
 and r.venster_start at time zone 'UTC' = d.dag
order by d.dag desc;

-- 4. Rooktest: bevat de meetlaag aantoonbaar geen inhoud? ---------------------
-- Toont de kolommen van beide tabellen; er hoort geen enkele vrije tekst- of
-- jsonb-kolom tussen te staan behalve de vaste codes (bron, provider, model,
-- soort), die door check-constraints begrensd zijn.
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in ('llm_gebruik', 'gebruik_events')
order by table_name, ordinal_position;

-- 5. Laatste rijen, ter controle na een testgesprek --------------------------
select * from public.llm_gebruik order by id desc limit 10;
select * from public.gebruik_events order by id desc limit 20;
