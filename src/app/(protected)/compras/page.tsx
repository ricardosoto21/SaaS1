import Link from "next/link";
import { redirect } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { PurchaseForm } from "@/components/forms/purchase-form";
import { PageHeader } from "@/components/page-header";
import { PageNotice } from "@/components/page-notice";
import { Pagination } from "@/components/pagination";
import { createPurchaseAction } from "@/lib/actions";
import { requireSession } from "@/lib/auth";
import { getCurrentMonthRange, getVisiblePurchases, roleCanAccess } from "@/lib/data";
import { getParam, isInsideOptionalRange, matchesQuery, paginateItems, uniqueValues } from "@/lib/listing";
import { readStore } from "@/lib/store";
import { formatCurrency, formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface ComprasPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ComprasPage({ searchParams }: ComprasPageProps) {
  const user = await requireSession();
  if (!roleCanAccess(user.role, "/compras")) {
    redirect("/dashboard");
  }

  const params = (await searchParams) ?? {};
  const store = await readStore();
  const purchases = getVisiblePurchases(store);
  const currentMonth = getCurrentMonthRange();
  const filters = {
    from: getParam(params, "from") || currentMonth.from,
    to: getParam(params, "to") || currentMonth.to,
    category: getParam(params, "category"),
    q: getParam(params, "q"),
  };
  const categories = uniqueValues(purchases.map((purchase) => purchase.categoryName));

  const filteredPurchases = purchases.filter(
    (purchase) =>
      isInsideOptionalRange(purchase.purchasedAt, filters.from, filters.to) &&
      (!filters.category || purchase.categoryName === filters.category) &&
      matchesQuery(filters.q, [
        purchase.supplier,
        purchase.categoryName,
        purchase.notes,
        purchase.items.map((item) => item.productName).join(" "),
      ]),
  );
  const pagedPurchases = paginateItems(filteredPurchases, params);

  return (
    <div className="space-y-4">
      <PageHeader description="Entradas de stock." eyebrow="Compras" title="Compras" />
      <PageNotice searchParams={params} />

      <section className="grid gap-4 xl:grid-cols-[0.88fr_1.12fr]">
        <PurchaseForm action={createPurchaseAction} products={store.products.filter((item) => item.active)} />

        <article className="surface rounded-[1.8rem] p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="label">Historial</p>
              <h2 className="mt-1 text-2xl font-semibold">Compras</h2>
            </div>
            <Link className="btn-secondary !py-2" href="/compras">
              Limpiar
            </Link>
          </div>

          <form className="mt-5 grid gap-3 md:grid-cols-2" method="get">
            <input className="input-base" defaultValue={filters.from} name="from" type="date" />
            <input className="input-base" defaultValue={filters.to} name="to" type="date" />
            <select className="select-base" defaultValue={filters.category} name="category">
              <option value="">Categoria</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
            <input className="input-base" defaultValue={filters.q} name="q" placeholder="Buscar" />
            <button className="btn-primary md:col-span-2" type="submit">
              Filtrar
            </button>
          </form>

          {pagedPurchases.items.length ? (
            <div className="mt-5 overflow-x-auto">
              <table className="min-w-[780px] text-left text-sm">
                <thead className="text-stone-500">
                  <tr>
                    <th className="pb-3">Fecha</th>
                    <th className="pb-3">Proveedor</th>
                    <th className="pb-3">Categoria</th>
                    <th className="pb-3">Items</th>
                    <th className="pb-3">Total</th>
                    <th className="pb-3">Detalle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200/60">
                  {pagedPurchases.items.map((purchase) => (
                    <tr key={purchase.id}>
                      <td className="py-4">{formatDateTime(purchase.purchasedAt)}</td>
                      <td className="py-4 font-medium">{purchase.supplier}</td>
                      <td className="py-4 text-stone-600">{purchase.categoryName}</td>
                      <td className="py-4 text-stone-600">{purchase.items.length}</td>
                      <td className="py-4 font-semibold">{formatCurrency(purchase.total)}</td>
                      <td className="py-4">
                        <details>
                          <summary className="cursor-pointer font-semibold text-stone-700">Ver</summary>
                          <div className="mt-3 space-y-2">
                            {purchase.items.map((item) => (
                              <div key={item.id} className="rounded-2xl border border-stone-200/70 bg-white/70 px-4 py-3 text-sm">
                                <div className="flex items-center justify-between gap-3">
                                  <span>{item.productName}</span>
                                  <span className="font-semibold">
                                    {item.quantity} x {formatCurrency(item.unitCost)}
                                  </span>
                                </div>
                              </div>
                            ))}
                            {purchase.notes ? <p className="text-sm text-stone-600">{purchase.notes}</p> : null}
                          </div>
                        </details>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mt-5">
              <EmptyState description="Ajusta los filtros o registra una compra." title="Sin resultados" />
            </div>
          )}

          <Pagination basePath="/compras" searchParams={params} {...pagedPurchases} />
        </article>
      </section>
    </div>
  );
}
