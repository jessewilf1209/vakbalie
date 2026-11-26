-- Migration: Verwijderrechten op lead-foto's voor tenant-leden
-- Fase 2, Stap 7 | 2026-06-12
--
-- De verwijderknop in het dashboard (AVG-verwijderverzoek) draait volledig
-- op de anon-client + RLS — de service-role komt in het dashboard niet
-- voor. Daarvoor is een delete-policy nodig met dezelfde tenant-grens als
-- de leespolicy (migration 007): de eerste mapnaam in het pad ís de
-- tenant_id. Uploaden blijft exclusief service-role (geen insert-policy).

create policy "Tenant members can delete their lead photos"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'lead-fotos'
    and exists (
      select 1
      from public.get_my_tenant_ids() as t(id)
      where t.id::text = (storage.foldername(name))[1]
    )
  );
