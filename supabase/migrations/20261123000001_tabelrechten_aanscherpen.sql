-- Migration: tabelrechten van anon en authenticated terug naar wat de app gebruikt
-- Audit 2026-11-23
--
-- In productie hadden anon en authenticated via de standaardrechten van
-- Supabase ALLE rechten (ook INSERT, UPDATE, DELETE en TRUNCATE) op de
-- tabellen hieronder. De eerdere grant-migrations (20260625000001,
-- 20261111000004) voegden alleen rechten toe en haalden die standaard niet
-- weg. RLS hield het meeste tegen, maar de "for all"-policies op
-- conversations en messages lieten elk tenantlid de gesprekshistorie van de
-- eigen leads wijzigen of aanvullen. Dat was het enige slot; dit maakt de
-- tabelrechten het tweede.
--
-- Wat de app met de ingelogde (authenticated) client doet, en dus houdt:
--   tenants          : SELECT; UPDATE op de vier instellingenkolommen
--   leads            : SELECT, DELETE (AVG-verwijderknop); UPDATE (status)
--   conversations    : SELECT (cijfers), DELETE (AVG-verwijderknop)
--   messages         : SELECT (leaddetail). Verwijderen gaat via de cascade
--                      vanaf conversations, daar is geen recht voor nodig.
--   lead_opvolgmails : SELECT, INSERT (verstuurde opvolgmail vastleggen)
-- tenant_users en rate_limits: niets. get_my_tenant_ids() is security
-- definer en leest tenant_users zelf; rate_limits loopt via de service-role.
-- anon (niet ingelogd) gebruikt geen enkele tabel rechtstreeks.
--
-- Let op: een tabelbrede revoke trekt ook de kolomrechten in, daarom worden
-- de kolom-grants hieronder opnieuw gezet.

revoke all on
  public.tenants,
  public.tenant_users,
  public.leads,
  public.conversations,
  public.messages,
  public.lead_opvolgmails,
  public.rate_limits
from anon, authenticated;

grant select on public.tenants to authenticated;
grant update (widget_kleur, welkomsttekst, privacy_url, notification_email)
  on public.tenants to authenticated;

grant select, delete on public.leads to authenticated;
grant update (status) on public.leads to authenticated;

grant select, delete on public.conversations to authenticated;

grant select on public.messages to authenticated;

grant select, insert on public.lead_opvolgmails to authenticated;

-- Nieuwe tabellen krijgen voortaan geen rechten meer voor anon en
-- authenticated vanzelf; elke migration grant expliciet wat nodig is.
alter default privileges in schema public revoke all on tables from anon, authenticated;
