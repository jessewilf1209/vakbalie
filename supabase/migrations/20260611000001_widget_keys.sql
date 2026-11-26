-- Migration: Widget-keys en toegestane embed-origins per tenant
-- Fase 1, Stap 3 | 2026-06-11
--
-- De widget-key (wk_...) is de PUBLIEKE identificatie in de embed-snippet
-- op de klantsite — bewust géén tenant-UUID (geen interne id's lekken,
-- roteerbaar bij misbruik). allowed_origins bepaalt waar de widget mag
-- worden ge-embed (frame-ancestors-CSP) — exacte origins, geen wildcards.
--
-- RLS: bestaande tenant-policies dekken deze kolommen (tenant-leden lezen
-- hun eigen key voor de embed-instructie). De widget-API zoekt tenants op
-- via de service-role, anonieme bezoekers hebben nergens direct toegang.

-- gen_random_bytes voor cryptografisch sterke keys
create extension if not exists pgcrypto with schema extensions;

create or replace function public.generate_widget_key()
returns text
language sql
volatile
as $$
  -- 24 random bytes -> 32 tekens base64, url-safe gemaakt ('+/' -> '-_', '=' verwijderd)
  select 'wk_' || translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/=', '-_')
$$;

alter table public.tenants
  add column widget_key text not null unique default public.generate_widget_key()
    check (widget_key ~ '^wk_[A-Za-z0-9_-]{16,64}$'),
  add column allowed_origins text[] not null default '{}';

comment on column public.tenants.widget_key is
  'Publieke key in de embed-snippet; roteerbaar, geen secret en geen interne id.';
comment on column public.tenants.allowed_origins is
  'Exacte origins (https://klantsite.nl) waar de widget ge-embed mag worden; leeg = nergens.';

-- Opzoeken op key (elke widget-sessie) gebruikt de index van de unique-constraint.
