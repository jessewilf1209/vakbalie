"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { herstelAanvraagToegestaan, inlogPogingToegestaan } from "@/lib/auth/inlog-rem";
import { getSupabaseServer } from "@/lib/supabase/server";

/**
 * Auth-acties voor het dashboard. Registratie bestaat
 * bewust niet (uitnodiging-only): accounts worden aangemaakt via de
 * Supabase-admin (invite) en gekoppeld in tenant_users.
 *
 * Foutmeldingen zijn neutraal — geen onderscheid tussen "bestaat niet" en
 * "verkeerd wachtwoord" (account-enumeratie).
 */

const loginSchema = z.object({
  email: z.email(),
  wachtwoord: z.string().min(8).max(200),
});

export async function loginActie(formData: FormData): Promise<void> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    wachtwoord: formData.get("wachtwoord"),
  });
  if (!parsed.success) redirect("/dashboard/login?fout=1");
  if (!(await inlogPogingToegestaan(parsed.data.email))) {
    redirect("/dashboard/login?fout=pogingen");
  }

  const supabase = await getSupabaseServer();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.wachtwoord,
  });
  if (error) redirect("/dashboard/login?fout=1");
  redirect("/dashboard");
}

export async function logoutActie(): Promise<void> {
  const supabase = await getSupabaseServer();
  await supabase.auth.signOut();
  redirect("/dashboard/login");
}

export async function wachtwoordVergetenActie(formData: FormData): Promise<void> {
  const parsed = z.email().safeParse(formData.get("email"));
  // Altijd hetzelfde antwoord, ook bij onbekende adressen (enumeratie).
  // Bij een bereikte rem dezelfde melding als altijd: niets verraden over
  // het adres, en er gaat gewoon geen mail uit.
  if (parsed.success && (await herstelAanvraagToegestaan(parsed.data))) {
    const supabase = await getSupabaseServer();
    const basisUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    await supabase.auth.resetPasswordForEmail(parsed.data, {
      // Alleen nog gebruikt als de mailtemplate {{ .ConfirmationURL }} gebruikt;
      // de eigen template (supabase/templates/herstel.html) linkt via token_hash.
      redirectTo: `${basisUrl}/auth/confirm?next=/dashboard/wachtwoord-instellen`,
    });
  }
  redirect("/dashboard/wachtwoord-vergeten?verzonden=1");
}

export async function wachtwoordInstellenActie(formData: FormData): Promise<void> {
  const parsed = z.string().min(12).max(200).safeParse(formData.get("wachtwoord"));
  if (!parsed.success) redirect("/dashboard/wachtwoord-instellen?fout=zwak");

  const supabase = await getSupabaseServer();
  const { error } = await supabase.auth.updateUser({ password: parsed.data });
  if (error) redirect("/dashboard/wachtwoord-instellen?fout=sessie");
  redirect("/dashboard");
}
