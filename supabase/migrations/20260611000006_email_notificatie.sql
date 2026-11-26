-- Migration: Notificatie-e-mail per lead
-- Fase 2, Stap 2 | 2026-06-11
--
-- notified_at fungeert als idempotentie-claim: de mail-flow claimt de lead
-- (update ... where notified_at is null) vóór verzending — een retry of
-- race kan dus nooit twee mails opleveren (stap 2.1).

alter table public.leads
  add column notified_at timestamptz;

-- Notificatie-adres per tenant [AVG: bedrijfse-mail]. Null = contact_email.
alter table public.tenants
  add column notification_email text;
