import { notFound } from "next/navigation";

import { createPublicBookingHoldAction, startPublicBookingCheckoutAction } from "./actions";
import { getSupabaseAdminClient } from "@/lib/supabase";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function PublicBookingPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const { slug } = await params;
  const query = (await searchParams) ?? {};
  const supabase = getSupabaseAdminClient();
  if (!supabase) notFound();
  const { data: organization } = await supabase.from("organizations").select("id,name,slug").eq("slug", slug).eq("active", true).maybeSingle();
  if (!organization) notFound();
  const [{ data: branches }, { data: professionals }, { data: services }] = await Promise.all([
    supabase.from("branches").select("id,name").eq("organization_id", organization.id).eq("active", true).order("name"),
    supabase.from("professionals").select("id,full_name").eq("organization_id", organization.id).eq("active", true).order("full_name"),
    supabase.from("services").select("id,name,base_price,duration_minutes").eq("organization_id", organization.id).eq("active", true).order("name"),
  ]);
  const error = typeof query.error === "string" ? query.error : "";
  const hold = typeof query.hold === "string" ? query.hold : "";
  const deposit = Number(typeof query.deposit === "string" ? query.deposit : 0);
  return <main className="min-h-screen bg-stone-100 px-4 py-10"><div className="mx-auto max-w-2xl"><header className="mb-6"><p className="text-sm font-semibold text-teal-700">Reserva online</p><h1 className="mt-1 text-3xl font-semibold text-stone-900">{organization.name}</h1><p className="mt-2 text-stone-600">Elige servicio, profesional y horario. El anticipo es el 50%.</p></header>{hold ? <section className="rounded-2xl bg-teal-700 p-6 text-white"><h2 className="text-xl font-semibold">Horario reservado temporalmente</h2><p className="mt-2">Anticipo: {formatCurrency(deposit)}. En el siguiente paso se abrirá el pago seguro.</p><form action={startPublicBookingCheckoutAction} className="mt-4"><input name="slug" type="hidden" value={slug}/><input name="holdId" type="hidden" value={hold}/><button className="rounded-lg bg-white px-4 py-2 font-semibold text-teal-800" type="submit">Continuar al pago</button></form></section> : <form action={createPublicBookingHoldAction} className="rounded-2xl bg-white p-6 shadow-sm"><input name="slug" type="hidden" value={slug}/>{error ? <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}<div className="grid gap-4"><select className="input-base" name="branchId" required><option value="">Sucursal</option>{(branches ?? []).map((branch)=><option key={branch.id} value={branch.id}>{branch.name}</option>)}</select><select className="input-base" name="professionalId" required><option value="">Profesional</option>{(professionals ?? []).map((professional)=><option key={professional.id} value={professional.id}>{professional.full_name}</option>)}</select><input className="input-base" name="startAt" type="datetime-local" required/><fieldset className="space-y-2"><legend className="font-medium">Servicios</legend>{(services ?? []).map((service)=><label className="flex items-center justify-between rounded-lg border border-stone-200 p-3" key={service.id}><span><input className="mr-2" name="serviceId" type="checkbox" value={service.id}/>{service.name}</span><span className="text-sm text-stone-600">{formatCurrency(Number(service.base_price))} · {service.duration_minutes} min</span></label>)}</fieldset><input className="input-base" name="clientName" placeholder="Nombre" required/><input className="input-base" name="clientPhone" placeholder="Teléfono" required/><input className="input-base" name="clientEmail" placeholder="Email" type="email"/><button className="btn-primary" type="submit">Reservar y pagar anticipo</button></div></form>}</div></main>;
}
