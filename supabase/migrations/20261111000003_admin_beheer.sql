-- Migration: tenantbeheer vanuit het admin-dashboard
-- 2026-11-11
--
-- Bijwerken van een bestaande klant (status, domeinen, instellingen) gaat
-- via functies met de admin-sessie: elke functie controleert zelf op admin
-- en schrijft de auditregel in dezelfde transactie. Geen service-role nodig.
--
-- Aanmaken van een klant en gebruikers uitnodigen vraagt de Auth Admin API
-- en loopt dus via de service-role (src/lib/beheer, gedeeld met
-- scripts/maak-tenant.mjs). Die schrijft de auditregel zelf.
--
-- Bewust geen functie om een klant te verwijderen: dat raakt alle
-- leads, foto's en gebruikers in één keer en blijft een script met droogloop.

-- ------------------------------------------------------------------
-- Auditlog: ook acties vanuit het script vastleggen
-- ------------------------------------------------------------------

-- Het script draait met de service-role, zonder ingelogde admin.
alter table public.admin_audit alter column admin_id drop not null;
alter table public.admin_audit
  add column bron text not null default 'dashboard' check (bron in ('dashboard', 'script'));
alter table public.admin_audit
  add constraint admin_audit_dashboard_heeft_admin
  check (bron = 'script' or admin_id is not null);

-- ------------------------------------------------------------------
-- Tweede laag onder de validatie in de app
-- ------------------------------------------------------------------

-- Zelfde regels als normaliseerOrigins() in src/lib/beheer: alleen een
-- schone origin, https, of http op localhost voor lokale tests.
create or replace function public.origins_geldig(p_origins text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(cardinality(p_origins), 0) <= 10
     and not exists (
       select 1
       from unnest(p_origins) as o
       where o !~ '^https://[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:[0-9]{1,5})?$'
         and o !~ '^http://(localhost|127\.0\.0\.1)(:[0-9]{1,5})?$'
     );
$$;

-- NOT VALID: geldt voor elke nieuwe schrijfactie, maar breekt de migration
-- niet als een bestaande rij er (nog) niet aan voldoet.
alter table public.tenants
  add constraint tenants_allowed_origins_geldig check (public.origins_geldig(allowed_origins)) not valid;

-- De naam komt in mails en in de widget; geen HTML-tekens.
alter table public.tenants
  add constraint tenants_naam_geldig
  check (char_length(btrim(name)) between 1 and 120 and name !~ '[<>]') not valid;

-- ------------------------------------------------------------------
-- Lezen
-- ------------------------------------------------------------------

create or replace function public.admin_tenant_detail(p_tenant_id uuid)
returns table (
  tenant_id          uuid,
  naam               text,
  status             text,
  contact_email      text,
  notification_email text,
  allowed_origins    text[],
  widget_key         text,
  widget_kleur       text,
  welkomsttekst      text,
  privacy_url        text,
  created_at         timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public.admin_vereist();
  return query
  select t.id, t.name, t.status, t.contact_email, t.notification_email, t.allowed_origins,
         t.widget_key, t.widget_kleur, t.welkomsttekst, t.privacy_url, t.created_at
  from public.tenants t
  where t.id = p_tenant_id;
end;
$$;

-- Accounts van de hovenier (bedrijfsaccounts, geen aanvragers).
create or replace function public.admin_tenant_gebruikers(p_tenant_id uuid)
returns table (
  user_id       uuid,
  email         text,
  rol           text,
  laatste_login timestamptz,
  bevestigd     boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public.admin_vereist();
  return query
  select u.id, u.email::text, tu.role, u.last_sign_in_at, u.email_confirmed_at is not null
  from public.tenant_users tu
  join auth.users u on u.id = tu.user_id
  where tu.tenant_id = p_tenant_id
  order by tu.created_at;
end;
$$;

create or replace function public.admin_audit_lijst(p_tenant_id uuid)
returns table (actie text, bron text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public.admin_vereist();
  return query
  select a.actie, a.bron, a.created_at
  from public.admin_audit a
  where a.doel_tenant_id = p_tenant_id
  order by a.created_at desc
  limit 50;
end;
$$;

-- ------------------------------------------------------------------
-- Schrijven (elk met een auditregel in dezelfde transactie)
-- ------------------------------------------------------------------

create or replace function public.admin_audit_schrijf(p_actie text, p_tenant_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.admin_audit (admin_id, actie, doel_tenant_id, bron)
  values (auth.uid(), p_actie, p_tenant_id, 'dashboard');
$$;
revoke execute on function public.admin_audit_schrijf(text, uuid) from public, anon, authenticated;

-- Status: 'inactive' is de noodrem per klant; de widget stopt direct.
create or replace function public.admin_tenant_status_zetten(p_tenant_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.admin_vereist();
  if p_status not in ('trial', 'active', 'inactive') then
    raise exception 'ongeldige status' using errcode = '22023';
  end if;
  update public.tenants set status = p_status where id = p_tenant_id;
  if not found then
    raise exception 'tenant niet gevonden' using errcode = 'P0002';
  end if;
  perform public.admin_audit_schrijf('status_gewijzigd', p_tenant_id);
end;
$$;

create or replace function public.admin_tenant_domeinen_zetten(p_tenant_id uuid, p_origins text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.admin_vereist();
  if not public.origins_geldig(p_origins) then
    raise exception 'ongeldige origins' using errcode = '22023';
  end if;
  update public.tenants set allowed_origins = coalesce(p_origins, '{}') where id = p_tenant_id;
  if not found then
    raise exception 'tenant niet gevonden' using errcode = 'P0002';
  end if;
  perform public.admin_audit_schrijf('domeinen_gewijzigd', p_tenant_id);
end;
$$;

create or replace function public.admin_tenant_instellingen_zetten(
  p_tenant_id uuid,
  p_naam text,
  p_contact_email text,
  p_notification_email text,
  p_widget_kleur text,
  p_welkomsttekst text,
  p_privacy_url text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.admin_vereist();
  -- De bestaande kolom-checks (kleur, lengtes, url) en de naamcheck hierboven
  -- vangen wat de Zod-validatie in de app ooit zou missen.
  update public.tenants
  set name = btrim(p_naam),
      contact_email = p_contact_email,
      notification_email = p_notification_email,
      widget_kleur = p_widget_kleur,
      welkomsttekst = p_welkomsttekst,
      privacy_url = p_privacy_url
  where id = p_tenant_id;
  if not found then
    raise exception 'tenant niet gevonden' using errcode = 'P0002';
  end if;
  perform public.admin_audit_schrijf('instellingen_gewijzigd', p_tenant_id);
end;
$$;

-- ------------------------------------------------------------------
-- Rechten
-- ------------------------------------------------------------------

revoke execute on function public.origins_geldig(text[]) from public, anon;
grant execute on function public.origins_geldig(text[]) to authenticated, service_role;

revoke execute on function public.admin_tenant_detail(uuid) from public, anon;
revoke execute on function public.admin_tenant_gebruikers(uuid) from public, anon;
revoke execute on function public.admin_audit_lijst(uuid) from public, anon;
revoke execute on function public.admin_tenant_status_zetten(uuid, text) from public, anon;
revoke execute on function public.admin_tenant_domeinen_zetten(uuid, text[]) from public, anon;
revoke execute on function public.admin_tenant_instellingen_zetten(uuid, text, text, text, text, text, text) from public, anon;

grant execute on function public.admin_tenant_detail(uuid) to authenticated;
grant execute on function public.admin_tenant_gebruikers(uuid) to authenticated;
grant execute on function public.admin_audit_lijst(uuid) to authenticated;
grant execute on function public.admin_tenant_status_zetten(uuid, text) to authenticated;
grant execute on function public.admin_tenant_domeinen_zetten(uuid, text[]) to authenticated;
grant execute on function public.admin_tenant_instellingen_zetten(uuid, text, text, text, text, text, text) to authenticated;
