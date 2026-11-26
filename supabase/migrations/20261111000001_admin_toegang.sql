-- Migration: platform-admin (alleen Vakbalie zelf) en het auditlog
-- 2026-11-11
--
-- Een admin-account kan straks de cijfers van alle klanten zien. Dat maakt
-- het het meest waardevolle doelwit van het platform. Deze migration legt
-- het fundament vóór er één scherm bestaat:
--
--   is_platform_admin()  de enige bron van waarheid voor admin-rechten in
--                        SQL. Elke admin-functie (PR C1) begint ermee.
--   admin_audit          append-only log van beheeracties (PR E1), zonder
--                        inhoud.
--
-- Admin is wie aan ALLE drie de voorwaarden voldoet:
--   1. app_metadata.platform_admin = true. Live gelezen uit auth.users, niet
--      uit het JWT, zodat intrekken direct werkt en niet pas na een
--      token-refresh. app_metadata kan een gebruiker niet zelf wijzigen;
--      alleen de service-role (scripts/zet-platform-admin.mjs).
--   2. aal2 in het JWT: de sessie is met een tweede factor (TOTP)
--      bevestigd. Het JWT is door PostgREST op de handtekening gecontroleerd.
--   3. Geen lid van een tenant. Het admin-account staat los van elke klant,
--      zodat een fout in de tenant-autorisatie nooit admin-rechten oplevert,
--      en omgekeerd.

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
    and exists (
      select 1
      from auth.users u
      where u.id = auth.uid()
        and u.raw_app_meta_data -> 'platform_admin' = 'true'::jsonb
    )
    and not exists (
      select 1 from public.tenant_users tu where tu.user_id = auth.uid()
    );
$$;

comment on function public.is_platform_admin() is
  'True alleen voor een platform-admin met MFA (aal2) die geen tenantlid is.';

revoke execute on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated, service_role;

-- ------------------------------------------------------------------
-- admin_audit
-- ------------------------------------------------------------------

create table public.admin_audit (
  id             bigint      generated always as identity primary key,
  -- Bewust geen foreign keys: het log moet een verwijderde gebruiker of
  -- tenant overleven, anders verdwijnt juist het spoor van wat er gebeurde.
  admin_id       uuid        not null,
  actie          text        not null check (actie in (
                   'tenant_aangemaakt',
                   'domeinen_gewijzigd',
                   'status_gewijzigd',
                   'gebruiker_toegevoegd',
                   'instellingen_gewijzigd'
                 )),
  doel_tenant_id uuid        null,
  created_at     timestamptz not null default now()
);

comment on table public.admin_audit is
  'Beheeracties van de platform-admin. Alleen wie, wat, welke tenant en wanneer; nooit inhoud. Append-only.';

create index idx_admin_audit_tijd on public.admin_audit(created_at);
create index idx_admin_audit_tenant on public.admin_audit(doel_tenant_id, created_at);

alter table public.admin_audit enable row level security;

revoke all on public.admin_audit from public, anon, authenticated;
-- Append-only, ook voor de service-role: een auditlog dat je kunt wijzigen
-- of wissen, bewijst niets.
revoke update, delete, truncate on public.admin_audit from service_role;
grant select, insert on public.admin_audit to service_role;
