"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { adminStatus } from "@/lib/admin/toegang";
import { inlogPogingToegestaan, mfaPogingToegestaan } from "@/lib/auth/inlog-rem";
import { getSupabaseServer } from "@/lib/supabase/server";

/**
 * Inloggen en MFA voor /admin. Het admin-account is een gewoon
 * Supabase-account met de vlag `platform_admin` in app_metadata, maar zonder
 * tenantkoppeling. Toegang vereist daarnaast aal2 (TOTP).
 *
 * Foutmeldingen zijn neutraal: geen onderscheid tussen "bestaat niet",
 * "verkeerd wachtwoord" of "geen admin" (account-enumeratie).
 */

const loginSchema = z.object({
  email: z.email().max(320),
  wachtwoord: z.string().min(8).max(200),
});

export async function adminLoginActie(formData: FormData): Promise<void> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    wachtwoord: formData.get("wachtwoord"),
  });
  if (!parsed.success) redirect("/admin/login?fout=1");
  if (!(await inlogPogingToegestaan(parsed.data.email))) redirect("/admin/login?fout=pogingen");

  const supabase = await getSupabaseServer();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.wachtwoord,
  });
  if (error) redirect("/admin/login?fout=1");

  // De guard bepaalt de volgende stap: MFA instellen, MFA-code, of /admin.
  // Een geldig account zonder adminvlag krijgt daar een 404.
  redirect("/admin");
}

export async function adminUitloggenActie(): Promise<void> {
  const supabase = await getSupabaseServer();
  await supabase.auth.signOut();
  redirect("/admin/login");
}

/* ------------------------------------------------------------------ *
 * MFA instellen (eerste keer)
 * ------------------------------------------------------------------ */

export type MfaInstellenStap =
  | { stap: "start"; fout?: string }
  | { stap: "scannen"; factorId: string; qr: string; geheim: string; fout?: string };

function alsDataUrl(qr: string): string {
  return qr.startsWith("data:") ? qr : `data:image/svg+xml;utf-8,${encodeURIComponent(qr)}`;
}

/**
 * Start het koppelen van een authenticator-app. Alleen voor een admin die
 * nog géén geverifieerde factor heeft: met een bestaande factor moet eerst
 * die worden gebruikt (anders kan een gestolen wachtwoord een eigen factor
 * toevoegen).
 */
export async function startMfaInstellenActie(): Promise<MfaInstellenStap> {
  if ((await adminStatus()) !== "mfa_instellen") {
    return { stap: "start", fout: "Dit kan nu niet. Log opnieuw in." };
  }
  const supabase = await getSupabaseServer();

  // Halverwege afgebroken pogingen opruimen; die blijven anders hangen.
  const { data: factoren } = await supabase.auth.mfa.listFactors();
  for (const factor of factoren?.all ?? []) {
    if (factor.factor_type === "totp" && factor.status === "unverified") {
      await supabase.auth.mfa.unenroll({ factorId: factor.id });
    }
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "Vakbalie admin",
  });
  if (error || !data) {
    console.error("mfa: koppelen starten mislukt", { code: error?.code });
    return { stap: "start", fout: "Koppelen starten mislukt. Probeer het opnieuw." };
  }
  return {
    stap: "scannen",
    factorId: data.id,
    qr: alsDataUrl(data.totp.qr_code),
    geheim: data.totp.secret,
  };
}

const codeSchema = z.string().regex(/^\d{6}$/);

const bevestigSchema = z.object({
  factorId: z.uuid(),
  code: codeSchema,
});

export async function bevestigMfaInstellenActie(
  vorige: MfaInstellenStap,
  formData: FormData,
): Promise<MfaInstellenStap> {
  const parsed = bevestigSchema.safeParse({
    factorId: formData.get("factorId"),
    code: String(formData.get("code") ?? "").replace(/\s/g, ""),
  });
  if (!parsed.success) return { ...vorige, fout: "Vul de zes cijfers uit je app in." };
  if ((await adminStatus()) !== "mfa_instellen") {
    return { stap: "start", fout: "Dit kan nu niet. Log opnieuw in." };
  }

  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await mfaPogingToegestaan(user.id))) {
    return { ...vorige, fout: "Te veel pogingen. Wacht vijf minuten." };
  }

  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId: parsed.data.factorId,
    code: parsed.data.code,
  });
  if (error) return { ...vorige, fout: "Die code klopt niet. Probeer de volgende." };

  // Sessie staat nu op aal2.
  redirect("/admin");
}

/* ------------------------------------------------------------------ *
 * MFA-code bij het inloggen
 * ------------------------------------------------------------------ */

export async function verifieerMfaActie(formData: FormData): Promise<void> {
  const code = codeSchema.safeParse(String(formData.get("code") ?? "").replace(/\s/g, ""));
  if (!code.success) redirect("/admin/mfa?fout=1");
  if ((await adminStatus()) !== "mfa_verifieren") redirect("/admin");

  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await mfaPogingToegestaan(user.id))) redirect("/admin/mfa?fout=pogingen");

  const { data: factoren } = await supabase.auth.mfa.listFactors();
  const factor = factoren?.totp.find((f) => f.status === "verified");
  if (!factor) redirect("/admin");

  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId: factor.id,
    code: code.data,
  });
  if (error) redirect("/admin/mfa?fout=1");
  redirect("/admin");
}
