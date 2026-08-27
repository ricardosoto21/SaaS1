"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { enforcePublicRateLimit } from "@/lib/security/public-rate-limit";
import { getSupabaseAdminClient } from "@/lib/supabase";
import { slugify } from "@/lib/utils";

export async function registerSalonAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const salonName = String(formData.get("salonName") ?? "").trim();
  const branchName = String(formData.get("branchName") ?? "Sucursal principal").trim();

  if (name.length < 2 || !email.includes("@") || salonName.length < 2 || branchName.length < 2) {
    redirect("/registro?error=Datos%20incompletos");
  }
  if (!(await enforcePublicRateLimit("registration", email, 3, 3600))) {
    redirect("/registro?error=Intenta%20nuevamente%20más%20tarde");
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) redirect("/registro?error=Servicio%20no%20disponible");

  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? (host ? `${protocol}://${host}` : "http://localhost:3001");
  const { data: invite, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
    data: { full_name: name },
    redirectTo: `${origin}/auth/recovery`,
  });

  if (inviteError || !invite.user) {
    redirect("/registro?error=No%20se%20pudo%20crear%20la%20cuenta");
  }

  const slug = `${slugify(salonName)}-${invite.user.id.slice(0, 8)}`;
  const { error: onboardingError } = await supabase.rpc("create_tenant_onboarding", {
    p_user_id: invite.user.id,
    p_full_name: name,
    p_email: email,
    p_organization_name: salonName,
    p_organization_slug: slug,
    p_branch_name: branchName,
  });

  if (onboardingError) {
    // Compensate the external Auth side effect when the database transaction fails.
    await supabase.auth.admin.deleteUser(invite.user.id);
    redirect("/registro?error=No%20se%20pudo%20crear%20el%20salón");
  }

  redirect("/login?registered=1");
}