-- Migration: teller met optelwaarde voor de platformbrede dagrem op AI-kosten
-- 2026-10-08
--
-- Bij AWS bestaat geen prepaid plafond. De lagen begrenzen per
-- gesprek, per IP en per tenant, maar niets begrenst het totaal over alle
-- tenants. Deze functie houdt de dagkosten bij, in tienduizendsten van een
-- dollar (integer, geen floats bij geld).
--
-- Hergebruikt de tabel rate_limits (sleutel plus tijdvenster): geen nieuw
-- schema en geen extra opruimtaak. De bestaande verhoog_rate_limit blijft
-- ongewijzigd, zodat de widget-rate-limits niet door deze wijziging raken.
--
-- p_delta = 0 leest de huidige stand zonder iets op te tellen.

create or replace function public.verhoog_teller(
  p_sleutel text,
  p_venster_seconden integer,
  p_delta integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venster timestamptz;
  v_teller integer;
begin
  if p_venster_seconden <= 0 then
    raise exception 'p_venster_seconden moet positief zijn';
  end if;
  if p_delta < 0 then
    raise exception 'p_delta mag niet negatief zijn';
  end if;

  v_venster := to_timestamp(
    floor(extract(epoch from now()) / p_venster_seconden) * p_venster_seconden
  );

  insert into public.rate_limits (sleutel, venster_start, teller)
  values (p_sleutel, v_venster, p_delta)
  on conflict (sleutel, venster_start)
    do update set teller = public.rate_limits.teller + p_delta
  returning teller into v_teller;

  return v_teller;
end;
$$;

-- Alleen de service-role mag dit aanroepen.
revoke execute on function public.verhoog_teller(text, integer, integer) from public, anon, authenticated;
grant execute on function public.verhoog_teller(text, integer, integer) to service_role;
