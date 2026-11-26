-- Migration: basisrechten voor service_role op het public-schema
-- Bugfix | 2026-06-19
--
-- RLS-bypass (de `bypassrls`-attribuut van service_role) en tabel-/functie-
-- GRANTs zijn twee aparte mechanismen in Postgres. De eerdere migrations
-- gingen ervan uit dat de service-role key altijd toegang heeft (zie commentaar in 20260610000001), maar zonder expliciete GRANT
-- weigert Postgres de query al vóórdat RLS in beeld komt (42501
-- insufficient_privilege). Lokaal ontbraken deze grants, waardoor o.a.
-- de tenant-lookup en de rate-limit-RPC faalden.
--
-- Alleen service_role: dit raakt bewust niet anon/authenticated, die hun
-- eigen, beperktere grants/policies hebben (zie o.a. de kolom-grant op
-- tenants in 20260612000001_tenant_instellingen_update.sql).

grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Zodat toekomstige tabellen/functies dit automatisch ook krijgen.
alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;
