import Link from "next/link";
import { redirect } from "next/navigation";

import { SubmitButton } from "@/components/forms/submit-button";
import { PageHeader } from "@/components/page-header";
import { PageNotice } from "@/components/page-notice";
import { createTimeOffAction, createWorkingHoursAction } from "@/lib/actions";
import { requireSession } from "@/lib/auth";
import { getVisibleProfessionals, roleCanAccess } from "@/lib/data";
import { readStore } from "@/lib/store";
import { getSupabaseServerClient } from "@/lib/supabase";

const days = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];
export const dynamic = "force-dynamic";

export default async function DisponibilidadPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireSession();
  if (!roleCanAccess(user.role, "/configuracion")) redirect("/agenda");
  const store = await readStore(user);
  const professionals = getVisibleProfessionals(store, user);
  const supabase = await getSupabaseServerClient();
  const [hoursResponse, timeOffResponse] = await Promise.all([
    supabase?.from("professional_working_hours").select("id,professional_id,weekday,starts_at,ends_at").eq("branch_id", user.branchId ?? "").order("weekday"),
    supabase?.from("professional_time_off").select("id,professional_id,starts_at,ends_at,reason").eq("branch_id", user.branchId ?? "").gte("ends_at", new Date().toISOString()).order("starts_at"),
  ]);
  const hours = hoursResponse?.data ?? [];
  const timeOff = timeOffResponse?.data ?? [];
  const params = (await searchParams) ?? {};
  return <div className="space-y-4">
    <div className="flex items-start justify-between gap-3"><PageHeader eyebrow="Agenda" title="Disponibilidad" description="Jornadas y bloqueos de la sucursal activa." /><Link className="btn-secondary" href="/agenda">Volver a agenda</Link></div>
    <PageNotice searchParams={params} />
    <section className="grid gap-4 xl:grid-cols-2">
      <article className="surface rounded-[1rem] p-5"><h2 className="text-lg font-semibold">Jornada semanal</h2><form action={createWorkingHoursAction} className="mt-4 grid gap-3"><select className="select-base" name="professionalId" required><option value="">Profesional</option>{professionals.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select><select className="select-base" name="weekday">{days.map((day,index)=><option key={day} value={index}>{day}</option>)}</select><div className="grid grid-cols-2 gap-3"><input className="input-base" name="startsAt" type="time" required/><input className="input-base" name="endsAt" type="time" required/></div><SubmitButton label="Agregar jornada" pendingLabel="Guardando..." /></form></article>
      <article className="surface rounded-[1rem] p-5"><h2 className="text-lg font-semibold">Bloqueo o ausencia</h2><form action={createTimeOffAction} className="mt-4 grid gap-3"><select className="select-base" name="professionalId" required><option value="">Profesional</option>{professionals.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select><input className="input-base" name="startsAt" type="datetime-local" required/><input className="input-base" name="endsAt" type="datetime-local" required/><input className="input-base" name="reason" placeholder="Motivo"/><SubmitButton label="Bloquear horario" pendingLabel="Guardando..." /></form></article>
    </section>
    <section className="grid gap-4 xl:grid-cols-2"><article className="surface rounded-[1rem] p-5"><h2 className="text-lg font-semibold">Jornadas configuradas</h2><div className="mt-4 space-y-2 text-sm">{hours.map((item)=><p key={item.id}>{professionals.find((p)=>p.id===item.professional_id)?.name ?? "Profesional"} · {days[item.weekday]} · {item.starts_at} a {item.ends_at}</p>)}</div></article><article className="surface rounded-[1rem] p-5"><h2 className="text-lg font-semibold">Próximos bloqueos</h2><div className="mt-4 space-y-2 text-sm">{timeOff.map((item)=><p key={item.id}>{professionals.find((p)=>p.id===item.professional_id)?.name ?? "Profesional"} · {new Date(item.starts_at).toLocaleString("es-CL")} · {item.reason || "Sin motivo"}</p>)}</div></article></section>
  </div>;
}
