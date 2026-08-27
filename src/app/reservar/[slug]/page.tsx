import { notFound } from "next/navigation";

import { PublicBookingForm } from "@/components/public-booking/public-booking-form";
import { startPublicBookingCheckoutAction } from "./actions";
import { getSupabaseAdminClient } from "@/lib/supabase";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function PublicBookingPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const { slug } = await params; const query = (await searchParams) ?? {}; const supabase = getSupabaseAdminClient(); if (!supabase) notFound();
  const { data: organization } = await supabase.from("organizations").select("id,name,slug").eq("slug", slug).eq("active", true).maybeSingle(); if (!organization) notFound();
  const [{ data: branches }, { data: professionals }, { data: assignments }, { data: services }] = await Promise.all([
    supabase.from("branches").select("id,name").eq("organization_id", organization.id).eq("active", true).order("name"),
    supabase.from("professionals").select("id,full_name").eq("organization_id", organization.id).eq("active", true).order("full_name"),
    supabase.from("professional_branches").select("professional_id,branch_id").eq("organization_id", organization.id).eq("active", true),
    supabase.from("services").select("id,name,base_price,duration_minutes").eq("organization_id", organization.id).eq("active", true).order("name"),
  ]);
  const branchIdsByProfessional = new Map<string,string[]>(); for (const assignment of assignments ?? []) branchIdsByProfessional.set(String(assignment.professional_id), [...(branchIdsByProfessional.get(String(assignment.professional_id)) ?? []), String(assignment.branch_id)]);
  const error = typeof query.error === "string" ? query.error : ""; const hold = typeof query.hold === "string" ? query.hold : ""; const token = typeof query.token === "string" ? query.token : ""; const deposit = Number(typeof query.deposit === "string" ? query.deposit : 0);
  return <main className="min-h-screen bg-stone-100 px-4 py-10"><div className="mx-auto max-w-2xl"><header className="mb-6"><p className="text-sm font-semibold text-teal-700">Reserva online</p><h1 className="mt-1 text-3xl font-semibold text-stone-900">{organization.name}</h1><p className="mt-2 text-stone-600">Elige sucursal, servicio, profesional y horario. El anticipo es el 50%.</p></header>{hold ? <section className="rounded-2xl bg-teal-700 p-6 text-white"><h2 className="text-xl font-semibold">Horario reservado temporalmente</h2><p className="mt-2">Anticipo: {formatCurrency(deposit)}. Continúa al pago seguro.</p><form action={startPublicBookingCheckoutAction} className="mt-4"><input name="slug" type="hidden" value={slug}/><input name="holdId" type="hidden" value={hold}/><input name="token" type="hidden" value={token}/><button className="rounded-lg bg-white px-4 py-2 font-semibold text-teal-800" type="submit">Continuar al pago</button></form></section> : <PublicBookingForm slug={slug} error={error} branches={(branches ?? []).map((item) => ({ id:String(item.id),name:String(item.name) }))} professionals={(professionals ?? []).map((item) => ({ id:String(item.id),name:String(item.full_name),branchIds:branchIdsByProfessional.get(String(item.id)) ?? [] }))} services={(services ?? []).map((item) => ({ id:String(item.id),name:String(item.name),basePrice:Number(item.base_price),durationMinutes:Number(item.duration_minutes) }))}/>}</div></main>;
}