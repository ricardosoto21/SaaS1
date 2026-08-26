import { Activity, CalendarCheck2, CreditCard, DollarSign, PackageSearch, Scissors, ShoppingCart, Wallet } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { requireSession } from "@/lib/auth";
import {
  getCategoriesForFilters,
  getCurrentMonthRange,
  getDashboardData,
  getRecentActivity,
  getVisibleClients,
  getVisibleProfessionals,
  normalizeFilters,
} from "@/lib/data";
import { readStore } from "@/lib/store";
import { formatCurrency, formatDateTime } from "@/lib/utils";

interface DashboardPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const user = await requireSession();
  const store = await readStore();
  const filters = normalizeFilters((await searchParams) ?? {});
  const dashboard = getDashboardData(store, user, filters);
  const recentActivity = getRecentActivity(store, user);
  const professionals = getVisibleProfessionals(store, user);
  const clients = getVisibleClients(store);
  const categories = getCategoriesForFilters(store);
  const currentMonth = getCurrentMonthRange();

  return (
    <div className="space-y-4">
      <PageHeader
        description="Mes actual y filtros."
        eyebrow="Dashboard"
        side={
          <div className="surface rounded-[1.6rem] p-4">
            <p className="label">Mes actual</p>
            <p className="mt-2 text-2xl font-semibold">
              {currentMonth.from} - {currentMonth.to}
            </p>
          </div>
        }
        title="Resumen"
      />

      <form className="surface rounded-[1.8rem] p-5" method="get">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="label">Filtros</p>
            <h2 className="mt-1 text-2xl font-semibold">Buscar</h2>
          </div>
          <button className="btn-secondary" type="submit">
            Aplicar filtros
          </button>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-2">
            <label className="label">Desde</label>
            <input className="input-base" defaultValue={filters.from} name="from" type="date" />
          </div>
          <div className="space-y-2">
            <label className="label">Hasta</label>
            <input className="input-base" defaultValue={filters.to} name="to" type="date" />
          </div>
          <div className="space-y-2">
            <label className="label">Profesional</label>
            <select className="select-base" defaultValue={filters.professionalId} name="professionalId">
              <option value="">Todos</option>
              {professionals.map((professional) => (
                <option key={professional.id} value={professional.id}>
                  {professional.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="label">Cliente</label>
            <select className="select-base" defaultValue={filters.clientId} name="clientId">
              <option value="">Todos</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="label">Categoria</label>
            <select className="select-base" defaultValue={filters.category} name="category">
              <option value="">Todas</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="label">Estado de pago</label>
            <select className="select-base" defaultValue={filters.paymentStatus} name="paymentStatus">
              <option value="">Todos</option>
              <option value="unpaid">Sin pago</option>
              <option value="partial">Parcial</option>
              <option value="paid">Pagada</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="label">Estado de cita</label>
            <select className="select-base" defaultValue={filters.appointmentStatus} name="appointmentStatus">
              <option value="">Todos</option>
              <option value="scheduled">Agendada</option>
              <option value="confirmed">Confirmada</option>
              <option value="completed">Completada</option>
              <option value="cancelled">Cancelada</option>
              <option value="no_show">No asistio</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="label">Tipo de venta</label>
            <select className="select-base" defaultValue={filters.saleKind} name="saleKind">
              <option value="">Todos</option>
              <option value="manual">Manual</option>
              <option value="appointment">Desde agenda</option>
              <option value="mixed">Mixta</option>
            </select>
          </div>
        </div>
      </form>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          accent="orange"
          hint="Ventas del rango."
          icon={DollarSign}
          label="Ventas generadas"
          value={formatCurrency(dashboard.totals.totalSales)}
        />
        <StatCard
          accent="teal"
          hint="Pagos recibidos."
          icon={Wallet}
          label="Cobrado real"
          value={formatCurrency(dashboard.totals.totalCollected)}
        />
        <StatCard
          accent="indigo"
          hint="Pendiente."
          icon={CreditCard}
          label="Por cobrar"
          value={formatCurrency(dashboard.totals.totalDue)}
        />
        <StatCard
          accent="orange"
          hint="Cobros menos egresos."
          icon={Activity}
          label="Resultado de caja"
          value={formatCurrency(dashboard.totals.cashResult)}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <article className="surface rounded-[1.8rem] p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="label">Operacion</p>
              <h2 className="mt-1 text-2xl font-semibold">Movimiento</h2>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {[
              {
                icon: CalendarCheck2,
                label: "Citas",
                value: String(dashboard.appointments.length),
                helper: "En el rango.",
              },
              {
                icon: ShoppingCart,
                label: "Compras",
                value: formatCurrency(dashboard.totals.totalPurchases),
                helper: "Stock e insumos.",
              },
              {
                icon: Wallet,
                label: "Gastos operativos",
                value: formatCurrency(dashboard.totals.totalExpenses),
                helper: "Egresos.",
              },
              {
                icon: PackageSearch,
                label: "Productos con alerta",
                value: String(dashboard.lowStockProducts.length),
                helper: "Stock bajo.",
              },
            ].map((item) => (
              <div key={item.label} className="surface-muted rounded-[1.5rem] p-4">
                <item.icon className="h-5 w-5 text-stone-700" />
                <p className="mt-4 label">{item.label}</p>
                <p className="mt-1 text-2xl font-semibold">{item.value}</p>
                <p className="mt-2 text-sm text-stone-600">{item.helper}</p>
              </div>
            ))}
          </div>

          <div className="mt-6">
            <p className="label">Citas por estado</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {Object.entries(dashboard.appointmentStatusCounts).length ? (
                Object.entries(dashboard.appointmentStatusCounts).map(([status, count]) => (
                  <div key={status} className="surface-muted flex items-center justify-between rounded-[1.4rem] px-4 py-3">
                    <StatusBadge status={status as never} />
                    <strong>{count}</strong>
                  </div>
                ))
              ) : (
                <EmptyState
                  description="No hay citas."
                  title="Sin datos"
                />
              )}
            </div>
          </div>
        </article>

        <article className="surface rounded-[1.8rem] p-5">
          <p className="label">Actividad reciente</p>
          <h2 className="mt-1 text-2xl font-semibold">Ultimos movimientos</h2>
          <div className="mt-5 space-y-3">
            {recentActivity.length ? (
              recentActivity.map((event) => (
                <div key={event.id} className="surface-muted rounded-[1.4rem] p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold">{event.title}</p>
                      <p className="text-sm text-stone-600">{event.subtitle}</p>
                    </div>
                    <p className="text-xs text-stone-500">{formatDateTime(event.happenedAt)}</p>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState description="Aun no hay movimientos." title="Sin actividad" />
            )}
          </div>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <article className="surface rounded-[1.8rem] p-5">
          <p className="label">Top servicios</p>
          <h2 className="mt-1 text-2xl font-semibold">Mas vendidos</h2>
          <div className="mt-5 space-y-3">
            {dashboard.topServices.length ? (
              dashboard.topServices.map(([name, total]) => (
                <div key={name} className="surface-muted flex items-center justify-between rounded-[1.4rem] px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Scissors className="h-4 w-4 text-orange-600" />
                    <span>{name}</span>
                  </div>
                  <strong>{formatCurrency(total)}</strong>
                </div>
              ))
            ) : (
              <EmptyState description="Sin ventas en el rango." title="Sin ranking" />
            )}
          </div>
        </article>

        <article className="surface rounded-[1.8rem] p-5">
          <p className="label">Top productos</p>
          <h2 className="mt-1 text-2xl font-semibold">Mostrador</h2>
          <div className="mt-5 space-y-3">
            {dashboard.topProducts.length ? (
              dashboard.topProducts.map(([name, total]) => (
                <div key={name} className="surface-muted flex items-center justify-between rounded-[1.4rem] px-4 py-3">
                  <span>{name}</span>
                  <strong>{formatCurrency(total)}</strong>
                </div>
              ))
            ) : (
              <EmptyState description="Sin ventas en el rango." title="Sin ranking" />
            )}
          </div>
        </article>

        <article className="surface rounded-[1.8rem] p-5">
          <p className="label">Top profesionales</p>
          <h2 className="mt-1 text-2xl font-semibold">Ventas</h2>
          <div className="mt-5 space-y-3">
            {dashboard.topProfessionals.length ? (
              dashboard.topProfessionals.map(([name, total]) => (
                <div key={name} className="surface-muted flex items-center justify-between rounded-[1.4rem] px-4 py-3">
                  <span>{name}</span>
                  <strong>{formatCurrency(total)}</strong>
                </div>
              ))
            ) : (
              <EmptyState description="Sin ventas en el rango." title="Sin ranking" />
            )}
          </div>
        </article>
      </section>

      <article className="surface rounded-[1.8rem] p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="label">Stock bajo</p>
            <h2 className="mt-1 text-2xl font-semibold">Productos a vigilar</h2>
          </div>
        </div>

        {dashboard.lowStockProducts.length ? (
          <div className="mt-5 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-stone-500">
                <tr>
                  <th className="pb-3">Producto</th>
                  <th className="pb-3">Categoria</th>
                  <th className="pb-3">Stock</th>
                  <th className="pb-3">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200/60">
                {dashboard.lowStockProducts.map((product) => (
                  <tr key={product.id}>
                    <td className="py-4 font-medium">{product.name}</td>
                    <td className="py-4 text-stone-600">{product.categoryName}</td>
                    <td className="py-4">{product.currentStock}</td>
                    <td className="py-4">
                      <StatusBadge status={product.currentStock <= store.settings.lowStockThreshold ? "low_stock" : "healthy"} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-5">
            <EmptyState description="Sin alertas." title="Stock ok" />
          </div>
        )}
      </article>
    </div>
  );
}
