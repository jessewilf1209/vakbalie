-- Tests voor de leesfuncties van het admin-dashboard (PR C1).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(17);

-- Schone lei binnen deze transactie (seed-tenants weg; alles wordt teruggedraaid).
delete from public.tenants;

insert into auth.users (id, email, raw_app_meta_data, aud, role, last_sign_in_at)
values
  ('a0000000-0000-0000-0000-00000000000a', 'admin@test.invalid',
   '{"platform_admin":true}', 'authenticated', 'authenticated', null),
  ('b0000000-0000-0000-0000-00000000000b', 'hovenier@test.invalid',
   '{}', 'authenticated', 'authenticated', '2026-10-10 08:00:00+00');

insert into public.tenants (id, name, contact_email, status, widget_key)
values
  ('10000000-0000-0000-0000-000000000001', 'Tuin Een', 'een@test.invalid', 'active', 'wk_test_een_0000000001'),
  ('20000000-0000-0000-0000-000000000002', 'Tuin Twee', 'twee@test.invalid', 'trial', 'wk_test_twee_000000002'),
  ('30000000-0000-0000-0000-000000000003', 'Demo', 'demo@test.invalid', 'active', 'wk_test_demo_000000003');
insert into public.tenant_users (tenant_id, user_id)
values ('10000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b');

-- Tuin Een: twee gesprekken, één lead. Eén gesprek om 22:30 UTC op 14 oktober,
-- dat is 00:30 op 15 oktober in Amsterdam (CEST).
insert into public.gebruik_events (tenant_id, soort, created_at) values
  ('10000000-0000-0000-0000-000000000001', 'gesprek_gestart', '2026-10-14 22:30:00+00'),
  ('10000000-0000-0000-0000-000000000001', 'gesprek_gestart', '2026-10-15 10:00:00+00'),
  ('10000000-0000-0000-0000-000000000001', 'lead_aangemaakt', '2026-10-15 10:05:00+00'),
  ('10000000-0000-0000-0000-000000000001', 'rate_limit_geweigerd', '2026-10-15 11:00:00+00'),
  ('10000000-0000-0000-0000-000000000001', 'notificatiemail_verstuurd', '2026-10-15 10:05:01+00'),
  -- Buiten de periode: telt niet mee, maar wel voor "laatste gesprek".
  ('20000000-0000-0000-0000-000000000002', 'gesprek_gestart', '2026-09-01 10:00:00+00'),
  ('30000000-0000-0000-0000-000000000003', 'gesprek_gestart', '2026-10-15 10:00:00+00');

insert into public.llm_gebruik
  (tenant_id, bron, provider, model, input_tokens, output_tokens, kosten_eenheden, created_at)
values
  ('10000000-0000-0000-0000-000000000001', 'intake', 'bedrock', 'm', 2000, 200, 33, '2026-10-14 22:30:05+00'),
  ('10000000-0000-0000-0000-000000000001', 'intake', 'bedrock', 'm', 3000, 300, 50, '2026-10-15 10:00:05+00'),
  ('10000000-0000-0000-0000-000000000001', 'opvolgmail', 'bedrock', 'm', 1000, 400, 33, '2026-10-15 12:00:00+00'),
  ('20000000-0000-0000-0000-000000000002', 'intake', 'bedrock', 'm', 10, 10, 1, '2026-09-01 10:00:05+00'),
  ('30000000-0000-0000-0000-000000000003', 'intake', 'bedrock', 'm', 10, 10, 999, '2026-10-15 10:00:05+00');

create function pg_temp.als(p_sub uuid, p_aal text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_sub, 'role', 'authenticated', 'aal', p_aal)::text, true);
$$;

-- Periode: 14 en 15 oktober in Amsterdamse tijd.
\set van '''2026-10-14 00:00:00+02'''
\set tot '''2026-10-16 00:00:00+02'''

set local role authenticated;

-- Toegang ---------------------------------------------------------------------
select pg_temp.als('b0000000-0000-0000-0000-00000000000b', 'aal2');
select throws_ok(format('select * from admin_kosten_per_tenant(%L, %L)', :van, :tot),
  '42501', null, 'hovenier krijgt geen kosten per tenant');
select throws_ok(format('select * from admin_platform_overzicht(%L, %L)', :van, :tot),
  '42501', null, 'hovenier krijgt geen platformoverzicht');
select throws_ok(format('select * from admin_tenant_trend(%L, %L, %L)',
  '10000000-0000-0000-0000-000000000001', :van, :tot), '42501', null, 'hovenier krijgt geen trend');

select pg_temp.als('a0000000-0000-0000-0000-00000000000a', 'aal1');
select throws_ok(format('select * from admin_kosten_per_tenant(%L, %L)', :van, :tot),
  '42501', null, 'admin zonder MFA krijgt niets');

select throws_ok('select public.admin_vereist()', '42501', null,
  'interne hulpfunctie is niet aanroepbaar voor authenticated');

-- Cijfers ---------------------------------------------------------------------
select pg_temp.als('a0000000-0000-0000-0000-00000000000a', 'aal2');

select throws_ok(format('select * from admin_kosten_per_tenant(%L, %L)', :tot, :van),
  '22023', null, 'omgekeerde periode wordt geweigerd');

select results_eq(
  format($q$select naam, gesprekken, leads, kosten_intake, kosten_opvolgmail, kosten_totaal,
                   rate_limit_geweigerd, notificatiemails
            from admin_kosten_per_tenant(%L, %L, 'wk_test_demo_000000003')
            order by naam$q$, :van, :tot),
  $$values ('Tuin Een'::text, 2::bigint, 1::bigint, 83::bigint, 33::bigint, 116::bigint, 1::bigint, 1::bigint),
           ('Tuin Twee'::text, 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint)$$,
  'kosten en tellingen per klant, demo-tenant weggelaten');

select is(
  (select laatste_gesprek from admin_kosten_per_tenant(:van, :tot, 'wk_test_demo_000000003')
   where naam = 'Tuin Twee'),
  '2026-09-01 10:00:00+00'::timestamptz,
  'laatste gesprek kijkt buiten de periode');

select is(
  (select laatste_login from admin_kosten_per_tenant(:van, :tot) where naam = 'Tuin Een'),
  '2026-10-10 08:00:00+00'::timestamptz,
  'laatste login uit Supabase Auth');

select is(
  (select count(*)::int from admin_kosten_per_tenant(:van, :tot)),
  3, 'zonder uitsluiting staat de demo-tenant er wel bij');

select results_eq(
  format($q$select kosten_totaal, kosten_intake, gesprekken, leads, klanten_actief, klanten_trial,
                   klanten_met_gesprekken
            from admin_platform_overzicht(%L, %L, 'wk_test_demo_000000003')$q$, :van, :tot),
  $$values (116::bigint, 83::bigint, 2::bigint, 1::bigint, 1::bigint, 1::bigint, 1::bigint)$$,
  'platformoverzicht zonder demo-tenant');

-- Trend: Amsterdamse dagen ----------------------------------------------------
select results_eq(
  format($q$select dag, gesprekken, kosten_totaal
            from admin_tenant_trend('10000000-0000-0000-0000-000000000001', %L, %L)$q$, :van, :tot),
  $$values ('2026-10-14'::date, 0::bigint, 0::bigint),
           ('2026-10-15'::date, 2::bigint, 116::bigint)$$,
  'een gesprek om 00:30 Amsterdamse tijd valt op de nieuwe dag, en lege dagen staan erin');

select is(
  (select weigeringen from admin_tenant_trend('10000000-0000-0000-0000-000000000001', :van, :tot)
   where dag = '2026-10-15'),
  1::bigint, 'weigeringen per dag');

-- Geen inhoud: de functies geven alleen getallen, naam en status --------------
select is(
  (select count(*)::int from information_schema.routines r
   join information_schema.parameters p
     on p.specific_name = r.specific_name and p.parameter_mode = 'OUT'
   where r.routine_schema = 'public'
     and r.routine_name in ('admin_kosten_per_tenant', 'admin_platform_overzicht', 'admin_tenant_trend')
     and p.data_type in ('text', 'jsonb', 'json', 'character varying')
     and p.parameter_name not in ('naam', 'status')),
  0, 'geen tekstkolommen behalve naam en status');

-- anon kan niets aanroepen.
reset role;
set local role anon;
select throws_ok(format('select * from admin_kosten_per_tenant(%L, %L)', :van, :tot),
  '42501', null, 'anon kan admin_kosten_per_tenant niet aanroepen');
select throws_ok(format('select * from admin_platform_overzicht(%L, %L)', :van, :tot),
  '42501', null, 'anon kan admin_platform_overzicht niet aanroepen');
select throws_ok(format('select * from admin_tenant_trend(%L, %L, %L)',
  '10000000-0000-0000-0000-000000000001', :van, :tot), '42501', null, 'anon kan admin_tenant_trend niet aanroepen');

reset role;
select * from finish();
rollback;
