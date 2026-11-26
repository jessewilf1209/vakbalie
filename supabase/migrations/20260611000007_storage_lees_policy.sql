-- Migration: Leesrechten op lead-foto's voor tenant-leden
-- Fase 2, Stap 4 | 2026-06-11
--
-- Het dashboard maakt kortlevende signed URLs aan met de sessie van de
-- ingelogde gebruiker (anon-client). Daarvoor is een select-policy nodig;
-- het pad-formaat is tenant_id/conversation_id/uuid.ext, dus de eerste
-- mapnaam ís de tenant-grens. Schrijven blijft exclusief service-role
-- (geen insert/update/delete-policies).

create policy "Tenant members can read their lead photos"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'lead-fotos'
    and exists (
      select 1
      from public.get_my_tenant_ids() as t(id)
      where t.id::text = (storage.foldername(name))[1]
    )
  );
