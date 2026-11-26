-- Lokale testdata voor `supabase db reset`.
-- Bevat GEEN echte persoonsgegevens: alle data is fictief.
-- Dit bestand staat in git — nooit echte data hier plaatsen.

-- Vaste widget-keys zodat de embed-testpagina (examples/) en lokale tests
-- een voorspelbare key hebben. allowed_origins wijst naar de lokale testpagina.
insert into public.tenants (id, name, contact_email, status, widget_key, allowed_origins, welkomsttekst)
values
  (
    '00000000-0000-0000-0000-000000000001',
    'Groen & Co Hoveniers',
    'info@groenco.test',
    'active',
    'wk_test_1234567890abcdef',
    array['http://localhost:8080', 'http://127.0.0.1:8080'],
    'Welkom! Ik help je graag bij het opstellen van een offerte-aanvraag. Wat wil je laten doen in de tuin, en wat is je wens voor het eindresultaat?'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'De Tuinman BV',
    'hallo@detuinman.test',
    'trial',
    'wk_trial_abcdef1234567890',
    array[]::text[],
    null
  ),
  -- Demo-tenant voor de etalagesite (/demo). NEXT_PUBLIC_DEMO_TENANT_KEY wijst
  -- hiernaar. Demo-sessies draaien altijd op de mock-LLM (force-mock in de
  -- message-route), dus deze tenant verbruikt nooit AI-budget. allowed_origins
  -- is voor cross-origin embedding; de /demo-pagina zelf is same-origin
  -- ('self' staat altijd in frame-ancestors).
  (
    '00000000-0000-0000-0000-000000000003',
    'Groen & Co (demo)',
    'demo@offerte-agent.test',
    'active',
    'wk_demo_0000000000000001',
    array['http://localhost:3000', 'http://127.0.0.1:3000'],
    'Welkom! Ik help je graag bij het opstellen van een offerte-aanvraag. Wat wil je laten doen in de tuin, en wat is je wens voor het eindresultaat?'
  )
on conflict do nothing;

insert into public.leads (tenant_id, contact_name, contact_email, contact_phone, plaats, project_type, project_description, lead_score, status)
values
  (
    '00000000-0000-0000-0000-000000000001',
    'Test Persoon',
    'test@example.test',
    null,
    'Zwolle',
    'Tuinonderhoud',
    'Grasmaaien en snoeien — voortuin 80m²',
    75,
    'new'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'Ander Persoon',
    'ander@example.test',
    null,
    'Kampen',
    'Tuinaanleg',
    'Complete tuin aanleggen met bestrating',
    50,
    'contacted'
  ),
  -- Alleen telefonisch bereikbaar: dekt de belscript-variant van de
  -- opvolgfunctie af, die anders lokaal niet te zien is.
  (
    '00000000-0000-0000-0000-000000000001',
    'Telefoon Persoon',
    null,
    '+31 6 12345678',
    'Deventer',
    'Bestrating',
    'Oprit opnieuw bestraten, ongeveer 40m²',
    60,
    'new'
  )
on conflict do nothing;

-- RLS-verificatie (handmatig uitvoeren in Studio of psql):
-- Als je als anonieme/niet-ingelogde gebruiker queryt, moet dit 0 rijen geven:
--   set role anon; select * from leads;          --> 0 rijen
--   set role authenticated; select * from leads; --> 0 rijen (geen tenant-koppeling)
