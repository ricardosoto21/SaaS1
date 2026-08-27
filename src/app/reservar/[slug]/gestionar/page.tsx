import Link from "next/link";
import { notFound } from "next/navigation";

import { managePublicBookingAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function ManageBookingPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const { slug } = await params;
  const query = (await searchParams) ?? {};
  const hold = typeof query.hold === "string" ? query.hold : "";
  const token = typeof query.token === "string" ? query.token : "";
  const error = typeof query.error === "string" ? query.error : "";
  const success = typeof query.success === "string" ? query.success : "";
  if (!hold || token.length < 24) notFound();

  return <main className="min-h-screen bg-stone-100 px-4 py-10"><section className="mx-auto max-w-xl rounded-2xl bg-white p-7 shadow-sm"><Link className="text-sm font-semibold text-teal-700" href={`/reservar/${slug}`}>Reserva online</Link><p className="label mt-6">Gestionar reserva</p><h1 className="mt-2 text-3xl font-semibold text-stone-900">Tu cita</h1><p className="mt-3 text-stone-600">Puedes reprogramar o cancelar hasta 4 horas antes. Al cancelar dentro del plazo, el reembolso queda registrado para revisión del salón.</p>{error ? <p className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}{success ? <p className="mt-5 rounded-lg bg-teal-50 p-3 text-sm text-teal-800">{success}</p> : null}<form action={managePublicBookingAction} className="mt-6 space-y-3"><input name="slug" type="hidden" value={slug}/><input name="holdId" type="hidden" value={hold}/><input name="token" type="hidden" value={token}/><input className="input-base" name="startAt" required type="datetime-local"/><input name="action" type="hidden" value="reschedule"/><button className="btn-primary w-full" type="submit">Reprogramar cita</button></form><form action={managePublicBookingAction} className="mt-4 space-y-3"><input name="slug" type="hidden" value={slug}/><input name="holdId" type="hidden" value={hold}/><input name="token" type="hidden" value={token}/><input name="action" type="hidden" value="cancel"/><textarea className="textarea-base min-h-20" name="reason" placeholder="Motivo opcional"/><button className="btn-secondary w-full" type="submit">Cancelar cita</button></form></section></main>;
}