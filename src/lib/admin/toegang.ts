import "server-only";
import { notFound, redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";

/**
 * Toegang tot /admin. Twee lagen, want een layout alleen is niet
 * genoeg: server actions zijn los aan te roepen.
 *
 * - `vereisAdminPagina()` in de layout van /admin en in elke pagina;
 * - `vereisAdminActie()` bovenaan elke server action en datafunctie.
 *
 * De beslissing zelf valt altijd in de database (`is_platform_admin()`):
 * vlag live uit auth.users, aal2 uit het op handtekening gecontroleerde JWT,
 * en geen tenantlid. De stappen ervoor bepalen alleen waarheen we iemand
 * sturen (inloggen, MFA instellen, MFA-code invoeren).
 */

export type AdminStatus =
  "geen_sessie" | "geen_admin" | "mfa_instellen" | "mfa_verifieren" | "toegang";

type Supabase = Awaited<ReturnType<typeof getSupabaseServer>>;

export interface AdminContext {
  supabase: Supabase;
  adminId: string;
}

async function bepaal(): Promise<{ status: AdminStatus; context?: AdminContext }> {
  const supabase = await getSupabaseServer();

  // getUser() valideert de sessie bij Supabase; app_metadata komt dan van de
  // server en niet uit een cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "geen_sessie" };
  if (user.app_metadata?.platform_admin !== true) return { status: "geen_admin" };

  const { data: niveau, error: niveauFout } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (niveauFout || !niveau) return { status: "geen_admin" };

  if (niveau.currentLevel !== "aal2") {
    return { status: niveau.nextLevel === "aal2" ? "mfa_verifieren" : "mfa_instellen" };
  }

  const { data: isAdmin, error } = await supabase.rpc("is_platform_admin");
  if (error || isAdmin !== true) return { status: "geen_admin" };

  return { status: "toegang", context: { supabase, adminId: user.id } };
}

/** Status zonder doorsturen, voor de login- en MFA-schermen zelf. */
export async function adminStatus(): Promise<AdminStatus> {
  return (await bepaal()).status;
}

/**
 * Voor pagina's. Wie geen admin is, krijgt een 404: het bestaan van /admin
 * wordt niet bevestigd.
 */
export async function vereisAdminPagina(): Promise<AdminContext> {
  const { status, context } = await bepaal();
  if (status === "toegang" && context) return context;
  if (status === "geen_sessie") redirect("/admin/login");
  if (status === "mfa_instellen") redirect("/admin/mfa/instellen");
  if (status === "mfa_verifieren") redirect("/admin/mfa");
  notFound();
}

/** Fout die een server action teruggeeft; zegt bewust niet waarom. */
export class GeenAdminToegang extends Error {
  constructor() {
    super("geen toegang");
    this.name = "GeenAdminToegang";
  }
}

/** Voor server actions en datafuncties: gooit in plaats van door te sturen. */
export async function vereisAdminActie(): Promise<AdminContext> {
  const { status, context } = await bepaal();
  if (status === "toegang" && context) return context;
  throw new GeenAdminToegang();
}

/**
 * Voor de login- en MFA-schermen: laat de pagina alleen zien in de status
 * waar hij bij hoort, en stuurt anders door naar de juiste stap.
 */
export async function vereisAdminStap(verwacht: AdminStatus): Promise<void> {
  const status = await adminStatus();
  if (status === verwacht) return;
  if (status === "geen_admin") notFound();
  if (status === "geen_sessie") redirect("/admin/login");
  if (status === "mfa_instellen") redirect("/admin/mfa/instellen");
  if (status === "mfa_verifieren") redirect("/admin/mfa");
  redirect("/admin");
}
