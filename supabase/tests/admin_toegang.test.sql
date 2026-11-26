-- Tests voor de platform-admin: `pnpm exec supabase test db`.
-- Draait in één transactie die aan het eind wordt teruggedraaid.

begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(12);

-- Testgebruikers --------------------------------------------------------------
insert into auth.users (id, email, raw_app_meta_data, aud, role)
values
  ('a0000000-0000-0000-0000-00000000000a', 'admin@test.invalid',
   '{"provider":"email","platform_admin":true}', 'authenticated', 'authenticated'),
  ('b0000000-0000-0000-0000-00000000000b', 'hovenier@test.invalid',
   '{"provider":"email"}', 'authenticated', 'authenticated'),
  ('c0000000-0000-0000-0000-00000000000c', 'admin-en-lid@test.invalid',
   '{"provider":"email","platform_admin":true}', 'authenticated', 'authenticated'),
  ('d0000000-0000-0000-0000-00000000000d', 'nep-admin@test.invalid',
   '{"provider":"email","platform_admin":"true"}', 'authenticated', 'authenticated');

insert into public.tenants (id, name, contact_email)
values ('e0000000-0000-0000-0000-00000000000e', 'Testtenant', 'tenant@test.invalid');
insert into public.tenant_users (tenant_id, user_id)
values ('e0000000-0000-0000-0000-00000000000e', 'b0000000-0000-0000-0000-00000000000b'),
       ('e0000000-0000-0000-0000-00000000000e', 'c0000000-0000-0000-0000-00000000000c');

-- Zet de JWT-claims zoals PostgREST dat na een gecontroleerde handtekening doet.
create function pg_temp.als(p_sub uuid, p_aal text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_sub, 'role', 'authenticated', 'aal', p_aal)::text, true);
$$;

set local role authenticated;

-- is_platform_admin -----------------------------------------------------------
select pg_temp.als('a0000000-0000-0000-0000-00000000000a', 'aal2');
select ok(public.is_platform_admin(), 'admin met MFA (aal2) is admin');

select pg_temp.als('a0000000-0000-0000-0000-00000000000a', 'aal1');
select ok(not public.is_platform_admin(), 'admin zonder MFA (aal1) is geen admin');

select pg_temp.als('b0000000-0000-0000-0000-00000000000b', 'aal2');
select ok(not public.is_platform_admin(), 'hovenier met aal2 is geen admin');

select pg_temp.als('c0000000-0000-0000-0000-00000000000c', 'aal2');
select ok(not public.is_platform_admin(), 'admin-vlag op een tenantlid geeft geen adminrechten');

select pg_temp.als('d0000000-0000-0000-0000-00000000000d', 'aal2');
select ok(not public.is_platform_admin(), 'de vlag moet een echte boolean zijn, geen tekst');

-- Intrekken werkt direct, zonder nieuw JWT.
reset role;
update auth.users set raw_app_meta_data = '{"provider":"email"}'
  where id = 'a0000000-0000-0000-0000-00000000000a';
set local role authenticated;
select pg_temp.als('a0000000-0000-0000-0000-00000000000a', 'aal2');
select ok(not public.is_platform_admin(), 'ingetrokken vlag werkt direct, ook met een oud aal2-token');

-- anon mag de functie niet eens aanroepen.
reset role;
set local role anon;
select throws_ok('select public.is_platform_admin()', '42501', null, 'anon kan is_platform_admin niet aanroepen');

-- Meetlaag en auditlog: onleesbaar voor de rollen van de browser -------------
reset role;
set local role authenticated;
select pg_temp.als('b0000000-0000-0000-0000-00000000000b', 'aal2');
select throws_ok('select count(*) from public.llm_gebruik', '42501', null,
  'hovenier kan llm_gebruik niet lezen');
select throws_ok('select count(*) from public.gebruik_events', '42501', null,
  'hovenier kan gebruik_events niet lezen');
select throws_ok('select count(*) from public.admin_audit', '42501', null,
  'hovenier kan admin_audit niet lezen');

-- Auditlog is append-only, ook voor de service-role.
reset role;
set local role service_role;
insert into public.admin_audit (admin_id, actie, doel_tenant_id)
values ('a0000000-0000-0000-0000-00000000000a', 'status_gewijzigd', 'e0000000-0000-0000-0000-00000000000e');
select throws_ok('update public.admin_audit set actie = ''tenant_aangemaakt''', '42501', null,
  'service-role kan het auditlog niet wijzigen');
select throws_ok('delete from public.admin_audit', '42501', null,
  'service-role kan het auditlog niet wissen');

reset role;
select * from finish();
rollback;
