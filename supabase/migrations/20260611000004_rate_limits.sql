-- Migration: Rate limiting via Postgres
-- Fase 1, Stap 8 | 2026-06-11
--
-- Teller-tabel met vaste tijdvensters. Sleutels bevatten NOOIT rauwe
-- IP-adressen — alleen een SHA-256-hash met server-side salt [AVG], en de
-- rijen zijn kortlevend (opportunistische cleanup in de functie).
-- Geen policies: alleen de service-role (via de RPC) komt erbij.

create table public.rate_limits (
  sleutel       text        not null,
  venster_start timestamptz not null,
  teller        integer     not null default 1,
  primary key (sleutel, venster_start)
);

alter table public.rate_limits enable row level security;

-- Atomaire verhoog-en-lees: race-vrij dankzij upsert.
create or replace function public.verhoog_rate_limit(
  p_sleutel text,
  p_venster_seconden integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venster timestamptz := to_timestamp(
    floor(extract(epoch from now()) / p_venster_seconden) * p_venster_seconden
  );
  v_teller integer;
begin
  insert into public.rate_limits (sleutel, venster_start, teller)
  values (p_sleutel, v_venster, 1)
  on conflict (sleutel, venster_start)
    do update set teller = public.rate_limits.teller + 1
  returning teller into v_teller;

  -- Opportunistische cleanup (~2% van de calls): verlopen vensters weg.
  if random() < 0.02 then
    delete from public.rate_limits where venster_start < now() - interval '2 days';
  end if;

  return v_teller;
end;
$$;

-- Alleen de service-role mag dit aanroepen.
revoke execute on function public.verhoog_rate_limit(text, integer) from public, anon, authenticated;
