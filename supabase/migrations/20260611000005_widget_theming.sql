-- Migration: Widget-theming per tenant
-- Fase 1, Stap 9 | 2026-06-11
--
-- De widget leeft op de site van de hovenier en moet dáárbij passen:
-- design tokens per tenant, met een verzorgde default. De check op de
-- kleur voorkomt dat er ooit iets anders dan een hex-waarde in een
-- style-attribuut belandt (defense-in-depth naast server-side validatie).

alter table public.tenants
  add column widget_kleur text not null default '#1f6f43'
    check (widget_kleur ~ '^#[0-9a-fA-F]{6}$'),
  add column welkomsttekst text
    check (char_length(welkomsttekst) <= 300),
  add column privacy_url text
    check (privacy_url is null or privacy_url ~ '^https?://');

comment on column public.tenants.privacy_url is
  'Privacyverklaring van de tenant; null = onze placeholder-pagina (open punt vóór echte pilot).';
