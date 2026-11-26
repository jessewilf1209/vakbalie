-- Migration: meetlaag voor verbruik per klant (AI-tokens en gebeurtenissen)
-- 2026-10-18
--
-- Tot nu toe stond het tokenverbruik alleen in conversations.intake_state.
-- Die jsonb bevat persoonsgegevens en wordt door de bewaartermijn-cron of de
-- verwijderknop verwijderd, en met het gesprek verdween ook het verbruik.
-- Opvolgmail en belscript werden nergens per klant vastgelegd.
--
-- Twee append-only tabellen, met uitsluitend getallen en vaste codes:
--   llm_gebruik     één rij per geslaagde LLM-aanroep (geschreven door de
--                   dagrem, DagBudgetProvider, dus de som klopt met de rem);
--   gebruik_events  één rij per gebeurtenis die kosten veroorzaakt of laat
--                   zien dat de widget werkt.
--
-- Bewust GEEN vrije tekstkolom en geen jsonb: wat er niet in kan, kan er ook
-- niet per ongeluk in komen. Geen prompt, antwoord, naam, e-mail of IP.
--
-- Toegang: RLS aan zonder policies en geen grants voor anon/authenticated.
-- Alleen de service-role schrijft; lezen gaat later uitsluitend via de
-- admin-functies (PR C1), die zelf op platform-admin controleren.
--
-- Bewaartermijn: rijen ouder dan 25 maanden ruimt de bestaande
-- bewaartermijn-cron op.

-- ------------------------------------------------------------------
-- llm_gebruik
-- ------------------------------------------------------------------

create table public.llm_gebruik (
  id                   bigint      generated always as identity primary key,
  tenant_id            uuid        not null references public.tenants(id) on delete cascade,
  -- Koppeling voor kosten per gesprek. Wordt het gesprek verwijderd (AVG),
  -- dan blijft het verbruik staan en verdwijnt alleen de koppeling.
  conversation_id      uuid        null references public.conversations(id) on delete set null,
  bron                 text        not null check (bron in ('intake', 'opvolgmail', 'belscript')),
  provider             text        not null check (provider ~ '^[a-z0-9_-]{1,32}$'),
  -- Model-ID uit de configuratie, bijvoorbeeld eu.anthropic.claude-haiku-4-5-20251001-v1:0.
  -- Het patroon laat geen spaties of vrije tekst toe.
  model                text        not null check (model ~ '^[A-Za-z0-9._:/-]{1,200}$'),
  input_tokens         integer     not null check (input_tokens >= 0),
  output_tokens        integer     not null check (output_tokens >= 0),
  -- Prompt caching: apart gemeten, want deze tokens hebben een eigen tarief.
  -- Zolang caching niets doet blijven ze 0.
  cache_schrijf_tokens integer     not null default 0 check (cache_schrijf_tokens >= 0),
  cache_lees_tokens    integer     not null default 0 check (cache_lees_tokens >= 0),
  -- Tienduizendsten van een dollar, dezelfde rekenregel als de dagrem.
  kosten_eenheden      integer     not null check (kosten_eenheden >= 0),
  created_at           timestamptz not null default now()
);

comment on table public.llm_gebruik is
  'Tokenverbruik per LLM-aanroep. Alleen getallen, nooit inhoud. Append-only.';

create index idx_llm_gebruik_tenant_tijd on public.llm_gebruik(tenant_id, created_at);
create index idx_llm_gebruik_gesprek on public.llm_gebruik(conversation_id)
  where conversation_id is not null;
-- Voor de bewaartermijn-cron en platformtotalen per dag.
create index idx_llm_gebruik_tijd on public.llm_gebruik(created_at);

alter table public.llm_gebruik enable row level security;

-- ------------------------------------------------------------------
-- gebruik_events
-- ------------------------------------------------------------------

create table public.gebruik_events (
  id         bigint      generated always as identity primary key,
  tenant_id  uuid        not null references public.tenants(id) on delete cascade,
  soort      text        not null check (soort in (
               'gesprek_gestart',
               'lead_aangemaakt',
               'foto_geupload',
               'afgerond_op_budget',
               'rate_limit_geweigerd',
               'dagrem_geweigerd',
               'notificatiemail_verstuurd',
               'opvolgmail_verstuurd'
             )),
  created_at timestamptz not null default now()
);

comment on table public.gebruik_events is
  'Gebeurtenissen per tenant. Alleen een vaste code en een tijdstip. Append-only.';

create index idx_gebruik_events_tenant_tijd on public.gebruik_events(tenant_id, created_at);
create index idx_gebruik_events_tijd on public.gebruik_events(created_at);

alter table public.gebruik_events enable row level security;

-- ------------------------------------------------------------------
-- Rechten
-- ------------------------------------------------------------------

-- Geen enkele toegang voor de rollen van de browser, ook niet via een
-- eventuele default privilege van het platform. Zonder policies zou RLS al
-- alles weigeren; de revoke maakt het expliciet (defense in depth).
revoke all on public.llm_gebruik from public, anon, authenticated;
revoke all on public.gebruik_events from public, anon, authenticated;

-- Append-only, ook voor de service-role: toevoegen, lezen en (voor de
-- bewaartermijn) verwijderen, maar nooit wijzigen. De default privileges uit
-- 20260619000001 geven ook update; die halen we hier weg.
revoke update, truncate on public.llm_gebruik from service_role;
revoke update, truncate on public.gebruik_events from service_role;
grant select, insert, delete on public.llm_gebruik to service_role;
grant select, insert, delete on public.gebruik_events to service_role;
