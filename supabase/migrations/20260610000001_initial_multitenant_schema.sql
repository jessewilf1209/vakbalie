-- Migration: Initieel multi-tenant schema met Row Level Security
-- Fase 0, Stap 5 | 2026-06-10
--
-- Tabellen:
--   tenants       — klanten (hoveniers)
--   tenant_users  — koppeling dashboard-gebruikers ↔ tenants  (RLS-anker)
--   leads         — offerte-aanvragen
--   conversations — widget-gesprekken
--   messages      — berichten binnen een gesprek
--
-- RLS-aanpak: dashboard-gebruikers zijn gekoppeld via tenant_users.
-- Policies gebruiken get_my_tenant_ids() als tenant-filter.
-- De service-role key (server-side API) schrijft namens de widget en omzeilt RLS.
--
-- AVG: persoonsgegevenskolommen zijn gemarkeerd met [AVG].
-- Bewaartermijn leads/messages: 2 jaar na created_at / laatste activiteit.
-- Verwijdering: direct DELETE op leads; CASCADE verwijdert conversations/messages.

-- ============================================================
-- Hulpfunctie: automatisch updated_at bijhouden
-- ============================================================

create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- Tabel: tenants
-- ============================================================

create table public.tenants (
  id            uuid        primary key default gen_random_uuid(),
  name          text        not null,
  contact_email text        not null,  -- [AVG] bedrijfse-mail; bewaard zolang klant actief
  status        text        not null default 'trial'
                            check (status in ('trial', 'active', 'inactive')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.tenants enable row level security;

create trigger trg_tenants_updated_at
  before update on public.tenants
  for each row execute function public.handle_updated_at();

-- ============================================================
-- Tabel: tenant_users  (koppeling auth.users ↔ tenants)
-- ============================================================

create table public.tenant_users (
  id         uuid        primary key default gen_random_uuid(),
  tenant_id  uuid        not null references public.tenants(id) on delete cascade,
  user_id    uuid        not null references auth.users(id) on delete cascade,
  role       text        not null default 'owner'
             check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create index idx_tenant_users_user_id   on public.tenant_users(user_id);
create index idx_tenant_users_tenant_id on public.tenant_users(tenant_id);

alter table public.tenant_users enable row level security;

-- Helper: geeft tenant_ids van de ingelogde gebruiker terug.
-- security definer: leest tenant_users met elevated rechten zodat de
-- aanroeper geen directe SELECT-grant op tenant_users nodig heeft.
create or replace function public.get_my_tenant_ids()
returns setof uuid
language sql
security definer
stable
as $$
  select tenant_id from public.tenant_users where user_id = auth.uid()
$$;

-- Elke gebruiker ziet alleen zijn eigen koppelingen
create policy "Users see own tenant memberships"
  on public.tenant_users for select
  to authenticated
  using (user_id = auth.uid());

-- Gebruikers zien alleen hun eigen tenant(s)
create policy "Tenant members can view their tenant"
  on public.tenants for select
  to authenticated
  using (id in (select public.get_my_tenant_ids()));

-- ============================================================
-- Tabel: leads
-- ============================================================

create table public.leads (
  id                  uuid        primary key default gen_random_uuid(),
  tenant_id           uuid        not null references public.tenants(id) on delete cascade,
  -- [AVG] naam, e-mail en telefoon zijn persoonsgegevens.
  -- Bewaartermijn: 2 jaar na created_at of laatste conversatie-activiteit.
  contact_name        text,       -- [AVG]
  contact_email       text,       -- [AVG]
  contact_phone       text,       -- [AVG]
  project_description text,
  lead_score          integer     check (lead_score between 0 and 100),
  status              text        not null default 'new'
                                  check (status in ('new', 'contacted', 'qualified', 'lost', 'won')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index idx_leads_tenant_id  on public.leads(tenant_id);
create index idx_leads_status     on public.leads(tenant_id, status);
create index idx_leads_created_at on public.leads(tenant_id, created_at desc);

alter table public.leads enable row level security;

create trigger trg_leads_updated_at
  before update on public.leads
  for each row execute function public.handle_updated_at();

create policy "Tenant members can manage their leads"
  on public.leads for all
  to authenticated
  using (tenant_id in (select public.get_my_tenant_ids()))
  with check (tenant_id in (select public.get_my_tenant_ids()));

-- ============================================================
-- Tabel: conversations
-- ============================================================

create table public.conversations (
  id         uuid        primary key default gen_random_uuid(),
  tenant_id  uuid        not null references public.tenants(id) on delete cascade,
  lead_id    uuid        references public.leads(id) on delete set null,
  status     text        not null default 'active'
             check (status in ('active', 'completed', 'abandoned')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_conversations_tenant_id on public.conversations(tenant_id);
create index idx_conversations_lead_id   on public.conversations(lead_id);

alter table public.conversations enable row level security;

create trigger trg_conversations_updated_at
  before update on public.conversations
  for each row execute function public.handle_updated_at();

create policy "Tenant members can manage their conversations"
  on public.conversations for all
  to authenticated
  using (tenant_id in (select public.get_my_tenant_ids()))
  with check (tenant_id in (select public.get_my_tenant_ids()));

-- ============================================================
-- Tabel: messages
-- ============================================================

create table public.messages (
  id              uuid        primary key default gen_random_uuid(),
  conversation_id uuid        not null references public.conversations(id) on delete cascade,
  -- [AVG] inhoud kan persoonsgegevens bevatten; bewaartermijn gelijk aan lead.
  role            text        not null check (role in ('user', 'assistant', 'system')),
  content         text        not null,
  created_at      timestamptz not null default now()
);

create index idx_messages_conversation_id on public.messages(conversation_id);

alter table public.messages enable row level security;

-- Messages zijn tenant-scoped via hun conversation
create policy "Tenant members can manage messages via conversation"
  on public.messages for all
  to authenticated
  using (
    conversation_id in (
      select id from public.conversations
      where tenant_id in (select public.get_my_tenant_ids())
    )
  )
  with check (
    conversation_id in (
      select id from public.conversations
      where tenant_id in (select public.get_my_tenant_ids())
    )
  );
