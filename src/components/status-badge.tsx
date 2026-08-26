import type { AppointmentStatus, PaymentStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

type Status = AppointmentStatus | PaymentStatus | "low_stock" | "healthy";

const labelMap: Record<Status, string> = {
  scheduled: "Agendada",
  confirmed: "Confirmada",
  completed: "Completada",
  cancelled: "Cancelada",
  no_show: "No asistio",
  unpaid: "Sin pago",
  partial: "Pago parcial",
  paid: "Pagada",
  low_stock: "Stock bajo",
  healthy: "Stock ok",
};

const toneMap: Record<Status, string> = {
  scheduled: "bg-amber-100 text-amber-800",
  confirmed: "bg-sky-100 text-sky-800",
  completed: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-rose-100 text-rose-700",
  no_show: "bg-stone-200 text-stone-700",
  unpaid: "bg-rose-100 text-rose-700",
  partial: "bg-amber-100 text-amber-800",
  paid: "bg-emerald-100 text-emerald-800",
  low_stock: "bg-rose-100 text-rose-700",
  healthy: "bg-emerald-100 text-emerald-800",
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={cn("inline-flex rounded-full px-3 py-1 text-xs font-semibold", toneMap[status])}>
      {labelMap[status]}
    </span>
  );
}
