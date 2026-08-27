"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { createBookingCheckout } from "@/lib/payments/booking";
import { enforcePublicRateLimit } from "@/lib/security/public-rate-limit";
import { getSupabaseServerClient } from "@/lib/supabase";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function createPublicBookingHoldAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "").trim();
  const branchId = String(formData.get("branchId") ?? "");
  const professionalId = String(formData.get("professionalId") ?? "");
  const startAt = String(formData.get("startAt") ?? "");
  const serviceIds = formData.getAll("serviceId").map(String).filter(Boolean);
  const clientName = String(formData.get("clientName") ?? "").trim();
  const clientPhone = String(formData.get("clientPhone") ?? "").trim();
  const clientEmail = String(formData.get("clientEmail") ?? "").trim();
  if (!slug || !UUID.test(branchId) || !professionalId || !startAt || !serviceIds.length || clientName.length < 2 || clientPhone.length < 6) redirect(`/reservar/${slug}?error=Datos%20incompletos`);
  if (!(await enforcePublicRateLimit("booking", `${slug}:${clientPhone}`, 8, 900))) redirect(`/reservar/${slug}?error=Intenta%20nuevamente%20en%20unos%20minutos`);
  const supabase = await getSupabaseServerClient();
  if (!supabase) redirect(`/reservar/${slug}?error=Servicio%20no%20disponible`);
  const { data, error } = await supabase.rpc("create_public_booking_hold", { p_slug: slug, p_branch_id: branchId, p_professional_id: professionalId, p_start_at: startAt, p_services: serviceIds.map((service_id) => ({ service_id })), p_client_name: clientName, p_client_phone: clientPhone, p_client_email: clientEmail || null });
  if (error || !data) redirect(`/reservar/${slug}?error=Horario%20no%20disponible`);
  redirect(`/reservar/${slug}?hold=${encodeURIComponent(String(data.holdId))}&deposit=${encodeURIComponent(String(data.depositAmount))}`);
}

export async function startPublicBookingCheckoutAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "").trim();
  const holdId = String(formData.get("holdId") ?? "");
  if (!slug || !UUID.test(holdId)) redirect(`/reservar/${slug}?error=Reserva%20invalida`);
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? (host ? `${protocol}://${host}` : "http://localhost:3001");
  try {
    const url = await createBookingCheckout(holdId, `${origin}/reservar/${encodeURIComponent(slug)}?payment=returned`);
    redirect(url);
  } catch {
    redirect(`/reservar/${slug}?hold=${encodeURIComponent(holdId)}&error=Pago%20no%20disponible`);
  }
}