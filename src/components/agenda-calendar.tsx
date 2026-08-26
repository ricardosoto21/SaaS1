import {
  addDays,
  addHours,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
} from "date-fns";
import { es } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { getClientName, getProfessionalName } from "@/lib/data";
import type { AppStore, Appointment, Professional } from "@/lib/types";
import { cn, formatCurrency } from "@/lib/utils";

export type AgendaCalendarView = "day" | "week" | "month";

const agendaHours = Array.from({ length: 13 }, (_, index) => index + 8);
const calendarTabs: Array<{ label: string; view: AgendaCalendarView }> = [
  { label: "Dia", view: "day" },
  { label: "Semana", view: "week" },
  { label: "Mes", view: "month" },
];

function dateValue(date: Date) {
  return format(date, "yyyy-MM-dd");
}

function localDateTimeValue(date: Date) {
  return format(date, "yyyy-MM-dd'T'HH:mm");
}

function calendarHref(view: AgendaCalendarView, date: Date) {
  return `/agenda?view=${view}&date=${dateValue(date)}`;
}

function quickCreateHref(date: Date, professionalId: string) {
  return `/agenda?view=day&date=${dateValue(date)}&new=1&professionalId=${professionalId}&startAt=${encodeURIComponent(localDateTimeValue(date))}`;
}

function getNavigationDate(view: AgendaCalendarView, date: Date, direction: "previous" | "next") {
  if (view === "month") {
    return direction === "previous" ? subMonths(date, 1) : addMonths(date, 1);
  }

  const days = view === "week" ? 7 : 1;
  return direction === "previous" ? subDays(date, days) : addDays(date, days);
}

function getTitle(view: AgendaCalendarView, date: Date) {
  if (view === "month") {
    return format(date, "MMMM yyyy", { locale: es });
  }

  if (view === "week") {
    const start = startOfWeek(date, { weekStartsOn: 1 });
    const end = addDays(start, 6);
    return `${format(start, "d MMM", { locale: es })} - ${format(end, "d MMM", { locale: es })}`;
  }

  return format(date, "EEEE d MMM", { locale: es });
}

function getSlotDate(date: Date, hour: number) {
  const slot = new Date(date);
  slot.setHours(hour, 0, 0, 0);
  return slot;
}

function sameHour(appointment: Appointment, hour: number) {
  return parseISO(appointment.startAt).getHours() === hour;
}

function appointmentsForDay(appointments: Appointment[], date: Date) {
  return appointments.filter((appointment) => isSameDay(parseISO(appointment.startAt), date));
}

function appointmentsForSlot(appointments: Appointment[], date: Date, hour: number) {
  return appointments.filter((appointment) => {
    const startAt = parseISO(appointment.startAt);
    return isSameDay(startAt, date) && sameHour(appointment, hour);
  });
}

function intervalOverlaps(appointment: Appointment, slotStart: Date, slotEnd: Date) {
  const start = parseISO(appointment.startAt).getTime();
  const end = start + appointment.totalDurationMinutes * 60_000;
  return start < slotEnd.getTime() && slotStart.getTime() < end;
}

function isSlotBlocked(appointments: Appointment[], professionalId: string, slotStart: Date) {
  const slotEnd = addHours(slotStart, 1);
  return appointments.some(
    (appointment) =>
      appointment.professionalId === professionalId &&
      ["scheduled", "confirmed"].includes(appointment.status) &&
      intervalOverlaps(appointment, slotStart, slotEnd),
  );
}

function AppointmentChip({
  appointment,
  compact = false,
  store,
}: {
  appointment: Appointment;
  compact?: boolean;
  store: AppStore;
}) {
  const professional = store.professionals.find((item) => item.id === appointment.professionalId);

  if (compact) {
    return (
      <div
        className="h-11 overflow-hidden rounded-xl border border-white/70 border-l-4 bg-white/85 px-2.5 py-1.5 shadow-sm"
        style={{ borderLeftColor: professional?.color ?? "#0f766e" }}
        title={`${format(parseISO(appointment.startAt), "HH:mm")} ${getClientName(store, appointment.clientId)}`}
      >
        <p className="truncate text-[0.68rem] font-semibold text-stone-500">{format(parseISO(appointment.startAt), "HH:mm")}</p>
        <p className="truncate text-xs font-semibold leading-tight">{getClientName(store, appointment.clientId)}</p>
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl border border-white/70 border-l-4 bg-white/85 p-3 shadow-sm"
      style={{ borderLeftColor: professional?.color ?? "#0f766e" }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-stone-500">{format(parseISO(appointment.startAt), "HH:mm")}</p>
          <p className="truncate font-semibold leading-tight">{getClientName(store, appointment.clientId)}</p>
        </div>
        <StatusBadge status={appointment.status} />
      </div>
      <p className="mt-2 truncate text-xs text-stone-600">{getProfessionalName(store, appointment.professionalId)}</p>
      <p className="mt-1 line-clamp-2 text-xs text-stone-600">
        {appointment.services.map((service) => service.serviceName).join(", ")}
      </p>
      <p className="mt-2 text-xs font-semibold text-stone-800">{formatCurrency(appointment.estimatedTotal)}</p>
    </div>
  );
}

function DayCalendar({
  appointments,
  date,
  professionals,
  store,
}: {
  appointments: Appointment[];
  date: Date;
  professionals: Professional[];
  store: AppStore;
}) {
  if (!professionals.length) {
    return <EmptyState description="Crea profesionales para usar la agenda." title="Sin profesionales" />;
  }

  return (
    <div className="scroll-thin overflow-x-auto">
      <table className="min-w-[860px] table-fixed text-left text-sm">
        <thead className="text-stone-500">
          <tr>
            <th className="w-20 pb-3">Hora</th>
            {professionals.map((professional) => (
              <th key={professional.id} className="pb-3">
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: professional.color }} />
                  {professional.name}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-200/70">
          {agendaHours.map((hour) => {
            const slotStart = getSlotDate(date, hour);

            return (
              <tr key={hour} className="h-32">
                <td className="py-4 align-top text-xs font-semibold text-stone-500">{String(hour).padStart(2, "0")}:00</td>
                {professionals.map((professional) => {
                  const slotAppointments = appointmentsForSlot(appointments, date, hour).filter(
                    (appointment) => appointment.professionalId === professional.id,
                  );
                  const blocked = isSlotBlocked(appointments, professional.id, slotStart);

                  return (
                    <td key={professional.id} className={cn("border-l border-stone-200/60 px-2 py-3 align-top", blocked && "bg-rose-50/45")}>
                      <div className="scroll-thin max-h-24 space-y-2 overflow-y-auto pr-1">
                        {slotAppointments.map((appointment) => (
                          <AppointmentChip key={appointment.id} appointment={appointment} store={store} />
                        ))}
                      </div>
                      {blocked ? (
                        slotAppointments.length ? null : (
                          <p className="mt-2 rounded-full bg-rose-100 px-3 py-1 text-center text-xs font-semibold text-rose-700">Ocupado</p>
                        )
                      ) : (
                        <Link
                          className="mt-2 flex items-center justify-center gap-2 rounded-xl border border-dashed border-stone-300/80 bg-white/45 px-3 py-2 text-xs font-semibold text-stone-500 transition hover:border-teal-500 hover:text-teal-700"
                          href={quickCreateHref(slotStart, professional.id)}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Disponible
                        </Link>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function WeekCalendar({
  appointments,
  date,
  store,
}: {
  appointments: Appointment[];
  date: Date;
  store: AppStore;
}) {
  const start = startOfWeek(date, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, index) => addDays(start, index));

  return (
    <div className="scroll-thin overflow-x-auto">
      <table className="min-w-[980px] table-fixed text-left text-sm">
        <thead className="text-stone-500">
          <tr>
            <th className="w-20 pb-3">Hora</th>
            {days.map((day) => (
              <th key={dateValue(day)} className="pb-3">
                <span className="block font-semibold text-stone-700">{format(day, "EEE", { locale: es })}</span>
                <span className="text-xs">{format(day, "d MMM", { locale: es })}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-200/70">
          {agendaHours.map((hour) => (
            <tr key={hour} className="h-28">
              <td className="py-4 align-top text-xs font-semibold text-stone-500">{String(hour).padStart(2, "0")}:00</td>
              {days.map((day) => {
                const slotAppointments = appointmentsForSlot(appointments, day, hour);

                return (
                  <td key={dateValue(day)} className="h-28 border-l border-stone-200/60 px-2 py-3 align-top">
                    <div className="scroll-thin max-h-20 space-y-1.5 overflow-y-auto pr-1">
                      {slotAppointments.map((appointment) => (
                        <AppointmentChip key={appointment.id} appointment={appointment} compact store={store} />
                      ))}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MonthCalendar({
  appointments,
  date,
  store,
}: {
  appointments: Appointment[];
  date: Date;
  store: AppStore;
}) {
  const monthStart = startOfMonth(date);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(monthStart), { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  return (
    <div className="grid min-w-[840px] grid-cols-7 overflow-hidden rounded-[1.4rem] border border-stone-200/70 bg-white/40">
      {["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"].map((day) => (
        <div key={day} className="border-b border-stone-200/70 px-3 py-2 text-xs font-semibold text-stone-500">
          {day}
        </div>
      ))}
      {days.map((day) => {
        const dayAppointments = appointmentsForDay(appointments, day);

        return (
          <div
            key={dateValue(day)}
            className={cn(
              "h-40 overflow-hidden border-b border-r border-stone-200/70 p-3",
              isSameMonth(day, monthStart) ? "bg-white/50" : "bg-stone-100/50 text-stone-400",
            )}
          >
            <p className="text-xs font-semibold">{format(day, "d")}</p>
            <div className="mt-2 space-y-1.5">
              {dayAppointments.slice(0, 2).map((appointment) => (
                <AppointmentChip key={appointment.id} appointment={appointment} compact store={store} />
              ))}
              {dayAppointments.length > 2 ? (
                <Link
                  className="block rounded-full bg-stone-900 px-3 py-1 text-center text-xs font-semibold text-white"
                  href={calendarHref("day", day)}
                >
                  +{dayAppointments.length - 2} mas
                </Link>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function AgendaCalendar({
  appointments,
  date,
  professionals,
  store,
  view,
}: {
  appointments: Appointment[];
  date: Date;
  professionals: Professional[];
  store: AppStore;
  view: AgendaCalendarView;
}) {
  const previousDate = getNavigationDate(view, date, "previous");
  const nextDate = getNavigationDate(view, date, "next");

  return (
    <article className="surface rounded-[1.8rem] p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="label">Calendario</p>
          <h2 className="mt-1 text-2xl font-semibold capitalize">{getTitle(view, date)}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {calendarTabs.map((tab) => (
            <Link
              key={tab.view}
              className={cn("btn-secondary !px-4 !py-2", view === tab.view && "bg-stone-900 text-white hover:bg-stone-800")}
              href={calendarHref(tab.view, date)}
            >
              {tab.label}
            </Link>
          ))}
          <Link aria-label="Anterior" className="btn-secondary !px-3 !py-2" href={calendarHref(view, previousDate)}>
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <Link aria-label="Siguiente" className="btn-secondary !px-3 !py-2" href={calendarHref(view, nextDate)}>
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <div className="mt-5">
        {view === "day" ? (
          <DayCalendar appointments={appointments} date={date} professionals={professionals} store={store} />
        ) : view === "week" ? (
          <WeekCalendar appointments={appointments} date={date} store={store} />
        ) : (
          <div className="scroll-thin overflow-x-auto">
            <MonthCalendar appointments={appointments} date={date} store={store} />
          </div>
        )}
      </div>
    </article>
  );
}
