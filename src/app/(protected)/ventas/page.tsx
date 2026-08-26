import { Fragment } from "react";

import { HandCoins, PackagePlus, TicketPercent, Wallet } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { SaleForm } from "@/components/forms/sale-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { PageHeader } from "@/components/page-header";
import { PageNotice } from "@/components/page-notice";
import { Pagination } from "@/components/pagination";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { convertAppointmentToSaleAction, createSaleAction, recordPaymentAction } from "@/lib/actions";
import { requireSession } from "@/lib/auth";
import {
  getAppointmentsReadyToClose,
  getClientName,
  getPaymentSummary,
  getProfessionalName,
  getVisibleClients,
  getVisibleProfessionals,
  getVisibleSales,
  roleCanAccess,
} from "@/lib/data";
import { getParam, isInsideOptionalRange, matchesQuery, paginateItems } from "@/lib/listing";
import { readStore } from "@/lib/store";
import { formatCurrency, formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface VentasPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function getSaleKindLabel(kind: string) {
  if (kind === "mixed") {
    return "Mixta";
  }
  if (kind === "appointment") {
    return "Agenda";
  }
  return "Manual";
}

function getSaleKind(sale: ReturnType<typeof getVisibleSales>[number]) {
  const hasServices = sale.items.some((item) => item.type === "service");
  const hasProducts = sale.items.some((item) => item.type === "product");
  return hasServices && hasProducts ? "mixed" : sale.origin;
}

export default async function VentasPage({ searchParams }: VentasPageProps) {
  const user = await requireSession();
  if (!roleCanAccess(user.role, "/ventas")) {
    redirect("/dashboard");
  }

  const params = (await searchParams) ?? {};
  const store = await readStore(user);
  const sales = getVisibleSales(store, user);
  const clients = getVisibleClients(store);
  const professionals = getVisibleProfessionals(store, user);
  const appointmentsReady = getAppointmentsReadyToClose(store, user);

  const filters = {
    from: getParam(params, "from"),
    to: getParam(params, "to"),
    paymentStatus: getParam(params, "paymentStatus"),
    clientId: getParam(params, "clientId"),
    professionalId: getParam(params, "professionalId"),
    saleKind: getParam(params, "saleKind"),
    q: getParam(params, "q"),
  };

  const filteredSales = sales.filter((sale) => {
    const kind = getSaleKind(sale);
    return (
      isInsideOptionalRange(sale.soldAt, filters.from, filters.to) &&
      (!filters.paymentStatus || sale.paymentStatus === filters.paymentStatus) &&
      (!filters.clientId || sale.clientId === filters.clientId) &&
      (!filters.professionalId || sale.professionalId === filters.professionalId) &&
      (!filters.saleKind || kind === filters.saleKind) &&
      matchesQuery(filters.q, [
        getClientName(store, sale.clientId),
        getProfessionalName(store, sale.professionalId),
        sale.paymentStatus,
        kind,
        sale.items.map((item) => item.name).join(" "),
      ])
    );
  });

  const pagedSales = paginateItems(filteredSales, params);
  const totalSales = filteredSales.reduce((sum, sale) => sum + sale.total, 0);
  const totalPending = filteredSales.reduce((sum, sale) => sum + sale.amountDue, 0);
  const fullyPaid = filteredSales.filter((sale) => sale.paymentStatus === "paid").length;

  return (
    <div className="space-y-4">
      <PageHeader description="Ventas, pagos y saldos." eyebrow="Ventas y cobros" title="Ventas" />
      <PageNotice searchParams={params} />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard accent="orange" hint="Segun filtros." icon={Wallet} label="Ventas" value={formatCurrency(totalSales)} />
        <StatCard accent="teal" hint="Pendiente." icon={HandCoins} label="Por cobrar" value={formatCurrency(totalPending)} />
        <StatCard accent="indigo" hint="Cerradas." icon={TicketPercent} label="Pagadas" value={String(fullyPaid)} />
        <StatCard accent="orange" hint="Desde agenda." icon={PackagePlus} label="Por cerrar" value={String(appointmentsReady.length)} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <SaleForm
          action={createSaleAction}
          clients={clients}
          products={store.products.filter((item) => item.active)}
          professionals={professionals}
          services={store.services.filter((item) => item.active)}
        />

        <article className="surface rounded-[1.8rem] p-5">
          <p className="label">Citas listas para cerrar</p>
          <h2 className="mt-1 text-2xl font-semibold">Cerrar citas</h2>
          <div className="mt-5 space-y-3">
            {appointmentsReady.length ? (
              appointmentsReady.slice(0, 8).map((appointment) => (
                <div key={appointment.id} className="surface-muted rounded-[1.5rem] p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="font-semibold">{getClientName(store, appointment.clientId)}</p>
                      <p className="text-sm text-stone-600">{appointment.services.map((item) => item.serviceName).join(", ")}</p>
                      <p className="mt-1 text-sm text-stone-500">
                        {getProfessionalName(store, appointment.professionalId)} - {formatDateTime(appointment.startAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <strong>{formatCurrency(appointment.estimatedTotal)}</strong>
                      <form action={convertAppointmentToSaleAction}>
                        <input name="appointmentId" type="hidden" value={appointment.id} />
                        <button className="btn-secondary" type="submit">
                          Crear venta
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState description="No hay citas listas." title="Sin pendientes" />
            )}
          </div>
        </article>
      </section>

      <article className="surface rounded-[1.8rem] p-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="label">Historial</p>
            <h2 className="mt-1 text-2xl font-semibold">Ventas</h2>
          </div>
          <Link className="btn-secondary !py-2" href="/ventas">
            Limpiar
          </Link>
        </div>

        <form className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4" method="get">
          <input className="input-base" defaultValue={filters.from} name="from" type="date" />
          <input className="input-base" defaultValue={filters.to} name="to" type="date" />
          <select className="select-base" defaultValue={filters.paymentStatus} name="paymentStatus">
            <option value="">Estado de pago</option>
            <option value="unpaid">Sin pago</option>
            <option value="partial">Pago parcial</option>
            <option value="paid">Pagada</option>
          </select>
          <select className="select-base" defaultValue={filters.clientId} name="clientId">
            <option value="">Cliente</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
          <select className="select-base" defaultValue={filters.professionalId} name="professionalId">
            <option value="">Profesional</option>
            {professionals.map((professional) => (
              <option key={professional.id} value={professional.id}>
                {professional.name}
              </option>
            ))}
          </select>
          <select className="select-base" defaultValue={filters.saleKind} name="saleKind">
            <option value="">Tipo</option>
            <option value="appointment">Agenda</option>
            <option value="manual">Manual</option>
            <option value="mixed">Mixta</option>
          </select>
          <input className="input-base md:col-span-2" defaultValue={filters.q} name="q" placeholder="Buscar" />
          <button className="btn-primary xl:col-span-4" type="submit">
            Filtrar
          </button>
        </form>

        {pagedSales.items.length ? (
          <div className="mt-5 overflow-x-auto">
            <table className="min-w-[1080px] text-left text-sm">
              <thead className="text-stone-500">
                <tr>
                  <th className="pb-3">Fecha</th>
                  <th className="pb-3">Cliente</th>
                  <th className="pb-3">Profesional</th>
                  <th className="pb-3">Tipo</th>
                  <th className="pb-3">Total</th>
                  <th className="pb-3">Pagado</th>
                  <th className="pb-3">Pendiente</th>
                  <th className="pb-3">Estado</th>
                  <th className="pb-3">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200/60">
                {pagedSales.items.map((sale) => {
                  const payments = getPaymentSummary(store, sale);
                  const saleKind = getSaleKind(sale);

                  return (
                    <Fragment key={sale.id}>
                      <tr>
                        <td className="py-4">{formatDateTime(sale.soldAt)}</td>
                        <td className="py-4 font-medium">{getClientName(store, sale.clientId)}</td>
                        <td className="py-4 text-stone-600">{getProfessionalName(store, sale.professionalId)}</td>
                        <td className="py-4 text-stone-600">{getSaleKindLabel(saleKind)}</td>
                        <td className="py-4 font-semibold">{formatCurrency(sale.total)}</td>
                        <td className="py-4">{formatCurrency(sale.amountPaid)}</td>
                        <td className="py-4">{formatCurrency(sale.amountDue)}</td>
                        <td className="py-4">
                          <StatusBadge status={sale.paymentStatus} />
                        </td>
                        <td className="py-4 text-stone-600">{sale.items.length} items</td>
                      </tr>
                      <tr>
                        <td className="pb-4" colSpan={9}>
                          <details className="rounded-[1.2rem] border border-stone-200/70 bg-white/55 p-4">
                            <summary className="cursor-pointer font-semibold">Pagos y abonos</summary>
                            <div className="mt-4 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                              <div>
                                <p className="label">Items</p>
                                <p className="mt-2 text-sm text-stone-600">
                                  {sale.items.map((item) => `${item.name} x${item.quantity}`).join(", ")}
                                </p>
                                <p className="label mt-4">Pagos registrados</p>
                                <div className="mt-3 space-y-2">
                                  {payments.length ? (
                                    payments.map((payment) => (
                                      <div key={payment.id} className="rounded-2xl border border-stone-200/70 bg-white/70 px-4 py-3">
                                        <div className="flex items-center justify-between gap-3">
                                          <span className="font-semibold">{formatCurrency(payment.amount)}</span>
                                          <span className="text-sm text-stone-600">{formatDateTime(payment.paidAt)}</span>
                                        </div>
                                        <p className="mt-1 text-sm text-stone-600">{payment.method}</p>
                                      </div>
                                    ))
                                  ) : (
                                    <EmptyState description="Sin abonos." title="Sin pagos" />
                                  )}
                                </div>
                              </div>

                              {sale.amountDue > 0 ? (
                                <form action={recordPaymentAction} className="rounded-[1.4rem] border border-stone-200/70 bg-white/70 p-4">
                                  <p className="label">Registrar abono</p>
                                  <input name="saleId" type="hidden" value={sale.id} />
                                  <div className="mt-3 space-y-3">
                                    <input className="input-base" max={sale.amountDue} min={1} name="amount" placeholder="Monto" required type="number" />
                                    <select className="select-base" name="method">
                                      <option value="cash">Efectivo</option>
                                      <option value="transfer">Transferencia</option>
                                      <option value="card">Tarjeta</option>
                                      <option value="mercado_pago">Mercado Pago</option>
                                      <option value="other">Otro</option>
                                    </select>
                                    <input className="input-base" defaultValue={new Date().toISOString().slice(0, 16)} name="paidAt" required type="datetime-local" />
                                    <input className="input-base" name="note" placeholder="Nota del pago" />
                                    <SubmitButton className="btn-primary w-full" label="Guardar abono" pendingLabel="Guardando..." />
                                  </div>
                                </form>
                              ) : (
                                <div className="rounded-[1.4rem] border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
                                  Venta pagada.
                                </div>
                              )}
                            </div>
                          </details>
                        </td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-5">
            <EmptyState description="Ajusta los filtros o registra una venta." title="Sin resultados" />
          </div>
        )}

        <Pagination basePath="/ventas" searchParams={params} {...pagedSales} />
      </article>
    </div>
  );
}
