import Link from "next/link";
import { redirect } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { SubmitButton } from "@/components/forms/submit-button";
import { PageHeader } from "@/components/page-header";
import { PageNotice } from "@/components/page-notice";
import { Pagination } from "@/components/pagination";
import { StatusBadge } from "@/components/status-badge";
import { createClientAction } from "@/lib/actions";
import { requireSession } from "@/lib/auth";
import { getClientDetail, getVisibleClients, roleCanAccess } from "@/lib/data";
import { getParam, matchesQuery, paginateItems } from "@/lib/listing";
import { readStore } from "@/lib/store";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";

interface ClientsPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export const dynamic = "force-dynamic";

export default async function ClientsPage({ searchParams }: ClientsPageProps) {
  const user = await requireSession();
  if (!roleCanAccess(user.role, "/clientes")) {
    redirect("/dashboard");
  }

  const params = (await searchParams) ?? {};
  const store = await readStore(user);
  const clients = getVisibleClients(store);
  const filters = {
    q: getParam(params, "q"),
    debtStatus: getParam(params, "debtStatus"),
  };

  const clientDebt = (clientId: string) =>
    store.sales.filter((sale) => sale.clientId === clientId).reduce((sum, sale) => sum + sale.amountDue, 0);

  const filteredClients = clients.filter((client) => {
    const debt = clientDebt(client.id);
    return (
      matchesQuery(filters.q, [client.name, client.phone, client.email, client.notes, client.preferences]) &&
      (!filters.debtStatus ||
        (filters.debtStatus === "with_debt" && debt > 0) ||
        (filters.debtStatus === "no_debt" && debt === 0))
    );
  });

  const pagedClients = paginateItems(filteredClients, params);
  const selectedClientId = typeof params.clientId === "string" ? params.clientId : filteredClients[0]?.id;
  const detail = selectedClientId ? getClientDetail(store, selectedClientId) : null;

  return (
    <div className="space-y-4">
      <PageHeader description="Fichas, historial y saldos." eyebrow="Clientes" title="Clientes" />
      <PageNotice searchParams={params} />

      <section className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
        <div className="space-y-4">
          <article className="surface rounded-[1.8rem] p-5">
            <p className="label">Nueva ficha</p>
            <h2 className="mt-1 text-2xl font-semibold">Agregar cliente</h2>
            <form action={createClientAction} className="mt-5 space-y-4">
              <input className="input-base" name="name" placeholder="Nombre y apellido" required />
              <input className="input-base" name="phone" placeholder="Telefono o WhatsApp" required />
              <input className="input-base" name="email" placeholder="Email (opcional)" type="email" />
              <input className="input-base" name="birthday" type="date" />
              <textarea className="textarea-base min-h-24" name="preferences" placeholder="Preferencias" />
              <textarea className="textarea-base min-h-24" name="notes" placeholder="Notas internas" />
              <SubmitButton label="Guardar cliente" pendingLabel="Guardando..." />
            </form>
          </article>

          <article className="surface rounded-[1.8rem] p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="label">Cartera</p>
                <h2 className="mt-1 text-2xl font-semibold">Clientes</h2>
              </div>
              <Link className="btn-secondary !py-2" href="/clientes">
                Limpiar
              </Link>
            </div>

            <form className="mt-5 grid gap-3 md:grid-cols-[1fr_auto]" method="get">
              <input className="input-base" defaultValue={filters.q} name="q" placeholder="Buscar cliente" />
              <select className="select-base" defaultValue={filters.debtStatus} name="debtStatus">
                <option value="">Todos</option>
                <option value="with_debt">Con deuda</option>
                <option value="no_debt">Sin deuda</option>
              </select>
              <button className="btn-primary md:col-span-2" type="submit">
                Filtrar
              </button>
            </form>

            {pagedClients.items.length ? (
              <div className="mt-5 overflow-x-auto">
                <table className="min-w-[680px] text-left text-sm">
                  <thead className="text-stone-500">
                    <tr>
                      <th className="pb-3">Cliente</th>
                      <th className="pb-3">Telefono</th>
                      <th className="pb-3">Email</th>
                      <th className="pb-3">Saldo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200/60">
                    {pagedClients.items.map((client) => {
                      const debt = clientDebt(client.id);
                      return (
                        <tr key={client.id} className={client.id === detail?.client.id ? "bg-white/55" : ""}>
                          <td className="py-4 font-medium">
                            <Link className="hover:text-teal-700" href={`/clientes?clientId=${client.id}`}>
                              {client.name}
                            </Link>
                          </td>
                          <td className="py-4 text-stone-600">{client.phone}</td>
                          <td className="py-4 text-stone-600">{client.email ?? "-"}</td>
                          <td className="py-4 font-semibold">{formatCurrency(debt)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="mt-5">
                <EmptyState description="Ajusta los filtros o crea un cliente." title="Sin resultados" />
              </div>
            )}

            <Pagination basePath="/clientes" searchParams={params} {...pagedClients} />
          </article>
        </div>

        <article className="surface rounded-[1.8rem] p-5">
          {detail ? (
            <>
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="label">Ficha</p>
                  <h2 className="mt-1 text-3xl font-semibold">{detail.client.name}</h2>
                  <p className="mt-2 text-sm text-stone-600">
                    {detail.client.phone}
                    {detail.client.email ? ` - ${detail.client.email}` : ""}
                  </p>
                </div>
                <div className="surface-muted rounded-[1.4rem] px-4 py-3">
                  <p className="label">Saldo pendiente</p>
                  <p className="mt-1 text-2xl font-semibold">{formatCurrency(detail.debt)}</p>
                </div>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div className="surface-muted rounded-[1.5rem] p-4">
                  <p className="label">Preferencias</p>
                  <p className="mt-2 text-sm leading-6 text-stone-700">{detail.client.preferences || "Sin preferencias registradas."}</p>
                </div>
                <div className="surface-muted rounded-[1.5rem] p-4">
                  <p className="label">Notas internas</p>
                  <p className="mt-2 text-sm leading-6 text-stone-700">{detail.client.notes || "Sin notas registradas."}</p>
                </div>
              </div>

              <div className="mt-6 grid gap-4 xl:grid-cols-2">
                <section className="rounded-[1.5rem] border border-stone-200/60 bg-white/60 p-4">
                  <p className="label">Historial de citas</p>
                  <div className="mt-4 space-y-3">
                    {detail.appointments.length ? (
                      detail.appointments.slice(0, 8).map((appointment) => (
                        <div key={appointment.id} className="surface-muted rounded-[1.3rem] p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="font-semibold">{formatDateTime(appointment.startAt)}</p>
                              <p className="text-sm text-stone-600">
                                {appointment.services.map((item) => item.serviceName).join(", ")}
                              </p>
                            </div>
                            <StatusBadge status={appointment.status} />
                          </div>
                        </div>
                      ))
                    ) : (
                      <EmptyState description="Sin citas." title="Sin agenda" />
                    )}
                  </div>
                </section>

                <section className="rounded-[1.5rem] border border-stone-200/60 bg-white/60 p-4">
                  <p className="label">Historial de compras</p>
                  <div className="mt-4 space-y-3">
                    {detail.sales.length ? (
                      detail.sales.slice(0, 8).map((sale) => (
                        <div key={sale.id} className="surface-muted rounded-[1.3rem] p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="font-semibold">{formatDate(sale.soldAt)}</p>
                              <p className="text-sm text-stone-600">{sale.items.map((item) => item.name).join(", ")}</p>
                            </div>
                            <StatusBadge status={sale.paymentStatus} />
                          </div>
                          <p className="mt-3 text-sm font-semibold">{formatCurrency(sale.total)}</p>
                        </div>
                      ))
                    ) : (
                      <EmptyState description="Sin ventas." title="Sin ventas" />
                    )}
                  </div>
                </section>
              </div>
            </>
          ) : (
            <EmptyState description="Selecciona un cliente." title="Sin cliente" />
          )}
        </article>
      </section>
    </div>
  );
}
