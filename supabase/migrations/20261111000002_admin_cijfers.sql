-- Migration: leesfuncties met de cijfers voor het admin-dashboard
-- 2026-11-11
--
-- Het admin-dashboard leest uitsluitend via deze functies, met de sessie van
-- de admin (geen service-role). Elke functie:
--   - begint met de admincheck (is_platform_admin: vlag, aal2, geen tenantlid);
--   - geeft alleen getallen, tenantnaam en status terug, nooit leadinhoud;
--   - is security definer, want de meettabellen hebben bewust geen grants
--     voor authenticated (20261018000001).
--
-- Tijd: de periode komt binnen als [p_van, p_tot) in timestamptz; de app
-- rekent de grenzen uit in Europe/Amsterdam. De trend per dag groepeert ook
-- in Amsterdamse tijd, zodat een avondgesprek op de juiste dag valt.
--
-- De demo-tenant telt nergens mee: de app geeft zijn widget-key mee
-- (NEXT_PUBLIC_DEMO_TENANT_KEY), en die tenant wordt weggefilterd.

-- ------------------------------------------------------------------
-- Interne hulpfuncties (niet aanroepbaar voor de browser-rollen)
-- ------------------------------------------------------------------

create or replace function public.admin_vereist()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'geen toegang' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.admin_periode_geldig(p_van timestamptz, p_tot timestamptz)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_van is null or p_tot is null or p_tot <= p_van then
    raise exception 'ongeldige periode' using errcode = '22023';
  end if;
  -- Ruim boven een jaar plus een maand; voorkomt dure scans op verzoek.
  if p_tot - p_van > interval '400 days' then
    raise exception 'periode te lang' using errcode = '22023';
  end if;
end;
$$;

revoke execute on function public.admin_vereist() from public, anon, authenticated;
revoke execute on function public.admin_periode_geldig(timestamptz, timestamptz) from public, anon, authenticated;

-- ------------------------------------------------------------------
-- Kosten en verbruik per klant
-- ------------------------------------------------------------------

create or replace function public.admin_kosten_per_tenant(
  p_van timestamptz,
  p_tot timestamptz,
  p_uitgesloten_widget_key text default null
)
returns table (
  tenant_id            uuid,
  naam                 text,
  status               text,
  gesprekken           bigint,
  leads                bigint,
  fotos                bigint,
  aanroepen            bigint,
  input_tokens         bigint,
  output_tokens        bigint,
  kosten_intake        bigint,
  kosten_opvolgmail    bigint,
  kosten_belscript     bigint,
  kosten_totaal        bigint,
  notificatiemails     bigint,
  opvolgmails          bigint,
  afgerond_op_budget   bigint,
  rate_limit_geweigerd bigint,
  dagrem_geweigerd     bigint,
  laatste_gesprek      timestamptz,
  laatste_login        timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public.admin_vereist();
  perform public.admin_periode_geldig(p_van, p_tot);

  return query
  with t as (
    select x.id, x.name, x.status
    from public.tenants x
    where p_uitgesloten_widget_key is null or x.widget_key <> p_uitgesloten_widget_key
  ),
  ai as (
    select g.tenant_id,
           count(*)                                                    as aanroepen,
           sum(g.input_tokens)                                         as input_tokens,
           sum(g.output_tokens)                                        as output_tokens,
           sum(g.kosten_eenheden) filter (where g.bron = 'intake')     as intake,
           sum(g.kosten_eenheden) filter (where g.bron = 'opvolgmail') as opvolgmail,
           sum(g.kosten_eenheden) filter (where g.bron = 'belscript')  as belscript,
           sum(g.kosten_eenheden)                                      as totaal
    from public.llm_gebruik g
    where g.created_at >= p_van and g.created_at < p_tot
    group by g.tenant_id
  ),
  ev as (
    select e.tenant_id,
           count(*) filter (where e.soort = 'gesprek_gestart')           as gesprekken,
           count(*) filter (where e.soort = 'lead_aangemaakt')           as leads,
           count(*) filter (where e.soort = 'foto_geupload')             as fotos,
           count(*) filter (where e.soort = 'notificatiemail_verstuurd') as notificatiemails,
           count(*) filter (where e.soort = 'opvolgmail_verstuurd')      as opvolgmails,
           count(*) filter (where e.soort = 'afgerond_op_budget')        as afgerond_op_budget,
           count(*) filter (where e.soort = 'rate_limit_geweigerd')      as rate_limit_geweigerd,
           count(*) filter (where e.soort = 'dagrem_geweigerd')          as dagrem_geweigerd
    from public.gebruik_events e
    where e.created_at >= p_van and e.created_at < p_tot
    group by e.tenant_id
  ),
  -- Buiten de periode: het signaal "geen gesprekken in 7 dagen" kijkt
  -- naar het laatste gesprek ooit.
  lg as (
    select e.tenant_id, max(e.created_at) as laatste
    from public.gebruik_events e
    where e.soort = 'gesprek_gestart'
    group by e.tenant_id
  ),
  ll as (
    select tu.tenant_id, max(u.last_sign_in_at) as laatste
    from public.tenant_users tu
    join auth.users u on u.id = tu.user_id
    group by tu.tenant_id
  )
  select t.id,
         t.name,
         t.status,
         coalesce(ev.gesprekken, 0),
         coalesce(ev.leads, 0),
         coalesce(ev.fotos, 0),
         coalesce(ai.aanroepen, 0),
         coalesce(ai.input_tokens, 0)::bigint,
         coalesce(ai.output_tokens, 0)::bigint,
         coalesce(ai.intake, 0)::bigint,
         coalesce(ai.opvolgmail, 0)::bigint,
         coalesce(ai.belscript, 0)::bigint,
         coalesce(ai.totaal, 0)::bigint,
         coalesce(ev.notificatiemails, 0),
         coalesce(ev.opvolgmails, 0),
         coalesce(ev.afgerond_op_budget, 0),
         coalesce(ev.rate_limit_geweigerd, 0),
         coalesce(ev.dagrem_geweigerd, 0),
         lg.laatste,
         ll.laatste
  from t
  left join ai on ai.tenant_id = t.id
  left join ev on ev.tenant_id = t.id
  left join lg on lg.tenant_id = t.id
  left join ll on ll.tenant_id = t.id
  order by coalesce(ai.totaal, 0) desc, t.name;
end;
$$;

-- ------------------------------------------------------------------
-- Platformoverzicht
-- ------------------------------------------------------------------

create or replace function public.admin_platform_overzicht(
  p_van timestamptz,
  p_tot timestamptz,
  p_uitgesloten_widget_key text default null
)
returns table (
  kosten_totaal           bigint,
  kosten_intake           bigint,
  gesprekken              bigint,
  leads                   bigint,
  klanten_actief          bigint,
  klanten_trial           bigint,
  klanten_met_gesprekken  bigint,
  -- Stand van de dagrem vandaag (UTC-dag, zoals de rem telt), in
  -- tienduizendsten van een dollar. Het plafond staat in de app-config.
  dagrem_stand            bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public.admin_vereist();
  perform public.admin_periode_geldig(p_van, p_tot);

  return query
  with t as (
    select x.id, x.status
    from public.tenants x
    where p_uitgesloten_widget_key is null or x.widget_key <> p_uitgesloten_widget_key
  ),
  ai as (
    select coalesce(sum(g.kosten_eenheden), 0)::bigint                                as totaal,
           coalesce(sum(g.kosten_eenheden) filter (where g.bron = 'intake'), 0)::bigint as intake
    from public.llm_gebruik g
    join t on t.id = g.tenant_id
    where g.created_at >= p_van and g.created_at < p_tot
  ),
  ev as (
    select count(*) filter (where e.soort = 'gesprek_gestart')                    as gesprekken,
           count(*) filter (where e.soort = 'lead_aangemaakt')                    as leads,
           count(distinct e.tenant_id) filter (where e.soort = 'gesprek_gestart') as met_gesprekken
    from public.gebruik_events e
    join t on t.id = e.tenant_id
    where e.created_at >= p_van and e.created_at < p_tot
  )
  select ai.totaal,
         ai.intake,
         ev.gesprekken,
         ev.leads,
         (select count(*) from t where t.status = 'active'),
         (select count(*) from t where t.status = 'trial'),
         ev.met_gesprekken,
         coalesce((
           select r.teller::bigint
           from public.rate_limits r
           where r.sleutel = 'llm-kosten:dag'
             and r.venster_start = to_timestamp(floor(extract(epoch from now()) / 86400) * 86400)
         ), 0)
  from ai, ev;
end;
$$;

-- ------------------------------------------------------------------
-- Trend per dag voor één klant
-- ------------------------------------------------------------------

create or replace function public.admin_tenant_trend(
  p_tenant_id uuid,
  p_van timestamptz,
  p_tot timestamptz
)
returns table (
  dag                  date,
  gesprekken           bigint,
  leads                bigint,
  kosten_intake        bigint,
  kosten_opvolgmail    bigint,
  kosten_belscript     bigint,
  kosten_totaal        bigint,
  weigeringen          bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public.admin_vereist();
  perform public.admin_periode_geldig(p_van, p_tot);

  return query
  with dagen as (
    select d::date as dag
    from generate_series(
      (p_van at time zone 'Europe/Amsterdam')::date,
      ((p_tot - interval '1 microsecond') at time zone 'Europe/Amsterdam')::date,
      interval '1 day'
    ) as d
  ),
  ai as (
    select (g.created_at at time zone 'Europe/Amsterdam')::date                 as dag,
           sum(g.kosten_eenheden) filter (where g.bron = 'intake')     as intake,
           sum(g.kosten_eenheden) filter (where g.bron = 'opvolgmail') as opvolgmail,
           sum(g.kosten_eenheden) filter (where g.bron = 'belscript')  as belscript,
           sum(g.kosten_eenheden)                                      as totaal
    from public.llm_gebruik g
    where g.tenant_id = p_tenant_id and g.created_at >= p_van and g.created_at < p_tot
    group by 1
  ),
  ev as (
    select (e.created_at at time zone 'Europe/Amsterdam')::date as dag,
           count(*) filter (where e.soort = 'gesprek_gestart') as gesprekken,
           count(*) filter (where e.soort = 'lead_aangemaakt') as leads,
           count(*) filter (where e.soort in
             ('afgerond_op_budget', 'rate_limit_geweigerd', 'dagrem_geweigerd')) as weigeringen
    from public.gebruik_events e
    where e.tenant_id = p_tenant_id and e.created_at >= p_van and e.created_at < p_tot
    group by 1
  )
  select dagen.dag,
         coalesce(ev.gesprekken, 0),
         coalesce(ev.leads, 0),
         coalesce(ai.intake, 0)::bigint,
         coalesce(ai.opvolgmail, 0)::bigint,
         coalesce(ai.belscript, 0)::bigint,
         coalesce(ai.totaal, 0)::bigint,
         coalesce(ev.weigeringen, 0)
  from dagen
  left join ai on ai.dag = dagen.dag
  left join ev on ev.dag = dagen.dag
  order by dagen.dag;
end;
$$;

-- ------------------------------------------------------------------
-- Rechten: alleen authenticated (de functie controleert zelf op admin)
-- ------------------------------------------------------------------

revoke execute on function public.admin_kosten_per_tenant(timestamptz, timestamptz, text) from public, anon;
revoke execute on function public.admin_platform_overzicht(timestamptz, timestamptz, text) from public, anon;
revoke execute on function public.admin_tenant_trend(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_kosten_per_tenant(timestamptz, timestamptz, text) to authenticated;
grant execute on function public.admin_platform_overzicht(timestamptz, timestamptz, text) to authenticated;
grant execute on function public.admin_tenant_trend(uuid, timestamptz, timestamptz) to authenticated;
