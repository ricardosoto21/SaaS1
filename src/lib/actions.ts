"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getSessionUser, requireRoleForPath } from "@/lib/auth";
import { readStore, writeStore } from "@/lib/store";
import { encryptSumUpCredentials } from "@/lib/payments/credentials";
import { getSupabaseAdminClient, getSupabaseServerClient } from "@/lib/supabase";
import { shouldUseSupabaseStore } from "@/lib/supabase-store";
import { tenantScopeFromUser } from "@/lib/tenant";
import type {
  Appointment,
  AppointmentServiceLine,
  CategoryOption,
  PaymentMethod,
  Product,
  Profile,
  PurchaseItem,
  Role,
  Sale,
  SaleItem,
  Service,
  SessionUser,
} from "@/lib/types";
import { clampNumber, slugify } from "@/lib/utils";

const appPaths = [
  "/dashboard",
  "/agenda",
  "/clientes",
  "/ventas",
  "/inventario",
  "/compras",
  "/gastos",
  "/configuracion",
];

function revalidateApp() {
  appPaths.forEach((path) => revalidatePath(path));
}

function getString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function getNumber(formData: FormData, key: string) {
  const raw = String(formData.get(key) ?? "").replace(",", ".");
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function withNotice(path: string, key: "error" | "success", message: string): never {
  redirect(`${path}?${key}=${encodeURIComponent(message)}`);
}

function fail(path: string, message: string): never {
  withNotice(path, "error", message);
}

function done(path: string, message: string): never {
  revalidateApp();
  withNotice(path, "success", message);
}

async function getAppOrigin() {
  const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configuredUrl) {
    return configuredUrl.replace(/\/$/, "");
  }

  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const protocol = headerStore.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return host ? `${protocol}://${host}` : "http://localhost:3001";
}

async function requireSupabaseUser(path: string) {
  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    fail(path, "Supabase no esta configurado.");
  }
  return supabase;
}

async function runSupabaseRpc(path: string, name: string, args: Record<string, unknown>) {
  const { error } = await (await requireSupabaseUser(path)).rpc(name, args);
  if (error) {
    fail(path, error.message);
  }
}

async function upsertSupabaseCategory(path: string, table: string, id: string, name: string, organizationId: string) {
  const supabase = await requireSupabaseUser(path);
  const { data: existing, error: selectError } = await supabase
    .from(table)
    .select("id, name")
    .eq("organization_id", organizationId)
    .ilike("name", name)
    .maybeSingle();

  if (selectError) {
    fail(path, selectError.message);
  }

  if (existing) {
    return { id: String(existing.id), name: String(existing.name) };
  }

  const { data, error } = await supabase
    .from(table)
    .insert({ id: `${id}-${randomUUID()}`, name, organization_id: organizationId })
    .select("id, name")
    .single();
  if (error) {
    fail(path, error.message);
  }

  return { id: String(data.id), name: String(data.name) };
}

function parseRequiredDate(value: string, path: string, label: string) {
  const date = new Date(value);
  if (!value || !Number.isFinite(date.getTime())) {
    fail(path, `${label} invalida.`);
  }
  return date.toISOString();
}

function updateSaleBalances(sale: Sale, paymentsAmount: number) {
  const amountPaid = clampNumber(paymentsAmount);
  const amountDue = Math.max(0, sale.total - amountPaid);

  return {
    ...sale,
    amountPaid,
    amountDue,
    paymentStatus: amountDue === 0 ? "paid" : amountPaid > 0 ? "partial" : "unpaid",
  } as Sale;
}

function upsertCategory(categoryList: CategoryOption[], name: string, prefix: string) {
  const cleanName = name.trim();
  const existing = categoryList.find((item) => item.name.toLowerCase() === cleanName.toLowerCase());
  if (existing) {
    return existing;
  }

  const category = {
    id: `${prefix}-${slugify(cleanName) || randomUUID()}`,
    name: cleanName,
  };
  categoryList.push(category);
  return category;
}

function findService(services: Service[], serviceId: string) {
  return services.find((item) => item.id === serviceId && item.active);
}

function findProduct(products: Product[], productId: string) {
  return products.find((item) => item.id === productId && item.active);
}

function ensureStylistProfessional(user: SessionUser, professionalId: string, path: string) {
  if (user.role === "estilista" && professionalId !== user.professionalId) {
    fail(path, "No puedes operar con otro profesional.");
  }
}

function appointmentOverlaps(
  appointments: Appointment[],
  professionalId: string,
  startAt: string,
  durationMinutes: number,
  excludeAppointmentId?: string,
) {
  const start = new Date(startAt).getTime();
  const end = start + durationMinutes * 60_000;

  return appointments.some((appointment) => {
    if (
      appointment.id === excludeAppointmentId ||
      appointment.professionalId !== professionalId ||
      !["scheduled", "confirmed"].includes(appointment.status)
    ) {
      return false;
    }

    const appointmentStart = new Date(appointment.startAt).getTime();
    const appointmentEnd = appointmentStart + appointment.totalDurationMinutes * 60_000;
    return appointmentStart < end && start < appointmentEnd;
  });
}

async function recordAudit(
  user: SessionUser,
  action: string,
  entityType: string,
  entityId?: string,
  details: Record<string, unknown> = {},
) {
  if (!shouldUseSupabaseStore()) {
    return;
  }

  const supabase = await getSupabaseServerClient();
  if (!supabase || !user.organizationId || !user.branchId) return;
  const { error } = await supabase.rpc("record_tenant_audit", { p_action: action, p_entity_type: entityType, p_entity_id: entityId ?? null, p_details: details, p_organization_id: user.organizationId, p_branch_id: user.branchId });
  // Do not report a committed business operation as failed because its audit insert failed.
  if (error) console.error("No se pudo registrar auditoria:", error.message);
}

export async function createClientAction(formData: FormData) {
  const user = await requireRoleForPath("/clientes");
  const tenant = tenantScopeFromUser(user);
  const store = await readStore(user);
  const name = getString(formData, "name");
  const phone = getString(formData, "phone");

  if (!name || !phone) {
    fail("/clientes", "Nombre y telefono son obligatorios.");
  }

  const client = {
    id: `client-${randomUUID()}`,
    name,
    phone,
    email: getString(formData, "email") || undefined,
    birthday: getString(formData, "birthday") || undefined,
    preferences: getString(formData, "preferences"),
    notes: getString(formData, "notes"),
    createdAt: new Date().toISOString(),
  };

  if (shouldUseSupabaseStore()) {
    const { error } = await (await requireSupabaseUser("/clientes")).from("clients").insert({
      organization_id: tenant.organizationId,
      id: client.id,
      full_name: client.name,
      phone: client.phone,
      email: client.email ?? null,
      birthday: client.birthday || null,
      preferences: client.preferences,
      notes: client.notes,
      created_at: client.createdAt,
    });
    if (error) {
      fail("/clientes", error.message);
    }
    await recordAudit(user, "create", "client", client.id);
    done("/clientes", "Cliente guardado.");
  }

  store.clients.unshift(client);
  await writeStore(store, user);
  await recordAudit(user, "create", "client", client.id);
  done("/clientes", "Cliente guardado.");
}

export async function createProfessionalAction(formData: FormData) {
  const user = await requireRoleForPath("/configuracion");
  const tenant = tenantScopeFromUser(user);
  const store = await readStore(user);
  const name = getString(formData, "name");

  if (!name) {
    fail("/configuracion", "Nombre obligatorio.");
  }

  const professional = {
    id: `pro-${slugify(name) || "profesional"}-${randomUUID()}`,
    name,
    specialty: getString(formData, "specialty"),
    color: getString(formData, "color") || "#0f766e",
    active: true,
  };

  if (shouldUseSupabaseStore()) {
    const { error } = await (await requireSupabaseUser("/configuracion")).from("professionals").insert({
      organization_id: tenant.organizationId,
      id: professional.id,
      full_name: professional.name,
      specialty: professional.specialty,
      color: professional.color,
      active: professional.active,
    });
    if (error) {
      fail("/configuracion", error.message);
    }
    const { error: branchError } = await (await requireSupabaseUser("/configuracion"))
      .from("professional_branches")
      .insert({
        organization_id: tenant.organizationId,
        professional_id: professional.id,
        branch_id: tenant.branchId,
        active: true,
      });
    if (branchError) {
      fail("/configuracion", branchError.message);
    }
    await recordAudit(user, "create", "professional", professional.id);
    done("/configuracion", "Profesional creado.");
  }

  store.professionals.push(professional);
  await writeStore(store, user);
  await recordAudit(user, "create", "professional", professional.id);
  done("/configuracion", "Profesional creado.");
}

export async function updateProfessionalStatusAction(formData: FormData) {
  const user = await requireRoleForPath("/configuracion");
  const tenant = tenantScopeFromUser(user);
  const store = await readStore(user);
  const professionalId = getString(formData, "professionalId");
  const active = getString(formData, "active") === "true";

  if (!store.professionals.some((item) => item.id === professionalId)) {
    fail("/configuracion", "Profesional no encontrado.");
  }

  if (shouldUseSupabaseStore()) {
    const { error } = await (await requireSupabaseUser("/configuracion"))
      .from("professionals")
      .update({ active })
      .eq("organization_id", tenant.organizationId)
      .eq("id", professionalId);
    if (error) {
      fail("/configuracion", error.message);
    }
    await recordAudit(user, active ? "activate" : "deactivate", "professional", professionalId);
    done("/configuracion", active ? "Profesional activado." : "Profesional desactivado.");
  }

  store.professionals = store.professionals.map((professional) =>
    professional.id === professionalId ? { ...professional, active } : professional,
  );
  await writeStore(store, user);
  await recordAudit(user, active ? "activate" : "deactivate", "professional", professionalId);
  done("/configuracion", active ? "Profesional activado." : "Profesional desactivado.");
}

export async function assignProfessionalBranchAction(formData: FormData) {
  const user = await requireRoleForPath("/configuracion");
  const tenant = tenantScopeFromUser(user);
  const professionalId = getString(formData, "professionalId");
  const branchId = getString(formData, "branchId");
  if (!professionalId || !branchId) fail("/configuracion", "Profesional o sucursal invalida.");
  if (shouldUseSupabaseStore()) {
    const supabase = await requireSupabaseUser("/configuracion");
    const { data: access } = await supabase.from("user_branch_access").select("branch_id").eq("branch_id", branchId).maybeSingle();
    if (!access) fail("/configuracion", "No tienes acceso a esa sucursal.");
    const { error } = await supabase.from("professional_branches").upsert({ organization_id: tenant.organizationId, professional_id: professionalId, branch_id: branchId, active: true });
    if (error) fail("/configuracion", "No se pudo asignar la sucursal.");
    await recordAudit(user, "assign_branch", "professional", professionalId, { branchId });
    done("/configuracion", "Sucursal asignada.");
  }
  done("/configuracion", "Disponible con Supabase.");
}

export async function removeProfessionalBranchAction(formData: FormData) {
  const user = await requireRoleForPath("/configuracion");
  const tenant = tenantScopeFromUser(user);
  const professionalId = getString(formData, "professionalId");
  const branchId = getString(formData, "branchId");
  if (!professionalId || !branchId) fail("/configuracion", "Profesional o sucursal invalida.");
  if (!shouldUseSupabaseStore()) done("/configuracion", "Disponible con Supabase.");
  const supabase = await requireSupabaseUser("/configuracion");
  const { count, error: countError } = await supabase.from("professional_branches").select("professional_id", { count: "exact", head: true }).eq("organization_id", tenant.organizationId).eq("professional_id", professionalId).eq("active", true);
  if (countError || !count) fail("/configuracion", "No se encontro la asignacion.");
  if (count < 2) fail("/configuracion", "El profesional debe conservar una sucursal.");
  const { error } = await supabase.from("professional_branches").delete().eq("organization_id", tenant.organizationId).eq("professional_id", professionalId).eq("branch_id", branchId);
  if (error) fail("/configuracion", "No se pudo quitar la sucursal.");
  await recordAudit(user, "remove_branch", "professional", professionalId, { branchId });
  done("/configuracion", "Sucursal quitada.");
}

export async function createServiceAction(formData: FormData) {
  const user = await requireRoleForPath("/configuracion");
  const tenant = tenantScopeFromUser(user);
  const store = await readStore(user);
  const categoryName = getString(formData, "categoryName");
  const name = getString(formData, "name");

  if (!name || !categoryName) {
    fail("/configuracion", "Nombre y categoria son obligatorios.");
  }

  const category = upsertCategory(store.serviceCategories, categoryName, "svc-cat");
  const service = {
    id: `service-${slugify(name) || "servicio"}-${randomUUID()}`,
    name,
    categoryId: category.id,
    categoryName: category.name,
    durationMinutes: clampNumber(getNumber(formData, "durationMinutes"), 15),
    basePrice: clampNumber(getNumber(formData, "basePrice")),
    active: true,
  };

  if (shouldUseSupabaseStore()) {
    const supabaseCategory = await upsertSupabaseCategory(
      "/configuracion",
      "service_categories",
      category.id,
      category.name,
      tenant.organizationId,
    );
    const { error } = await (await requireSupabaseUser("/configuracion")).from("services").insert({
      organization_id: tenant.organizationId,
      id: service.id,
      name: service.name,
      category_id: supabaseCategory.id,
      duration_minutes: service.durationMinutes,
      base_price: service.basePrice,
      active: service.active,
    });
    if (error) {
      fail("/configuracion", error.message);
    }
    await recordAudit(user, "create", "service", service.id);
    done("/configuracion", "Servicio creado.");
  }

  store.services.push(service);
  await writeStore(store, user);
  await recordAudit(user, "create", "service", service.id);
  done("/configuracion", "Servicio creado.");
}

export async function createProductAction(formData: FormData) {
  const user = await requireRoleForPath("/configuracion");
  const tenant = tenantScopeFromUser(user);
  const store = await readStore(user);
  const categoryName = getString(formData, "categoryName");
  const name = getString(formData, "name");
  const sku = getString(formData, "sku");

  if (!name || !categoryName || !sku) {
    fail("/configuracion", "Nombre, categoria y SKU son obligatorios.");
  }

  if (store.products.some((product) => product.sku.toLowerCase() === sku.toLowerCase())) {
    fail("/configuracion", "Ese SKU ya existe.");
  }

  const category = upsertCategory(store.productCategories, categoryName, "prd-cat");
  const product = {
    id: `product-${slugify(name) || "producto"}-${randomUUID()}`,
    name,
    categoryId: category.id,
    categoryName: category.name,
    cost: clampNumber(getNumber(formData, "cost")),
    salePrice: clampNumber(getNumber(formData, "salePrice")),
    currentStock: clampNumber(getNumber(formData, "currentStock")),
    sku,
    active: true,
  };

  if (shouldUseSupabaseStore()) {
    const supabaseCategory = await upsertSupabaseCategory(
      "/configuracion",
      "product_categories",
      category.id,
      category.name,
      tenant.organizationId,
    );
    const { error } = await (await requireSupabaseUser("/configuracion")).from("products").insert({
      organization_id: tenant.organizationId,
      branch_id: tenant.branchId,
      id: product.id,
      name: product.name,
      category_id: supabaseCategory.id,
      sku: product.sku,
      current_cost: product.cost,
      sale_price: product.salePrice,
      current_stock: product.currentStock,
      active: product.active,
    });
    if (error) {
      fail("/configuracion", error.message);
    }
    await recordAudit(user, "create", "product", product.id);
    done("/configuracion", "Producto creado.");
  }

  store.products.push(product);
  await writeStore(store, user);
  await recordAudit(user, "create", "product", product.id);
  done("/configuracion", "Producto creado.");
}

export async function updateSettingsAction(formData: FormData) {
  const user = await requireRoleForPath("/configuracion");
  const tenant = tenantScopeFromUser(user);
  const store = await readStore(user);

  store.settings = {
    ...store.settings,
    salonName: getString(formData, "salonName") || store.settings.salonName,
    businessName: getString(formData, "businessName") || store.settings.businessName,
    lowStockThreshold: clampNumber(getNumber(formData, "lowStockThreshold"), 1),
  };

  if (shouldUseSupabaseStore()) {
    const { error } = await (await requireSupabaseUser("/configuracion")).from("settings").upsert({
      id: `settings-${tenant.organizationId}`,
      organization_id: tenant.organizationId,
      salon_name: store.settings.salonName,
      business_name: store.settings.businessName,
      currency: store.settings.currency,
      locale: store.settings.locale,
      timezone: store.settings.timezone,
      low_stock_threshold: store.settings.lowStockThreshold,
    });
    if (error) {
      fail("/configuracion", error.message);
    }
    await recordAudit(user, "update", "settings", "default");
    done("/configuracion", "Ajustes guardados.");
  }

  await writeStore(store, user);
  await recordAudit(user, "update", "settings", "default");
  done("/configuracion", "Ajustes guardados.");
}

export async function createUserAction(formData: FormData) {
  const user = await requireRoleForPath("/configuracion");
  const tenant = tenantScopeFromUser(user);
  const store = await readStore(user);
  const email = getString(formData, "email").toLowerCase();
  const name = getString(formData, "name");
  const password = getString(formData, "password");
  const role = (getString(formData, "role") || "recepcion") as Role;
  const professionalId = getString(formData, "professionalId") || undefined;

  if (!email || !name) {
    fail("/configuracion", "Nombre y email son obligatorios.");
  }

  if (!shouldUseSupabaseStore() && (!password || password.length < 8)) {
    fail("/configuracion", "Clave de 8 caracteres obligatoria.");
  }

  if (!["admin", "recepcion", "estilista"].includes(role)) {
    fail("/configuracion", "Rol invalido.");
  }

  if (role === "estilista" && !professionalId) {
    fail("/configuracion", "Vincula un profesional al estilista.");
  }

  if (shouldUseSupabaseStore()) {
    // Supabase Auth admin APIs require the server-only service role to invite users.
    const authAdmin = getSupabaseAdminClient();
    if (!authAdmin) {
      fail("/configuracion", "Supabase no esta configurado.");
    }

    const origin = await getAppOrigin();
    const { data, error } = await authAdmin.auth.admin.inviteUserByEmail(email, {
      data: { full_name: name, role },
      redirectTo: `${origin}/auth/recovery`,
    });

    if (error || !data.user) {
      fail("/configuracion", error?.message ?? "No se pudo invitar el usuario.");
    }

    const supabase = await requireSupabaseUser("/configuracion");

    const { error: profileError } = await supabase.from("profiles").upsert({
      id: data.user.id,
      full_name: name,
      email,
      role,
      professional_id: professionalId ?? null,
      organization_id: tenant.organizationId,
      active_branch_id: tenant.branchId,
      active: true,
    });

    if (profileError) {
      fail("/configuracion", profileError.message);
    }

    const { error: membershipError } = await supabase.from("organization_members").upsert({
      organization_id: tenant.organizationId,
      user_id: data.user.id,
      role,
      active: true,
    });
    if (membershipError) {
      fail("/configuracion", membershipError.message);
    }

    const { error: branchAccessError } = await supabase.from("user_branch_access").upsert({
      organization_id: tenant.organizationId,
      branch_id: tenant.branchId,
      user_id: data.user.id,
      active: true,
    });
    if (branchAccessError) {
      fail("/configuracion", branchAccessError.message);
    }

    await recordAudit(user, "invite", "profile", data.user.id, { role });
    done("/configuracion", "Invitacion enviada.");
  }

  if (store.profiles.some((profile) => profile.email.toLowerCase() === email)) {
    fail("/configuracion", "Ese email ya existe.");
  }

  const profile: Profile = {
    id: `profile-${randomUUID()}`,
    name,
    email,
    password,
    role,
    professionalId,
    active: true,
  };

  store.profiles.push(profile);
  await writeStore(store, user);
  await recordAudit(user, "create", "profile", profile.id, { role });
  done("/configuracion", "Usuario creado.");
}

export async function updateProfileAction(formData: FormData) {
  const user = await requireRoleForPath("/configuracion");
  const tenant = tenantScopeFromUser(user);
  const profileId = getString(formData, "profileId");
  const role = getString(formData, "role") as Role;
  const professionalId = getString(formData, "professionalId") || undefined;
  const active = getString(formData, "active") === "true";

  if (!["admin", "recepcion", "estilista"].includes(role)) {
    fail("/configuracion", "Rol invalido.");
  }

  if (profileId === user.id && !active) {
    fail("/configuracion", "No puedes desactivar tu propio usuario.");
  }

  if (role === "estilista" && !professionalId) {
    fail("/configuracion", "Vincula un profesional al estilista.");
  }

  if (shouldUseSupabaseStore()) {
    const supabase = await requireSupabaseUser("/configuracion");
    const { error } = await supabase!
      .from("profiles")
      .update({ role, professional_id: professionalId ?? null, active })
      .eq("organization_id", tenant.organizationId)
      .eq("id", profileId);
    if (error) {
      fail("/configuracion", error.message);
    }
    const { error: membershipError } = await supabase!
      .from("organization_members")
      .update({ role, active })
      .eq("organization_id", tenant.organizationId)
      .eq("user_id", profileId);
    if (membershipError) {
      fail("/configuracion", membershipError.message);
    }
    await recordAudit(user, "update", "profile", profileId, { role, active });
    done("/configuracion", "Usuario actualizado.");
  }

  const store = await readStore(user);
  store.profiles = store.profiles.map((profile) =>
    profile.id === profileId ? { ...profile, role, professionalId, active } : profile,
  );
  await writeStore(store, user);
  await recordAudit(user, "update", "profile", profileId, { role, active });
  done("/configuracion", "Usuario actualizado.");
}

export async function resetUserAccessAction(formData: FormData) {
  await requireRoleForPath("/configuracion");
  const email = getString(formData, "email");

  if (!email) {
    fail("/configuracion", "Email obligatorio.");
  }

  if (!shouldUseSupabaseStore()) {
    fail("/configuracion", "Reset disponible con Supabase.");
  }

  const supabase = await getSupabaseServerClient();
  const origin = await getAppOrigin();
  const { error } = await supabase!.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/recovery`,
  });
  if (error) {
    fail("/configuracion", error.message);
  }

  done("/configuracion", "Correo de recuperacion enviado.");
}

export async function setActiveBranchAction(formData: FormData) {
  const user = await requireRoleForPath("/dashboard");
  void user;
  const branchId = getString(formData, "branchId");
  if (!branchId) fail("/dashboard", "Sucursal invalida.");
  if (shouldUseSupabaseStore()) {
    const { error } = await (await requireSupabaseUser("/dashboard")).rpc("set_active_branch", { p_branch_id: branchId });
    if (error) fail("/dashboard", "No tienes acceso a esa sucursal.");
    done("/dashboard", "Sucursal actualizada.");
  }
  done("/dashboard", "Sucursal actualizada.");
}

export async function createAppointmentAction(formData: FormData) {
  const user = await requireRoleForPath("/agenda");
  const tenant = tenantScopeFromUser(user);
  const store = await readStore(user);
  const professionalId = getString(formData, "professionalId");
  ensureStylistProfessional(user, professionalId, "/agenda");

  const lines = parseJson<Array<{ serviceId: string; price: number; durationMinutes: number; notes?: string }>>(
    getString(formData, "serviceLines"),
    [],
  );

  const normalizedLines: AppointmentServiceLine[] = lines
    .map((line) => {
      const service = findService(store.services, line.serviceId);
      if (!service) {
        return null;
      }

      return {
        id: `appt-line-${randomUUID()}`,
        serviceId: service.id,
        serviceName: service.name,
        categoryName: service.categoryName,
        price: clampNumber(line.price || service.basePrice),
        durationMinutes: clampNumber(line.durationMinutes || service.durationMinutes, 15),
        notes: line.notes?.trim() || undefined,
      };
    })
    .filter(Boolean) as AppointmentServiceLine[];

  if (!normalizedLines.length) {
    fail("/agenda", "Agrega al menos un servicio.");
  }

  const startAt = parseRequiredDate(getString(formData, "startAt"), "/agenda", "Fecha");
  const totalDurationMinutes = normalizedLines.reduce((sum, line) => sum + line.durationMinutes, 0);

  const appointment: Appointment = {
    id: `appt-${randomUUID()}`,
    clientId: getString(formData, "clientId"),
    professionalId,
    startAt,
    notes: getString(formData, "notes"),
    status: "scheduled",
    services: normalizedLines,
    estimatedTotal: normalizedLines.reduce((sum, line) => sum + line.price, 0),
    totalDurationMinutes,
    createdAt: new Date().toISOString(),
  };

  if (!appointment.clientId || !appointment.professionalId) {
    fail("/agenda", "Cliente y profesional son obligatorios.");
  }

  if (appointmentOverlaps(store.appointments, appointment.professionalId, appointment.startAt, totalDurationMinutes)) {
    fail("/agenda", "Ese horario ya esta ocupado por una cita agendada o confirmada.");
  }

  if (shouldUseSupabaseStore()) {
    await runSupabaseRpc("/agenda", "tenant_create_appointment_transaction", {
      payload: { ...appointment, organizationId: tenant.organizationId, branchId: tenant.branchId },
    });
    await recordAudit(user, "create", "appointment", appointment.id);
    done("/agenda", "Cita creada.");
  }

  store.appointments.push(appointment);
  await writeStore(store, user);
  await recordAudit(user, "create", "appointment", appointment.id);
  done("/agenda", "Cita creada.");
}

export async function updateAppointmentStatusAction(formData: FormData) {
  const user = await requireRoleForPath("/agenda");
  const tenant = tenantScopeFromUser(user);
  const store = await readStore(user);
  const appointmentId = getString(formData, "appointmentId");
  const status = getString(formData, "status") as Appointment["status"];
  const appointment = store.appointments.find((item) => item.id === appointmentId);

  if (!appointment) {
    fail("/agenda", "Cita no encontrada.");
  }

  ensureStylistProfessional(user, appointment.professionalId, "/agenda");

  if (!["scheduled", "confirmed", "completed", "cancelled", "no_show"].includes(status)) {
    fail("/agenda", "Estado invalido.");
  }

  if (
    ["scheduled", "confirmed"].includes(status) &&
    appointmentOverlaps(
      store.appointments,
      appointment.professionalId,
      appointment.startAt,
      appointment.totalDurationMinutes,
      appointment.id,
    )
  ) {
    fail("/agenda", "Ese horario ya esta ocupado por una cita agendada o confirmada.");
  }

  if (shouldUseSupabaseStore()) {
    if (status === "cancelled") {
      await runSupabaseRpc("/agenda", "tenant_cancel_appointment_transaction", {
        p_appointment_id: appointmentId,
        p_organization_id: tenant.organizationId,
        p_cancelled_by: getString(formData, "cancelledBy") || "staff",
        p_reason: getString(formData, "cancellationReason"),
      });
    } else {
      await runSupabaseRpc("/agenda", "tenant_update_appointment_status_transaction", {
        p_appointment_id: appointmentId,
        p_status: status,
        p_organization_id: tenant.organizationId,
      });
    }
    await recordAudit(user, "status", "appointment", appointmentId, { status });
    done("/agenda", status === "cancelled" ? "Cita cancelada. Revisa el reembolso pendiente si corresponde." : "Estado actualizado.");
  }

  store.appointments = store.appointments.map((item) =>
    item.id === appointmentId ? { ...item, status } : item,
  );

  await writeStore(store, user);
  await recordAudit(user, "status", "appointment", appointmentId, { status });
  done("/agenda", "Estado actualizado.");
}

export async function convertAppointmentToSaleAction(formData: FormData) {
  const user = await requireRoleForPath("/ventas");
  const tenant = tenantScopeFromUser(user);
  const store = await readStore(user);
  const appointmentId = getString(formData, "appointmentId");
  const appointment = store.appointments.find((item) => item.id === appointmentId);

  if (!appointment || appointment.saleId) {
    fail("/ventas", "La cita no se puede convertir.");
  }

  const total = appointment.services.reduce((sum, item) => sum + item.price, 0);
  const saleId = `sale-${randomUUID()}`;

  if (shouldUseSupabaseStore()) {
    await runSupabaseRpc("/ventas", "tenant_convert_appointment_to_sale_transaction", {
      p_appointment_id: appointment.id,
      p_sale_id: saleId,
      p_sold_at: new Date().toISOString(),
      p_notes: `Creada desde cita ${appointment.id}`,
      p_organization_id: tenant.organizationId,
      p_branch_id: tenant.branchId,
    });
    await recordAudit(user, "convert", "appointment", appointment.id, { saleId });
    done("/ventas", "Venta creada.");
  }

  const sale: Sale = {
    id: saleId,
    clientId: appointment.clientId,
    professionalId: appointment.professionalId,
    origin: "appointment",
    appointmentId: appointment.id,
    soldAt: new Date().toISOString(),
    notes: `Creada desde cita ${appointment.id}`,
    items: appointment.services.map((serviceLine) => ({
      id: `sale-item-${randomUUID()}`,
      type: "service",
      referenceId: serviceLine.serviceId,
      name: serviceLine.serviceName,
      categoryName: serviceLine.categoryName,
      quantity: 1,
      unitPrice: serviceLine.price,
      total: serviceLine.price,
    })),
    total,
    amountPaid: 0,
    amountDue: total,
    paymentStatus: "unpaid",
  };

  store.sales.unshift(sale);
  store.appointments = store.appointments.map((item) =>
    item.id === appointment.id ? { ...item, saleId: sale.id, status: "completed" } : item,
  );

  await writeStore(store, user);
  await recordAudit(user, "convert", "appointment", appointment.id, { saleId: sale.id });
  done("/ventas", "Venta creada.");
}

export async function createSaleAction(formData: FormData) {
  const user = await requireRoleForPath("/ventas");
  const tenant = tenantScopeFromUser(user);
  const store = await readStore(user);
  const rawItems = parseJson<Array<{ type: "service" | "product"; referenceId: string; quantity: number; unitPrice: number }>>(
    getString(formData, "saleItems"),
    [],
  );

  const items: SaleItem[] = rawItems
    .map((item) => {
      if (item.type === "service") {
        const service = findService(store.services, item.referenceId);
        if (!service) {
          return null;
        }

        const quantity = clampNumber(item.quantity || 1, 1);
        const unitPrice = clampNumber(item.unitPrice || service.basePrice);
        return {
          id: `sale-item-${randomUUID()}`,
          type: "service",
          referenceId: service.id,
          name: service.name,
          categoryName: service.categoryName,
          quantity,
          unitPrice,
          total: quantity * unitPrice,
        };
      }

      const product = findProduct(store.products, item.referenceId);
      if (!product) {
        return null;
      }

      const quantity = clampNumber(item.quantity || 1, 1);
      if (quantity > product.currentStock) {
        fail("/ventas", `Stock insuficiente para ${product.name}.`);
      }

      const unitPrice = clampNumber(item.unitPrice || product.salePrice);
      return {
        id: `sale-item-${randomUUID()}`,
        type: "product",
        referenceId: product.id,
        name: product.name,
        categoryName: product.categoryName,
        quantity,
        unitPrice,
        total: quantity * unitPrice,
      };
    })
    .filter(Boolean) as SaleItem[];

  if (!items.length) {
    fail("/ventas", "Agrega al menos un item.");
  }

  const clientId = getString(formData, "clientId");
  const professionalId = getString(formData, "professionalId");
  const soldAt = parseRequiredDate(getString(formData, "soldAt"), "/ventas", "Fecha");

  if (!clientId || !professionalId) {
    fail("/ventas", "Cliente y profesional son obligatorios.");
  }

  const total = items.reduce((sum, item) => sum + item.total, 0);
  const saleBase: Sale = {
    id: `sale-${randomUUID()}`,
    clientId,
    professionalId,
    origin: "manual",
    soldAt,
    notes: getString(formData, "notes"),
    items,
    total,
    amountPaid: 0,
    amountDue: total,
    paymentStatus: "unpaid",
  };

  store.sales.unshift(saleBase);

  for (const item of items.filter((entry) => entry.type === "product")) {
    store.products = store.products.map((product) =>
      product.id === item.referenceId ? { ...product, currentStock: product.currentStock - item.quantity } : product,
    );

    store.inventoryMovements.unshift({
      id: `move-${randomUUID()}`,
      productId: item.referenceId ?? "",
      productName: item.name,
      type: "sale",
      quantity: -item.quantity,
      note: "Venta manual",
      happenedAt: saleBase.soldAt,
      referenceId: saleBase.id,
    });
  }

  const initialPaymentAmount = clampNumber(getNumber(formData, "initialPaymentAmount"));
  if (initialPaymentAmount > total) {
    fail("/ventas", "El pago no puede superar el total.");
  }

  if (shouldUseSupabaseStore()) {
    await runSupabaseRpc("/ventas", "tenant_create_manual_sale_transaction", {
      payload: {
        id: saleBase.id,
        clientId,
        professionalId,
        soldAt,
        notes: saleBase.notes,
        organizationId: tenant.organizationId,
        branchId: tenant.branchId,
        items,
        initialPayment:
          initialPaymentAmount > 0
            ? {
                id: `payment-${randomUUID()}`,
                amount: initialPaymentAmount,
                method: (getString(formData, "initialPaymentMethod") || "cash") as PaymentMethod,
                note: getString(formData, "initialPaymentNote"),
              }
            : { amount: 0 },
      },
    });
    await recordAudit(user, "create", "sale", saleBase.id, { total });
    done("/ventas", "Venta guardada.");
  }

  if (initialPaymentAmount > 0) {
    store.payments.unshift({
      id: `payment-${randomUUID()}`,
      saleId: saleBase.id,
      amount: initialPaymentAmount,
      method: (getString(formData, "initialPaymentMethod") || "cash") as PaymentMethod,
      paidAt: saleBase.soldAt,
      note: getString(formData, "initialPaymentNote"),
    });

    store.sales = store.sales.map((sale) =>
      sale.id === saleBase.id ? updateSaleBalances(sale, initialPaymentAmount) : sale,
    );
  }

  await writeStore(store, user);
  await recordAudit(user, "create", "sale", saleBase.id, { total });
  done("/ventas", "Venta guardada.");
}

export async function recordPaymentAction(formData: FormData) {
  const user = await requireRoleForPath("/ventas");
  const tenant = tenantScopeFromUser(user);
  const store = await readStore(user);
  const saleId = getString(formData, "saleId");
  const amount = clampNumber(getNumber(formData, "amount"));

  if (!saleId || amount <= 0) {
    fail("/ventas", "Monto invalido.");
  }

  const sale = store.sales.find((item) => item.id === saleId);
  if (!sale) {
    fail("/ventas", "Venta no encontrada.");
  }

  if (sale.amountDue <= 0) {
    fail("/ventas", "La venta ya esta pagada.");
  }

  if (amount > sale.amountDue) {
    fail("/ventas", "El abono supera el saldo.");
  }

  const paidAt = parseRequiredDate(getString(formData, "paidAt"), "/ventas", "Fecha");
  const paymentId = `payment-${randomUUID()}`;

  if (shouldUseSupabaseStore()) {
    await runSupabaseRpc("/ventas", "tenant_record_payment_transaction", {
      p_sale_id: saleId,
      p_payment_id: paymentId,
      p_amount: amount,
      p_method: (getString(formData, "method") || "cash") as PaymentMethod,
      p_paid_at: paidAt,
      p_note: getString(formData, "note"),
      p_organization_id: tenant.organizationId,
      p_branch_id: tenant.branchId,
    });
    await recordAudit(user, "payment", "sale", saleId, { amount });
    done("/ventas", "Abono guardado.");
  }

  store.payments.unshift({
    id: paymentId,
    saleId,
    amount,
    method: (getString(formData, "method") || "cash") as PaymentMethod,
    paidAt,
    note: getString(formData, "note"),
  });

  store.sales = store.sales.map((item) =>
    item.id === saleId ? updateSaleBalances(item, item.amountPaid + amount) : item,
  );

  await writeStore(store, user);
  await recordAudit(user, "payment", "sale", saleId, { amount });
  done("/ventas", "Abono guardado.");
}

export async function createPurchaseAction(formData: FormData) {
  const user = await requireRoleForPath("/compras");
  const tenant = tenantScopeFromUser(user);
  const store = await readStore(user);
  const supplier = getString(formData, "supplier");
  const categoryName = getString(formData, "categoryName");

  if (!supplier || !categoryName) {
    fail("/compras", "Proveedor y categoria son obligatorios.");
  }

  const items = parseJson<Array<{ productId: string; quantity: number; unitCost: number }>>(
    getString(formData, "purchaseItems"),
    [],
  )
    .map((item) => {
      const product = findProduct(store.products, item.productId);
      if (!product) {
        return null;
      }

      const quantity = clampNumber(item.quantity, 1);
      const unitCost = clampNumber(item.unitCost || product.cost, 1);

      const purchaseItem: PurchaseItem = {
        id: `purchase-item-${randomUUID()}`,
        productId: product.id,
        productName: product.name,
        quantity,
        unitCost,
        total: quantity * unitCost,
      };

      return purchaseItem;
    })
    .filter(Boolean) as PurchaseItem[];

  if (!items.length) {
    fail("/compras", "Agrega productos a la compra.");
  }

  const purchaseId = `purchase-${randomUUID()}`;
  const purchasedAt = parseRequiredDate(getString(formData, "purchasedAt"), "/compras", "Fecha");
  const total = items.reduce((sum, item) => sum + item.total, 0);

  if (shouldUseSupabaseStore()) {
    await runSupabaseRpc("/compras", "tenant_create_purchase_transaction", {
      payload: {
        id: purchaseId,
        purchasedAt,
        supplier,
        categoryName,
        notes: getString(formData, "notes"),
        organizationId: tenant.organizationId,
        branchId: tenant.branchId,
        items,
      },
    });
    await recordAudit(user, "create", "purchase", purchaseId, { total });
    done("/compras", "Compra guardada.");
  }

  store.purchases.unshift({
    id: purchaseId,
    purchasedAt,
    supplier,
    categoryName,
    notes: getString(formData, "notes"),
    items,
    total,
  });

  for (const item of items) {
    store.products = store.products.map((product) =>
      product.id === item.productId
        ? {
            ...product,
            currentStock: product.currentStock + item.quantity,
            cost: item.unitCost,
          }
        : product,
    );

    store.inventoryMovements.unshift({
      id: `move-${randomUUID()}`,
      productId: item.productId,
      productName: item.productName,
      type: "purchase",
      quantity: item.quantity,
      unitCost: item.unitCost,
      note: "Ingreso por compra",
      happenedAt: purchasedAt,
      referenceId: purchaseId,
    });
  }

  await writeStore(store, user);
  await recordAudit(user, "create", "purchase", purchaseId, { total });
  done("/compras", "Compra guardada.");
}

export async function adjustStockAction(formData: FormData) {
  const user = await requireRoleForPath("/inventario");
  const tenant = tenantScopeFromUser(user);
  const store = await readStore(user);
  const productId = getString(formData, "productId");
  const quantityChange = getNumber(formData, "quantityChange");
  const happenedAt = parseRequiredDate(getString(formData, "happenedAt"), "/inventario", "Fecha");
  const product = store.products.find((item) => item.id === productId);

  if (!product || !quantityChange) {
    fail("/inventario", "Producto o cantidad invalida.");
  }

  const nextStock = product.currentStock + quantityChange;
  if (nextStock < 0) {
    fail("/inventario", "El stock no puede quedar negativo.");
  }

  const movementId = `move-${randomUUID()}`;

  if (shouldUseSupabaseStore()) {
    await runSupabaseRpc("/inventario", "tenant_adjust_stock_transaction", {
      p_product_id: productId,
      p_movement_id: movementId,
      p_quantity_change: quantityChange,
      p_happened_at: happenedAt,
      p_note: getString(formData, "note") || "Ajuste manual",
      p_organization_id: tenant.organizationId,
      p_branch_id: tenant.branchId,
    });
    await recordAudit(user, "adjust", "product", productId, { quantityChange });
    done("/inventario", "Stock actualizado.");
  }

  store.products = store.products.map((item) =>
    item.id === productId ? { ...item, currentStock: nextStock } : item,
  );

  store.inventoryMovements.unshift({
    id: movementId,
    productId,
    productName: product.name,
    type: "adjustment",
    quantity: quantityChange,
    note: getString(formData, "note") || "Ajuste manual",
    happenedAt,
  });

  await writeStore(store, user);
  await recordAudit(user, "adjust", "product", productId, { quantityChange });
  done("/inventario", "Stock actualizado.");
}

export async function createExpenseAction(formData: FormData) {
  const user = await requireRoleForPath("/gastos");
  const tenant = tenantScopeFromUser(user);
  const store = await readStore(user);
  const categoryName = getString(formData, "categoryName");
  const description = getString(formData, "description");
  const amount = clampNumber(getNumber(formData, "amount"));

  if (!categoryName || !description || amount <= 0) {
    fail("/gastos", "Categoria, descripcion y monto son obligatorios.");
  }

  const category = upsertCategory(store.expenseCategories, categoryName, "exp-cat");
  const expense = {
    id: `expense-${randomUUID()}`,
    spentAt: parseRequiredDate(getString(formData, "spentAt"), "/gastos", "Fecha"),
    categoryId: category.id,
    categoryName: category.name,
    description,
    amount,
  };

  if (shouldUseSupabaseStore()) {
    const supabaseCategory = await upsertSupabaseCategory(
      "/gastos",
      "expense_categories",
      category.id,
      category.name,
      tenant.organizationId,
    );
    await runSupabaseRpc("/gastos", "tenant_create_expense_transaction", {
      payload: {
        ...expense,
        categoryId: supabaseCategory.id,
        categoryName: supabaseCategory.name,
        organizationId: tenant.organizationId,
        branchId: tenant.branchId,
      },
    });
    await recordAudit(user, "create", "expense", expense.id, { amount });
    done("/gastos", "Gasto guardado.");
  }

  store.expenses.unshift(expense);
  await writeStore(store, user);
  await recordAudit(user, "create", "expense", expense.id, { amount });
  done("/gastos", "Gasto guardado.");
}

export async function startImpersonationAction(formData: FormData) {
  const user = await requireRoleForPath("/super-admin");
  const organizationId = getString(formData, "organizationId");
  const reason = getString(formData, "reason");
  if (user.role !== "super_admin" || !organizationId) fail("/super-admin", "Access denied.");
  const supabase = await requireSupabaseUser("/super-admin");
  const { error } = await supabase.rpc("start_impersonation", { p_organization_id: organizationId, p_reason: reason });
  if (error) fail("/super-admin", "No se pudo iniciar soporte.");
  done("/dashboard", "Soporte iniciado.");
}

export async function endImpersonationAction() {
  const user = await getSessionUser();
  if (!user?.isPlatformAdmin) fail("/super-admin", "Access denied.");
  const supabase = await requireSupabaseUser("/super-admin");
  const { error } = await supabase.rpc("end_impersonation");
  if (error) fail("/super-admin", "No se pudo finalizar soporte.");
  done("/super-admin", "Soporte finalizado.");
}
export async function createWorkingHoursAction(formData: FormData) {
  const user = await requireRoleForPath("/configuracion");
  const tenant = tenantScopeFromUser(user);
  const professionalId = getString(formData, "professionalId");
  const weekday = getNumber(formData, "weekday");
  const startsAt = getString(formData, "startsAt");
  const endsAt = getString(formData, "endsAt");
  if (!professionalId || !Number.isInteger(weekday) || weekday < 0 || weekday > 6 || !startsAt || !endsAt || endsAt <= startsAt) fail("/agenda/disponibilidad", "Horario invalido.");
  if (!shouldUseSupabaseStore()) done("/agenda/disponibilidad", "Disponible con Supabase.");
  const supabase = await requireSupabaseUser("/agenda/disponibilidad");
  const { error } = await supabase.from("professional_working_hours").insert({ organization_id: tenant.organizationId, branch_id: tenant.branchId, professional_id: professionalId, weekday, starts_at: startsAt, ends_at: endsAt });
  if (error) fail("/agenda/disponibilidad", "No se pudo guardar el horario.");
  await recordAudit(user, "create_working_hours", "professional", professionalId, { weekday, startsAt, endsAt });
  done("/agenda/disponibilidad", "Horario guardado.");
}

export async function createTimeOffAction(formData: FormData) {
  const user = await requireRoleForPath("/configuracion");
  const tenant = tenantScopeFromUser(user);
  const professionalId = getString(formData, "professionalId");
  const startsAt = parseRequiredDate(getString(formData, "startsAt"), "/agenda/disponibilidad", "Inicio");
  const endsAt = parseRequiredDate(getString(formData, "endsAt"), "/agenda/disponibilidad", "Fin");
  if (!professionalId || new Date(endsAt) <= new Date(startsAt)) fail("/agenda/disponibilidad", "Bloqueo invalido.");
  if (!shouldUseSupabaseStore()) done("/agenda/disponibilidad", "Disponible con Supabase.");
  const supabase = await requireSupabaseUser("/agenda/disponibilidad");
  const { error } = await supabase.from("professional_time_off").insert({ organization_id: tenant.organizationId, branch_id: tenant.branchId, professional_id: professionalId, starts_at: startsAt, ends_at: endsAt, reason: getString(formData, "reason") });
  if (error) fail("/agenda/disponibilidad", "No se pudo guardar el bloqueo.");
  await recordAudit(user, "create_time_off", "professional", professionalId, { startsAt, endsAt });
  done("/agenda/disponibilidad", "Bloqueo guardado.");
}
export async function connectSumUpAction(formData: FormData) {
  const user = await requireRoleForPath("/configuracion");
  const tenant = tenantScopeFromUser(user);
  const apiKey = getString(formData, "apiKey");
  const merchantCode = getString(formData, "merchantCode") || "sumup";
  if (apiKey.length < 12) fail("/configuracion", "Credencial SumUp invalida.");
  if (!shouldUseSupabaseStore()) fail("/configuracion", "Requiere Supabase.");
  try {
    const credentials = encryptSumUpCredentials({ apiKey });
    const { error } = await (await requireSupabaseUser("/configuracion")).from("payment_provider_connections").upsert({
      organization_id: tenant.organizationId,
      provider: "sumup",
      merchant_code: merchantCode,
      encrypted_credentials: credentials.encrypted,
      credential_iv: credentials.iv,
      active: true,
      disconnected_at: null,
    }, { onConflict: "organization_id" });
    if (error) fail("/configuracion", "No se pudo guardar la conexion.");
  } catch {
    fail("/configuracion", "No se pudo proteger la conexion de pagos.");
  }
  await recordAudit(user, "connect", "payment_provider", "sumup");
  done("/configuracion", "SumUp conectado.");
}

export async function disconnectSumUpAction() {
  const user = await requireRoleForPath("/configuracion");
  const tenant = tenantScopeFromUser(user);
  if (!shouldUseSupabaseStore()) fail("/configuracion", "Requiere Supabase.");
  const { error } = await (await requireSupabaseUser("/configuracion")).from("payment_provider_connections").update({ active: false, disconnected_at: new Date().toISOString() }).eq("organization_id", tenant.organizationId).eq("provider", "sumup");
  if (error) fail("/configuracion", "No se pudo desconectar SumUp.");
  await recordAudit(user, "disconnect", "payment_provider", "sumup");
  done("/configuracion", "SumUp desconectado.");
}
export async function setOrganizationSubscriptionAction(formData: FormData) {
  const user = await requireSession();
  if (user.role !== "super_admin") fail("/super-admin", "Acceso denegado.");
  const organizationId = getString(formData, "organizationId");
  const planId = getString(formData, "planId");
  const status = getString(formData, "status");
  const periodEnd = getString(formData, "periodEnd");
  const gracePeriodEnd = getString(formData, "gracePeriodEnd");
  if (!organizationId || !planId || !["trialing", "active", "past_due", "suspended", "cancelled"].includes(status) || !periodEnd) fail("/super-admin", "Suscripcion invalida.");
  const supabase = await requireSupabaseUser("/super-admin");
  const { data: subscription, error } = await supabase.from("organization_subscriptions").upsert({ organization_id: organizationId, plan_id: planId, status, current_period_start: new Date().toISOString(), current_period_end: new Date(periodEnd).toISOString(), grace_period_end: gracePeriodEnd ? new Date(gracePeriodEnd).toISOString() : null, updated_at: new Date().toISOString() }, { onConflict: "organization_id" }).select("id").single();
  if (error || !subscription) fail("/super-admin", "No se pudo actualizar la suscripcion.");
  await supabase.from("subscription_events").insert({ organization_id: organizationId, subscription_id: subscription.id, action: "subscription_updated", actor_id: user.id, details: { planId, status, periodEnd } });
  done("/super-admin", "Suscripcion actualizada.");
}