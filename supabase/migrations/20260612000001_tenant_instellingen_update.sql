-- Migration: Tenant-owners mogen hun eigen instellingen wijzigen
-- Fase 2, Stap 5 | 2026-06-12
--
-- Twee lagen, beide in de database:
--   1. RLS-policy: alleen owners van de tenant mogen updaten (rij-grens).
--   2. Kolom-grants: alleen de instellingen-kolommen zijn updatebaar
--      (kolom-grens). widget_key, allowed_origins, status en name blijven
--      daarmee onaantastbaar via de anon-client — ook met geldige sessie.
--
-- De service-role behoudt volledige rechten (widget-API, beheer).

-- Helper: tenants waar de ingelogde gebruiker owner van is.
create or replace function public.get_my_owner_tenant_ids()
returns setof uuid
language sql
security definer
stable
as $$
  select tenant_id
  from public.tenant_users
  where user_id = auth.uid() and role = 'owner'
$$;

create policy "Tenant owners can update settings"
  on public.tenants for update
  to authenticated
  using (id in (select public.get_my_owner_tenant_ids()))
  with check (id in (select public.get_my_owner_tenant_ids()));

-- Kolom-grens: standaard-grants vervangen door een expliciete kolomlijst.
revoke update on table public.tenants from anon, authenticated;
grant update (widget_kleur, welkomsttekst, privacy_url, notification_email)
  on table public.tenants
  to authenticated;
