-- Migration: opvolgmails per lead
-- Feature | 2026-09-08
--
-- Legt vast welke opvolgmail daadwerkelijk naar een aanvrager is verstuurd.
-- Bewust alleen verstuurde mails: een verworpen AI-concept is een
-- persoonsgegeven dat we niet hoeven te bewaren (dataminimalisatie, AVG).
--
-- De cascade op lead_id is een databaseniveau-garantie: verwijdert de
-- AVG-verwijderknop of de bewaartermijn-cron een lead, dan verdwijnt de
-- opvolghistorie automatisch mee. Zo kan verwijder-lead.ts dit nooit
-- vergeten, ook niet als die functie later verandert.

create table public.lead_opvolgmails (
  id             uuid        primary key default gen_random_uuid(),
  tenant_id      uuid        not null references public.tenants(id) on delete cascade,
  lead_id        uuid        not null references public.leads(id) on delete cascade,
  -- Welk teamlid verstuurde: nuttig zodra een tenant meerdere gebruikers
  -- heeft. set null zodat een verwijderd account de historie niet sloopt.
  verzonden_door uuid        references auth.users(id) on delete set null,
  onderwerp      text        not null,
  tekst          text        not null,
  verzonden_op   timestamptz not null default now()
);

create index idx_lead_opvolgmails_lead_id on public.lead_opvolgmails(lead_id);
create index idx_lead_opvolgmails_tenant_id on public.lead_opvolgmails(tenant_id);

comment on table public.lead_opvolgmails is
  'Verstuurde opvolgmails per lead. Alleen daadwerkelijk verzonden berichten, nooit concepten.';

alter table public.lead_opvolgmails enable row level security;

-- Lezen: alles binnen de eigen tenant.
create policy "Tenant members can read their opvolgmails"
  on public.lead_opvolgmails for select
  to authenticated
  using (tenant_id in (select public.get_my_tenant_ids()));

-- Schrijven: naast de tenant-grens ook de eis dat de lead écht bij die
-- tenant hoort. Zonder die tweede voorwaarde kan een gebruiker een rij
-- hangen aan een lead van een andere tenant (met zijn eigen tenant_id),
-- wat de historie laat verwijzen naar iets wat hij niet mag zien.
create policy "Tenant members can log their own opvolgmails"
  on public.lead_opvolgmails for insert
  to authenticated
  with check (
    tenant_id in (select public.get_my_tenant_ids())
    and lead_id in (
      select id from public.leads
      where tenant_id in (select public.get_my_tenant_ids())
    )
  );

-- Zonder GRANT weigert Postgres de query vóórdat RLS loopt (zie de
-- bugfix in 20260625000001). Het dashboard leest de historie en schrijft
-- een rij bij verzending; wijzigen of verwijderen hoeft niet (de cascade
-- ruimt op bij een AVG-verzoek).
grant select, insert on public.lead_opvolgmails to authenticated;
