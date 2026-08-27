"use server";

import { cookies } from "next/headers";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { roleCanAccess } from "@/lib/data";
import { readStore } from "@/lib/store";
import { getSupabaseServerClient, hasSupabaseEnv } from "@/lib/supabase";
import type { SessionUser } from "@/lib/types";

const SESSION_COOKIE = "pelu_session";

function shouldUseSupabaseAuth() {
  return hasSupabaseEnv() && process.env.APP_DATA_MODE !== "local";
}

async function getRequestOrigin() {
  const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configuredUrl) {
    return configuredUrl.replace(/\/$/, "");
  }

  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const protocol = headerStore.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");

  if (host) {
    return `${protocol}://${host}`;
  }

  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001";
}

export async function getSessionUser(): Promise<SessionUser | null> {
  if (shouldUseSupabaseAuth()) {
    const supabase = await getSupabaseServerClient();
    if (!supabase) {
      return null;
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (!user || userError) {
      return null;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, full_name, email, role, professional_id, organization_id, active_branch_id, active")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile || profile.active === false) {
      return null;
    }

    if (!profile.organization_id || !profile.active_branch_id) {
      return null;
    }

    const [{ data: membership }, { data: branchAccess }] = await Promise.all([
      supabase
        .from("organization_members")
        .select("role, active")
        .eq("organization_id", profile.organization_id)
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("user_branch_access")
        .select("active")
        .eq("organization_id", profile.organization_id)
        .eq("branch_id", profile.active_branch_id)
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

    if (!membership || membership.active === false || !branchAccess || branchAccess.active === false) {
      return null;
    }

    return {
      id: String(profile.id),
      name: String(profile.full_name),
      email: String(profile.email || user.email || ""),
      role: membership.role as SessionUser["role"],
      professionalId: profile.professional_id ? String(profile.professional_id) : undefined,
      organizationId: profile.organization_id ? String(profile.organization_id) : undefined,
      branchId: profile.active_branch_id ? String(profile.active_branch_id) : undefined,
    };
  }

  const sessionId = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!sessionId) {
    return null;
  }

  const store = await readStore();
  const profile = store.profiles.find((item) => item.id === sessionId);
  if (!profile || profile.active === false) {
    return null;
  }

  return {
    id: profile.id,
    name: profile.name,
    email: profile.email,
    role: profile.role,
    professionalId: profile.professionalId,
    organizationId: "local-development",
    branchId: "local-main",
  };
}

export async function requireSession() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

export async function requireRoleForPath(path: string) {
  const user = await requireSession();
  if (!roleCanAccess(user.role, path)) {
    redirect("/dashboard");
  }
  return user;
}

export async function getAccessibleBranches() {
  const user = await getSessionUser();
  const supabase = await getSupabaseServerClient();
  if (!user?.organizationId || !supabase) return [];
  const { data } = await supabase.from("branches").select("id, name").eq("organization_id", user.organizationId).order("name");
  return (data ?? []).map((branch) => ({ id: String(branch.id), name: String(branch.name) }));
}

// Groups only branches visible through the authenticated user's RLS scope.
export async function getProfessionalBranchAssignments() {
  const user = await getSessionUser();
  const supabase = await getSupabaseServerClient();
  if (!user?.organizationId || !supabase) return new Map<string, Array<{ id: string; name: string }>>();
  const { data } = await supabase.from("professional_branches").select("professional_id, branch_id, branches(name)").eq("organization_id", user.organizationId).eq("active", true);
  const assignments = new Map<string, Array<{ id: string; name: string }>>();
  for (const row of data ?? []) {
    const branch = Array.isArray(row.branches) ? row.branches[0] : row.branches;
    if (!branch) continue;
    const items = assignments.get(String(row.professional_id)) ?? [];
    items.push({ id: String(row.branch_id), name: String(branch.name) });
    assignments.set(String(row.professional_id), items);
  }
  return assignments;
}

export async function signInAction(formData: FormData) {
  "use server";

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  const store = await readStore();
  const profile = store.profiles.find(
    (item) => item.email.toLowerCase() === email && item.password === password && item.active !== false,
  );

  if (!profile) {
    redirect("/login?error=1");
  }

  (await cookies()).set(SESSION_COOKIE, profile.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });

  redirect("/dashboard");
}

export async function requestPasswordResetAction(formData: FormData) {
  "use server";

  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (shouldUseSupabaseAuth() && email) {
    const supabase = await getSupabaseServerClient();
    const origin = await getRequestOrigin();

    await supabase?.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/auth/recovery`,
    });
  }

  redirect("/login?reset=sent");
}

export async function updatePasswordAction(formData: FormData) {
  "use server";

  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (password.length < 8) {
    redirect("/reset-password?error=short");
  }

  if (password !== confirmPassword) {
    redirect("/reset-password?error=mismatch");
  }

  if (!shouldUseSupabaseAuth()) {
    redirect("/login?reset=updated");
  }

  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    redirect("/reset-password?error=1");
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    redirect("/reset-password?error=1");
  }

  await supabase.auth.signOut();
  redirect("/login?reset=updated");
}

export async function signOutAction() {
  "use server";

  if (shouldUseSupabaseAuth()) {
    const supabase = await getSupabaseServerClient();
    await supabase?.auth.signOut();
  }

  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
