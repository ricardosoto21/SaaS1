import { isValid, parseISO } from "date-fns";
import { CalendarDays, CheckCircle2, Clock3, PlusCircle } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AgendaCalendar, type AgendaCalendarView } from "@/components/agenda-calendar";
import { EmptyState } from "@/components/empty-state";
import { AppointmentForm } from "@/components/forms/appointment-form";
import { PageHeader } from "@/components/page-header";
import { PageNotice } from "@/components/page-notice";
import { Pagination } from "@/components/pagination";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import {
  convertAppointmentToSaleAction,
  createAppointmentAction,
  updateAppointmentStatusAction,
} from "@/lib/actions";
import { requireSession } from "@/lib/auth";
import {
  getAppointmentsReadyToClose,
  getClientName,
  getProfessionalName,
  getVisibleAppointments,
  getVisibleClients,
  getVisibleProfessionals,
  roleCanAccess,
} from "@/lib/data";
import { buildHref, getParam, isInsideOptionalRange, matchesQuery, paginateItems } from "@/lib/listing";
import { readStore } from "@/lib/store";
import { formatCurrency, formatDateTime } from "@/lib/utils";

interface AgendaPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export const dynamic = "force-dynamic";

function getCalendarView(value: string): AgendaCalendarView {
  return value === "day" || value === "month" ? value : "week";
}

function getCalendarDate(value: string) {
  if (!value) {
    return new Date();
  }

  const parsed = parseISO(value);
  return isValid(parsed) ? parsed : new Date();
}

export default async function AgendaPage({ searchParams }: AgendaPageProps) {
  const user = await requireSession();
  if (!roleCanAccess(user.role, "/agenda")) {
    redirect("/dashboard");
  }

  const params = (await searchParams) ?? {};
  const store = await readStore(user);
  const appointments = getVisibleAppointments(store, user);
  const professionals = getVisibleProfessionals(store, user);
  const clients = getVisibleClients(store);
  const readyToClose = getAppointmentsReadyToClose(store, user);
  const calendarView = getCalendarView(getParam(params, "view"));
  const calendarDate = getCalendarDate(getParam(params, "date"));
  const today = new Date().toISOString().slice(0, 10);
  const calendarAppointments = appointments.filter((appointment) => !["cancelled", "no_show"].includes(appointment.status));
  const todayAppointments = calendarAppointments.filter((appointment) => appointment.startAt.startsWith(today));

  const filters = {
    from: getParam(params, "from"),
    to: getParam(params, "to"),
    professionalId: getParam(params, "professionalId"),
    clientId: getParam(params, "clientId"),
    appointmentStatus: getParam(params, "appointmentStatus"),
    q: getParam(params, "q"),
  };

  const filteredAppointments = appointments.filter(
    (appointment) =>
      isInsideOptionalRange(appointment.startAt, filters.from, filters.to) &&
      (!filters.professionalId || appointment.professionalId === filters.professionalId) &&
      (!filters.clientId || appointment.clientId === filters.clientId) &&
      (!filters.appointmentStatus || appointment.status === filters.appointmentStatus) &&
      matchesQuery(filters.q, [
        getClientName(store, appointment.clientId),
        getProfessionalName(store, appointment.professionalId),
        appointment.status,
        appointment.notes,
        appointment.services.map((item) => item.serviceName).join(" "),
      ]),
  );

  const pagedAppointments = paginateItems(filteredAppointments, params);
  const showQuickModal = getParam(params, "new") === "1";
  const modalProfessionalId = professionals.some((professional) => professional.id === getParam(params, "professionalId"))
    ? getParam(params, "professionalId")
    : professionals[0]?.id;
  const modalStartAt = getParam(params, "startAt") || new Date().toISOString().slice(0, 16);
  const closeModalHref = buildHref("/agenda", params, { new: null, professionalId: null, startAt: null });

  return (
    <div className="space-y-4">
      <PageHeader description="Citas por hora." eyebrow="Agenda" title="Agenda" />
      <PageNotice searchParams={params} />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard accent="orange" hint="Segun tu rol." icon={CalendarDays} label="Citas" value={String(appointments.length)} />
        <StatCard accent="teal" hint="Fecha de hoy." icon={Clock3} label="Hoy" value={String(todayAppointments.length)} />
        <StatCard accent="indigo" hint="Listas para venta." icon={CheckCircle2} label="Por cerrar" value={String(readyToClose.length)} />
        <StatCard accent="orange" hint="Activos." icon={PlusCircle} label="Profesionales" value={String(professionals.length)} />
      </section>

      <AgendaCalendar
        appointments={calendarAppointments}
        date={calendarDate}
        professionals={professionals}
        store={store}
        view={calendarView}
      />

      {showQuickModal ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-stone-950/45 px-4 py-8 backdrop-blur-sm">
          <div className="w-full max-w-2xl">
            <div className="mb-3 flex justify-end">
              <Link className="btn-secondary bg-white" href={closeModalHref}>
                Cerrar
              </Link>
            </div>
            <AppointmentForm
              action={createAppointmentAction}
              clients={clients}
              defaultProfessionalId={modalProfessionalId}
              defaultStartAt={modalStartAt}
              professionals={professionals}
              services={store.services.filter((item) => item.active)}
              submitLabel="Guardar cita"
              title="Nueva cita"
            />
          </div>
        </div>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <AppointmentForm
          action={createAppointmentAction}
          clients={clients}
          professionals={professionals}
          services={store.services.filter((item) => item.active)}
        />

        <article className="surface rounded-[1.8rem] p-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="label">Listado</p>
              <h2 className="mt-1 text-2xl font-semibold">Citas</h2>
            </div>
            <Link className="btn-secondary !py-2" href="/agenda">
              Limpiar
            </Link>
          </div>

          <form className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3" method="get">
            <input name="view" type="hidden" value={calendarView} />
            <input name="date" type="hidden" value={getParam(params, "date")} />
            <input className="input-base" defaultValue={filters.from} name="from" type="date" />
            <input className="input-base" defaultValue={filters.to} name="to" type="date" />
            <select className="select-base" defaultValue={filters.professionalId} name="professionalId">
              <option value="">Profesional</option>
              {professionals.map((professional) => (
                <option key={professional.id} value={professional.id}>
                  {professional.name}
                </option>
              ))}
            </select>
            <select className="select-base" defaultValue={filters.clientId} name="clientId">
              <option value="">Cliente</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
            <select className="select-base" defaultValue={filters.appointmentStatus} name="appointmentStatus">
              <option value="">Estado</option>
              <option value="scheduled">Agendada</option>
              <option value="confirmed">Confirmada</option>
              <option value="completed">Completada</option>
              <option value="cancelled">Cancelada</option>
              <option value="no_show">No asistio</option>
            </select>
            <input className="input-base" defaultValue={filters.q} name="q" placeholder="Buscar" />
            <button className="btn-primary md:col-span-2 xl:col-span-3" type="submit">
              Filtrar
            </button>
          </form>

          {pagedAppointments.items.length ? (
            <div className="mt-5 overflow-x-auto">
              <table className="min-w-[980px] text-left text-sm">
                <thead className="text-stone-500">
                  <tr>
                    <th className="pb-3">Fecha</th>
                    <th className="pb-3">Cliente</th>
                    <th className="pb-3">Profesional</th>
                    <th className="pb-3">Servicios</th>
                    <th className="pb-3">Total</th>
                    <th className="pb-3">Estado</th>
                    <th className="pb-3">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200/60">
                  {pagedAppointments.items.map((appointment) => (
                    <tr key={appointment.id}>
                      <td className="py-4">{formatDateTime(appointment.startAt)}</td>
                      <td className="py-4 font-medium">{getClientName(store, appointment.clientId)}</td>
                      <td className="py-4 text-stone-600">{getProfessionalName(store, appointment.professionalId)}</td>
                      <td className="max-w-60 truncate py-4 text-stone-600">{appointment.services.map((item) => item.serviceName).join(", ")}</td>
                      <td className="py-4">{formatCurrency(appointment.estimatedTotal)}</td>
                      <td className="py-4">
                        <StatusBadge status={appointment.status} />
                      </td>
                      <td className="py-4">
                        <div className="flex flex-wrap gap-2">
                          <form action={updateAppointmentStatusAction}>
                            <input name="appointmentId" type="hidden" value={appointment.id} />
                            <div className="flex items-center gap-2">
                              <select className="select-base !w-auto !py-2 !pr-10" defaultValue={appointment.status} name="status">
                                <option value="scheduled">Agendada</option>
                                <option value="confirmed">Confirmada</option>
                                <option value="completed">Completada</option>
                                <option value="cancelled">Cancelada</option>
                                <option value="no_show">No asistio</option>
                              </select>
                              <button className="btn-secondary !py-2" type="submit">
                                Guardar
                              </button>
                            </div>
                          </form>
                          {appointment.status === "completed" && !appointment.saleId && roleCanAccess(user.role, "/ventas") ? (
                            <form action={convertAppointmentToSaleAction}>
                              <input name="appointmentId" type="hidden" value={appointment.id} />
                              <button className="btn-secondary !py-2" type="submit">
                                Pasar a venta
                              </button>
                            </form>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mt-5">
              <EmptyState description="Ajusta los filtros o crea una cita." title="Sin resultados" />
            </div>
          )}

          <Pagination basePath="/agenda" searchParams={params} {...pagedAppointments} />
        </article>
      </section>
    </div>
  );
}
