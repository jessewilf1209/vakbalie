import "server-only";
import { z } from "zod";
import { CijfersFout } from "./cijfers";
import { vereisAdminActie } from "./toegang";

/**
 * Gegevens voor het beheerpaneel in /admin/klanten/[id] (PR E1). Net als de
 * cijfers via admin-functies met de sessie van de admin: geen service-role.
 * Alleen bedrijfsgegevens van de klant en de accounts van de hovenier, nooit
 * gegevens van aanvragers.
 */

const tenantDetailSchema = z
  .object({
    tenant_id: z.guid(),
    naam: z.string(),
    status: z.enum(["trial", "active", "inactive"]),
    contact_email: z.string(),
    notification_email: z.string().nullable(),
    allowed_origins: z.array(z.string()),
    widget_key: z.string(),
    widget_kleur: z.string(),
    welkomsttekst: z.string().nullable(),
    privacy_url: z.string().nullable(),
    created_at: z.string(),
  })
  .transform((r) => ({
    tenantId: r.tenant_id,
    naam: r.naam,
    status: r.status,
    contactEmail: r.contact_email,
    notificationEmail: r.notification_email,
    allowedOrigins: r.allowed_origins,
    widgetKey: r.widget_key,
    widgetKleur: r.widget_kleur,
    welkomsttekst: r.welkomsttekst,
    privacyUrl: r.privacy_url,
    aangemaakt: new Date(r.created_at),
  }));
export type TenantDetail = z.output<typeof tenantDetailSchema>;

const gebruikerSchema = z
  .object({
    user_id: z.guid(),
    email: z.string(),
    rol: z.enum(["owner", "member"]),
    laatste_login: z.string().nullable(),
    bevestigd: z.boolean(),
  })
  .transform((r) => ({
    userId: r.user_id,
    email: r.email,
    rol: r.rol,
    laatsteLogin: r.laatste_login === null ? null : new Date(r.laatste_login),
    bevestigd: r.bevestigd,
  }));
export type TenantGebruiker = z.output<typeof gebruikerSchema>;

const auditSchema = z
  .object({ actie: z.string(), bron: z.enum(["dashboard", "script"]), created_at: z.string() })
  .transform((r) => ({ actie: r.actie, bron: r.bron, moment: new Date(r.created_at) }));
export type AuditRegel = z.output<typeof auditSchema>;

export async function haalTenantBeheer(tenantId: string): Promise<{
  tenant: TenantDetail | null;
  gebruikers: TenantGebruiker[];
  audit: AuditRegel[];
}> {
  const id = z.guid().parse(tenantId);
  const { supabase } = await vereisAdminActie();
  const [detail, gebruikers, audit] = await Promise.all([
    supabase.rpc("admin_tenant_detail", { p_tenant_id: id }),
    supabase.rpc("admin_tenant_gebruikers", { p_tenant_id: id }),
    supabase.rpc("admin_audit_lijst", { p_tenant_id: id }),
  ]);
  if (detail.error) throw new CijfersFout("admin_tenant_detail", detail.error.code);
  if (gebruikers.error) throw new CijfersFout("admin_tenant_gebruikers", gebruikers.error.code);
  if (audit.error) throw new CijfersFout("admin_audit_lijst", audit.error.code);

  const [tenant] = z.array(tenantDetailSchema).max(1).parse(detail.data);
  return {
    tenant: tenant ?? null,
    gebruikers: z.array(gebruikerSchema).parse(gebruikers.data),
    audit: z.array(auditSchema).parse(audit.data),
  };
}
