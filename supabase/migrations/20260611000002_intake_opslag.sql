-- Migration: Opslag van intake-staat en gestructureerde leadvelden
-- Fase 1, Stap 6 | 2026-06-11
--
-- conversations.intake_state: server-side gespreksstaat (jsonb). Bevat
-- persoonsgegevens zodra de bezoeker consent gaf [AVG]; bewaartermijn
-- gelijk aan de lead. Alleen de service-role schrijft hier.
--
-- leads krijgt de gestructureerde intakevelden (categorieën) plus
-- het consent-tijdstip [AVG] en een unieke conversation-koppeling die
-- dubbele leads bij retries/races hard uitsluit (idempotentie).

alter table public.conversations
  add column intake_state jsonb not null default '{}'::jsonb;

comment on column public.conversations.intake_state is
  'Server-side intake-staat; [AVG] bevat contactgegevens na consent. Bewaartermijn = lead.';

alter table public.leads
  add column plaats text,
  add column project_type text,
  add column tuin_grootte text,
  add column budget_indicatie text
    check (budget_indicatie in ('tot_2500', '2500_10000', '10000_plus', 'onbekend')),
  add column timing text
    check (timing in ('binnen_1_maand', '1_3_maanden', '3_6_maanden', 'later', 'onbekend')),
  add column score_redenen text[] not null default '{}',
  add column consent_at timestamptz,  -- [AVG] tijdstip van toestemming contactgegevens
  add column conversation_id uuid unique references public.conversations(id) on delete set null;

comment on column public.leads.conversation_id is
  'Bron-gesprek; unique = maximaal één lead per gesprek (idempotentie bij retries).';
