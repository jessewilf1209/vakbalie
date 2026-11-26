-- Auditactie voor het volledig verwijderen van een klant (tenant).
--
-- Waarom: bij opzegging moet Vakbalie alle gegevens van een klant kunnen
-- verwijderen (AVG, verwerkersovereenkomst). Dat gebeurt met
-- scripts/verwijder-tenant.mjs (bewust geen knop in /admin). Het script
-- legt de actie vast in admin_audit.
-- admin_audit heeft bewust geen foreign key naar tenants, dus de regel
-- overleeft de verwijderde klant.
--
-- Alleen de lijst met toegestane acties verandert; bestaande rijen voldoen
-- al, dus de constraint kan direct gevalideerd worden.

alter table public.admin_audit drop constraint admin_audit_actie_check;

alter table public.admin_audit
  add constraint admin_audit_actie_check check (actie in (
    'tenant_aangemaakt',
    'domeinen_gewijzigd',
    'status_gewijzigd',
    'gebruiker_toegevoegd',
    'instellingen_gewijzigd',
    'tenant_verwijderd'
  ));
