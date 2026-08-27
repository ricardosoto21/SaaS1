"use server";

import { createHash, randomBytes } from "node:crypto";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { createBookingCheckout } from "@/lib/payments/booking";
import { enforcePublicRateLimit } from "@/lib/security/public-rate-limit";
import { getSupabaseServerClient } from "@/lib/supabase";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function bookingAccessCookieName(holdId: string) {
  return `booking_access_${holdId}`;
}

async function setBookingAccessCookie(slug: string, holdId: string, token: string) {
  const cookieStore = await cookies();
  cookieStore.set(bookingAccessCookieName(holdId), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: `/reservar/${encodeURIComponent(slug)}`,
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function createPublicBookingHoldAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "").trim();
  const branchId = String(formData.get("branchId") ?? "");
  const professionalId = String(formData.get("professionalId") ?? "");
  const startAt = String(formData.get("startAt") ?? "");
  const serviceIds = formData.getAll("serviceId").map(String).filter(Boolean);
  const clientName = String(formData.get("clientName") ?? "").trim();
  const clientPhone = String(formData.get("clientPhone") ?? "").trim();
  const clientEmail = String(formData.get("clientEmail") ?? "").trim();
  const accessToken = randomBytes(24).toString("base64url");
  const accessTokenHash = createHash("sha256").update(accessToken).digest("hex");
  if (!slug || !UUID.test(branchId) || !professionalId || !startAt || !serviceIds.length || clientName.length < 2 || clientPhone.length < 6) redirect(`/reservar/${slug}?error=Datos%20incompletos`);
  if (!(await enforcePublicRateLimit("booking", `${slug}:${clientPhone}`, 8, 900))) redirect(`/reservar/${slug}?error=Intenta%20nuevamente%20en%20unos%20minutos`);
  const supabase = await getSupabaseServerClient();
  if (!supabase) redirect(`/reservar/${slug}?error=Servicio%20no%20disponible`);
  const { data, error } = await supabase.rpc("create_public_booking_hold", { p_slug: slug, p_branch_id: branchId, p_professional_id: professionalId, p_start_at: startAt, p_services: serviceIds.map((service_id) => ({ service_id })), p_client_name: clientName, p_client_phone: clientPhone, p_client_email: clientEmail || null, p_client_access_token_hash: accessTokenHash });
  if (error || !data) redirect(`/reservar/${slug}?error=Horario%20no%20disponible`);
  const holdId = String(data.holdId);
  await setBookingAccessCookie(slug, holdId, accessToken);
  redirect(`/reservar/${slug}?hold=${encodeURIComponent(holdId)}&deposit=${encodeURIComponent(String(data.depositAmount))}`);
}

export async function startPublicBookingCheckoutAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "").trim();
  const holdId = String(formData.get("holdId") ?? "");
  if (!slug || !UUID.test(holdId)) redirect(`/reservar/${slug}?error=Reserva%20invalida`);
  const token = (await cookies()).get(bookingAccessCookieName(holdId))?.value ?? "";
  if (token.length < 24) redirect(`/reservar/${slug}?error=Reserva%20invalida`);
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? (host ? `${protocol}://${host}` : "http://localhost:3001");
  try {
    const url = await createBookingCheckout(holdId, `${origin}/reservar/${encodeURIComponent(slug)}/gestionar?hold=${encodeURIComponent(holdId)}&payment=returned`);
    redirect(url);
  } catch {
    redirect(`/reservar/${slug}?hold=${encodeURIComponent(holdId)}&error=Pago%20no%20disponible`);
  }
}
export async function managePublicBookingAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "").trim();
  const holdId = String(formData.get("holdId") ?? "");
  const action = String(formData.get("action") ?? "");
  const startAt = String(formData.get("startAt") ?? "");
  const token = (await cookies()).get(bookingAccessCookieName(holdId))?.value ?? "";
  if (!slug || !UUID.test(holdId) || token.length < 24 || !["cancel", "reschedule"].includes(action)) redirect(`/reservar/${slug}/gestionar?error=Solicitud%20invalida`);
  const base = `/reservar/${slug}/gestionar?hold=${encodeURIComponent(holdId)}`;
  if (!(await enforcePublicRateLimit("booking-management", `${slug}:${holdId}`, 10, 900))) redirect(`${base}&error=Intenta%20nuevamente%20más%20tarde`);
  const supabase = await getSupabaseServerClient();
  if (!supabase) redirect(`/reservar/${slug}/gestionar?error=Servicio%20no%20disponible`);
  const { data, error } = await supabase.rpc("client_booking_action", { p_slug: slug, p_hold_id: holdId, p_token: token, p_action: action, p_start_at: action === "reschedule" ? startAt : null, p_reason: String(formData.get("reason") ?? "").trim() });
  if (error || !data) redirect(`${base}&error=${encodeURIComponent("No fue posible actualizar la reserva.")}`);
  redirect(`${base}&success=${encodeURIComponent(action === "cancel" ? "Reserva cancelada. El reembolso quedo en revision." : "Reserva reprogramada.")}`);
}
