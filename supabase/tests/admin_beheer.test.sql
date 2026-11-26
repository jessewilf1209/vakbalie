-- Tests voor het tenantbeheer vanuit /admin (PR E1).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(16);

delete from public.tenants;
insert into auth.users (id, email, raw_app_meta_data, aud, role)
values
  ('a0000000-0000-0000-0000-00000000000a', 'admin@test.invalid', '{"platform_admin":true}', 'authenticated', 'authenticated'),
  ('b0000000-0000-0000-0000-00000000000b', 'hovenier@test.invalid', '{}', 'authenticated', 'authenticated');
insert into public.tenants (id, name, contact_email, status)
values ('10000000-0000-0000-0000-000000000001', 'Tuin Een', 'een@test.invalid', 'trial');
insert into public.tenant_users (tenant_id, user_id, role)
values ('10000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b', 'owner');

create function pg_temp.als(p_sub uuid, p_aal text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_sub, 'role', 'authenticated', 'aal', p_aal)::text, true);
$$;

-- Origins -----------------------------------------------------------------------
select ok(origins_geldig(array['https://www.tuin.nl', 'https://tuin.nl', 'http://localhost:8080']),
  'https en lokale http zijn geldig');
select ok(not origins_geldig(array['http://tuin.nl']), 'http op een echt domein niet');
select ok(not origins_geldig(array['https://tuin.nl/pad']), 'geen paden');
select ok(not origins_geldig(array['https://*.tuin.nl']), 'geen wildcards');
select ok(not origins_geldig(array['https://tuin.nl; script-src *']), 'geen CSP-injectie');

set local role authenticated;

-- Een hovenier kan niets beheren, ook niet bij de eigen tenant.
select pg_temp.als('b0000000-0000-0000-0000-00000000000b', 'aal2');
select throws_ok($$select admin_tenant_status_zetten('10000000-0000-0000-0000-000000000001', 'active')$$,
  '42501', null, 'hovenier kan de status niet wijzigen');
select throws_ok($$select admin_tenant_domeinen_zetten('10000000-0000-0000-0000-000000000001', array['https://kwaad.nl'])$$,
  '42501', null, 'hovenier kan de domeinen niet wijzigen');
select throws_ok($$select * from admin_tenant_gebruikers('10000000-0000-0000-0000-000000000001')$$,
  '42501', null, 'hovenier kan de gebruikerslijst niet lezen');
select throws_ok($$select admin_audit_schrijf('status_gewijzigd', '10000000-0000-0000-0000-000000000001')$$,
  '42501', null, 'auditregel schrijven kan alleen via de beheerfuncties');

-- Admin zonder MFA ook niet.
select pg_temp.als('a0000000-0000-0000-0000-00000000000a', 'aal1');
select throws_ok($$select admin_tenant_status_zetten('10000000-0000-0000-0000-000000000001', 'inactive')$$,
  '42501', null, 'admin zonder MFA kan de noodrem niet gebruiken');

-- Admin met MFA ----------------------------------------------------------------
select pg_temp.als('a0000000-0000-0000-0000-00000000000a', 'aal2');
select lives_ok($$select admin_tenant_status_zetten('10000000-0000-0000-0000-000000000001', 'inactive')$$,
  'admin zet de noodrem');
select lives_ok($$select admin_tenant_domeinen_zetten('10000000-0000-0000-0000-000000000001', array['https://www.tuin.nl', 'https://tuin.nl'])$$,
  'admin zet geldige domeinen');
select throws_ok($$select admin_tenant_domeinen_zetten('10000000-0000-0000-0000-000000000001', array['https://tuin.nl/pad'])$$,
  '22023', null, 'ongeldige domeinen geweigerd, ook als de app iets mist');
select throws_ok($$select admin_tenant_instellingen_zetten('10000000-0000-0000-0000-000000000001', '<script>', 'een@test.invalid', null, '#1f6f43', null, null)$$,
  '23514', null, 'geen HTML in de naam');

select results_eq(
  $$select actie, bron from admin_audit_lijst('10000000-0000-0000-0000-000000000001') order by actie$$,
  $$values ('domeinen_gewijzigd'::text, 'dashboard'::text), ('status_gewijzigd', 'dashboard')$$,
  'elke geslaagde actie heeft precies één auditregel, een mislukte geen');

reset role;
select is(
  (select status || ' ' || array_to_string(allowed_origins, ',') from public.tenants
   where id = '10000000-0000-0000-0000-000000000001'),
  'inactive https://www.tuin.nl,https://tuin.nl', 'status en domeinen staan in de database');

select * from finish();
rollback;
