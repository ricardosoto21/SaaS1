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
  if (name.length < 2 || !email.includes("@") || salonName.length < 2 || branchName.length < 2) redirect("/registro?error=Datos%20incompletos");
  if (!(await enforcePublicRateLimit("registration", email, 3, 3600))) redirect("/registro?error=Intenta%20nuevamente%20más%20tarde");
  const supabase = getSupabaseAdminClient();
  if (!supabase) redirect("/registro?error=Servicio%20no%20disponible");
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? (host ? `${protocol}://${host}` : "http://localhost:3001");
  const { data: invite, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, { data: { full_name: name }, redirectTo: `${origin}/auth/recovery` });
  if (inviteError || !invite.user) redirect("/registro?error=No%20se%20pudo%20crear%20la%20cuenta");
  const suffix = invite.user.id.slice(0, 8);
  const { data: organization, error: organizationError } = await supabase.from("organizations").insert({ name: salonName, slug: `${slugify(salonName)}-${suffix}` }).select("id").single();
  if (organizationError || !organization) redirect("/registro?error=No%20se%20pudo%20crear%20el%20salón");
  const { data: branch, error: branchError } = await supabase.from("branches").insert({ organization_id: organization.id, name: branchName, timezone: "America/Santiago" }).select("id").single();
  if (branchError || !branch) redirect("/registro?error=No%20se%20pudo%20crear%20la%20sucursal");
  await supabase.from("profiles").upsert({ id: invite.user.id, full_name: name, email, role: "admin", active: true, organization_id: organization.id, active_branch_id: branch.id });
  await supabase.from("organization_members").upsert({ organization_id: organization.id, user_id: invite.user.id, role: "admin", active: true });
  await supabase.from("user_branch_access").upsert({ organization_id: organization.id, branch_id: branch.id, user_id: invite.user.id, active: true });
  redirect("/login?registered=1");
}