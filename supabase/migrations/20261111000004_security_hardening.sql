-- Migration: hardening na security-audit
-- Security | 2026-11-11
--
-- 1. Vaste search_path op de vier oudste functies (Supabase-advisor 0011).
--    get_my_tenant_ids() en get_my_owner_tenant_ids() zijn security definer
--    én het anker van alle tenant-RLS; met een muteerbare search_path kan
--    een object in een ander schema de lookup kapen. Alle verwijzingen in de
--    bodies zijn al volledig gekwalificeerd, dus '' verandert geen gedrag.
--
-- 2. anon mag de RLS-helpers niet aanroepen (advisor 0028). Alle policies
--    die ze gebruiken gelden alleen voor authenticated; via /rest/v1/rpc
--    hoefde anon er nooit bij te kunnen.
--
-- 3. Kolom-grens op leads, zoals al op tenants (20260612000001). De
--    tabel-grant uit 20260625000001 liet authenticated élke kolom wijzigen,
--    ook contact_email, foto_paden en conversation_id. Daarmee kon een
--    tenantlid:
--      - het adres van een lead omzetten naar een willekeurig adres en via
--        de opvolgmail vrije tekst versturen vanaf ons geverifieerde
--        maildomein (spam/phishing-relay);
--      - foto_paden of conversation_id naar objecten van een andere tenant
--        laten wijzen, die de bewaartermijn-cron (service-role, omzeilt RLS)
--        daarna zou verwijderen.
--    Het dashboard wijzigt alleen status (leads/acties.ts); de service-role
--    (notified_at) houdt volledige rechten.

alter function public.handle_updated_at() set search_path = '';
alter function public.generate_widget_key() set search_path = '';
alter function public.get_my_tenant_ids() set search_path = '';
alter function public.get_my_owner_tenant_ids() set search_path = '';

revoke execute on function public.get_my_tenant_ids() from public, anon;
revoke execute on function public.get_my_owner_tenant_ids() from public, anon;
grant execute on function public.get_my_tenant_ids() to authenticated, service_role;
grant execute on function public.get_my_owner_tenant_ids() to authenticated, service_role;

revoke update on table public.leads from anon, authenticated;
grant update (status) on table public.leads to authenticated;
