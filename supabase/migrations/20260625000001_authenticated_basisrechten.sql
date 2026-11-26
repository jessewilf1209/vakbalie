-- Migration: basisrechten voor authenticated op dashboard-tabellen
-- Bugfix | 2026-06-25
--
-- De initiële migration (20260610000001) maakt RLS-policies aan voor de
-- 'authenticated'-rol maar vergat de bijbehorende tabel-GRANTs. Postgres
-- weigert een query al vóórdat RLS loopt als de rol geen privilege heeft
-- (42501). Hierdoor zag het dashboard altijd "niet gekoppeld aan een bedrijf".
--
-- Alleen de rechten die het dashboard daadwerkelijk nodig heeft:
--   tenants      : SELECT (naam/instellingen tonen); UPDATE via kolom-grant
--                  uit 20260612000001 (al geregeld).
--   leads        : SELECT (overzicht/detail), UPDATE (status wijzigen),
--                  DELETE (AVG-verwijderknop).
--   conversations: SELECT (statistieken en gesprekshistorie).
--   messages     : SELECT (berichten in leaddetail).
--
-- Geen INSERT nodig voor 'authenticated': widget schrijft via service_role.
-- tenant_users valt weg: get_my_tenant_ids() is security definer en leest
-- die tabel zelf met verhoogde rechten.

grant select on public.tenants to authenticated;

grant select, update, delete on public.leads to authenticated;

grant select on public.conversations to authenticated;

grant select on public.messages to authenticated;
