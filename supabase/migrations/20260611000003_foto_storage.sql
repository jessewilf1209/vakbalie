-- Migration: Foto-opslag voor intakegesprekken
-- Fase 1, Stap 7 | 2026-06-11
--
-- Bucket is NIET publiek; uploads gebeuren uitsluitend via onze API-route
-- met de service-role (na validatie + EXIF-strip). Er zijn bewust géén
-- storage-policies voor anon/authenticated: geen policy = geen toegang.
-- Het dashboard (fase 2) toont foto's via kortlevende signed URLs die
-- server-side worden aangemaakt ná een RLS-gecheckte lead-query.
--
-- De limieten op de bucket (grootte, mime-types) zijn een tweede slot op
-- de deur; de échte validatie (magic bytes via sharp, EXIF-strip) zit in
-- de API-route.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'lead-fotos',
  'lead-fotos',
  false,
  10485760,  -- 10 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- Paden van geüploade foto's (vorm: tenant_id/conversation_id/uuid.ext).
-- [AVG] foto's kunnen woning/tuin tonen; bewaartermijn gelijk aan lead.
alter table public.conversations
  add column foto_paden text[] not null default '{}';

alter table public.leads
  add column foto_paden text[] not null default '{}';
