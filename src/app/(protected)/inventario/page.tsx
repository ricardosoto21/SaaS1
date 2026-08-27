import { AlertTriangle, Boxes, RefreshCcw, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { SubmitButton } from "@/components/forms/submit-button";
import { PageHeader } from "@/components/page-header";
import { PageNotice } from "@/components/page-notice";
import { Pagination } from "@/components/pagination";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { adjustStockAction } from "@/lib/actions";
import { requireSession } from "@/lib/auth";
import { getVisibleInventoryMovements, roleCanAccess } from "@/lib/data";
import { getParam, isInsideOptionalRange, matchesQuery, paginateItems, uniqueValues } from "@/lib/listing";
import { readStore } from "@/lib/store";
import { formatCurrency, formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface InventarioPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

const movementLabels: Record<string, string> = {
  purchase: "Compra",
  sale: "Venta",
  adjustment: "Ajuste",
};

export default async function InventarioPage({ searchParams }: InventarioPageProps) {
  const user = await requireSession();
  if (!roleCanAccess(user.role, "/inventario")) {
    redirect("/dashboard");
  }

  const params = (await searchParams) ?? {};
  const store = await readStore(user);
  const lowStockCount = store.products.filter((product) => product.currentStock <= store.settings.lowStockThreshold).length;
  const inventoryValue = store.products.reduce((sum, product) => sum + product.currentStock * product.cost, 0);
  const movements = getVisibleInventoryMovements(store);
  const categories = uniqueValues(store.products.map((product) => product.categoryName));

  const productFilters = {
    q: getParam(params, "q"),
    category: getParam(params, "category"),
    stockStatus: getParam(params, "stockStatus"),
    active: getParam(params, "active"),
  };
  const movementFilters = {
    from: getParam(params, "from"),
    to: getParam(params, "to"),
    productId: getParam(params, "productId"),
    movementType: getParam(params, "movementType"),
  };

  const filteredProducts = store.products.filter((product) => {
    const stockStatus = product.currentStock <= store.settings.lowStockThreshold ? "low" : "healthy";
    const activeStatus = product.active ? "active" : "inactive";
    return (
      matchesQuery(productFilters.q, [product.name, product.categoryName, product.sku, product.barcode ?? ""]) &&
      (!productFilters.category || product.categoryName === productFilters.category) &&
      (!productFilters.stockStatus || productFilters.stockStatus === stockStatus) &&
      (!productFilters.active || productFilters.active === activeStatus)
    );
  });

  const filteredMovements = movements.filter(
    (movement) =>
      isInsideOptionalRange(movement.happenedAt, movementFilters.from, movementFilters.to) &&
      (!movementFilters.productId || movement.productId === movementFilters.productId) &&
      (!movementFilters.movementType || movement.type === movementFilters.movementType),
  );

  const pagedProducts = paginateItems(filteredProducts, params);
  const pagedMovements = paginateItems(filteredMovements, params, "movementPage", "movementPageSize");

  return (
    <div className="space-y-4">
      <PageHeader description="Productos y stock." eyebrow="Inventario" title="Inventario" />
      <PageNotice searchParams={params} />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard accent="orange" hint="Catalogo." icon={Boxes} label="Productos" value={String(store.products.length)} />
        <StatCard accent="teal" hint="Costo vigente." icon={ShieldCheck} label="Valor" value={formatCurrency(inventoryValue)} />
        <StatCard accent="indigo" hint="Bajo umbral." icon={AlertTriangle} label="Stock bajo" value={String(lowStockCount)} />
        <StatCard accent="orange" hint="Filtrados." icon={RefreshCcw} label="Movimientos" value={String(filteredMovements.length)} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.72fr_1.28fr]">
        <article className="surface rounded-[1.8rem] p-5">
          <p className="label">Ajuste manual</p>
          <h2 className="mt-1 text-2xl font-semibold">Corregir stock</h2>
          {store.products.length ? (
            <form action={adjustStockAction} className="mt-5 space-y-4">
              <select className="select-base" name="productId">
                {store.products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
              <input className="input-base" name="quantityChange" placeholder="Ej: 3 o -2" required type="number" />
              <input className="input-base" defaultValue={new Date().toISOString().slice(0, 16)} name="happenedAt" required type="datetime-local" />
              <textarea className="textarea-base min-h-24" name="note" placeholder="Motivo" />
              <SubmitButton label="Aplicar ajuste" pendingLabel="Aplicando..." />
            </form>
          ) : (
            <div className="mt-5">
              <EmptyState description="Crea productos primero." title="Sin productos" />
            </div>
          )}
        </article>

        <article className="surface rounded-[1.8rem] p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="label">Catalogo</p>
              <h2 className="mt-1 text-2xl font-semibold">Productos</h2>
            </div>
            <Link className="btn-secondary !py-2" href="/inventario">
              Limpiar
            </Link>
          </div>

          <form className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4" method="get">
            <input className="input-base" defaultValue={productFilters.q} name="q" placeholder="Buscar producto" />
            <select className="select-base" defaultValue={productFilters.category} name="category">
              <option value="">Categoria</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
            <select className="select-base" defaultValue={productFilters.stockStatus} name="stockStatus">
              <option value="">Stock</option>
              <option value="low">Stock bajo</option>
              <option value="healthy">Stock ok</option>
            </select>
            <select className="select-base" defaultValue={productFilters.active} name="active">
              <option value="">Estado</option>
              <option value="active">Activo</option>
              <option value="inactive">Inactivo</option>
            </select>
            <button className="btn-primary md:col-span-2 xl:col-span-4" type="submit">
              Filtrar
            </button>
          </form>

          {pagedProducts.items.length ? (
            <div className="mt-5 overflow-x-auto">
              <table className="min-w-[860px] text-left text-sm">
                <thead className="text-stone-500">
                  <tr>
                    <th className="pb-3">Producto</th>
                    <th className="pb-3">Categoria</th>
                    <th className="pb-3">SKU / código</th>
                    <th className="pb-3">Costo</th>
                    <th className="pb-3">Precio</th>
                    <th className="pb-3">Stock</th>
                    <th className="pb-3">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200/60">
                  {pagedProducts.items.map((product) => (
                    <tr key={product.id}>
                      <td className="py-4 font-medium">{product.name}</td>
                      <td className="py-4 text-stone-600">{product.categoryName}</td>
                      <td className="py-4 text-stone-500">{product.sku}{product.barcode ? ` · ${product.barcode}` : ""}</td>
                      <td className="py-4">{formatCurrency(product.cost)}</td>
                      <td className="py-4">{formatCurrency(product.salePrice)}</td>
                      <td className="py-4 font-semibold">{product.currentStock}</td>
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
              <EmptyState description="Ajusta los filtros o crea productos." title="Sin resultados" />
            </div>
          )}

          <Pagination basePath="/inventario" searchParams={params} {...pagedProducts} />
        </article>
      </section>

      <article className="surface rounded-[1.8rem] p-5">
        <p className="label">Movimientos</p>
        <h2 className="mt-1 text-2xl font-semibold">Inventario</h2>

        <form className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4" method="get">
          <input className="input-base" defaultValue={movementFilters.from} name="from" type="date" />
          <input className="input-base" defaultValue={movementFilters.to} name="to" type="date" />
          <select className="select-base" defaultValue={movementFilters.productId} name="productId">
            <option value="">Producto</option>
            {store.products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </select>
          <select className="select-base" defaultValue={movementFilters.movementType} name="movementType">
            <option value="">Tipo</option>
            <option value="purchase">Compra</option>
            <option value="sale">Venta</option>
            <option value="adjustment">Ajuste</option>
          </select>
          <button className="btn-primary md:col-span-2 xl:col-span-4" type="submit">
            Filtrar movimientos
          </button>
        </form>

        {pagedMovements.items.length ? (
          <div className="mt-5 overflow-x-auto">
            <table className="min-w-[760px] text-left text-sm">
              <thead className="text-stone-500">
                <tr>
                  <th className="pb-3">Fecha</th>
                  <th className="pb-3">Producto</th>
                  <th className="pb-3">Tipo</th>
                  <th className="pb-3">Cantidad</th>
                  <th className="pb-3">Nota</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200/60">
                {pagedMovements.items.map((movement) => (
                  <tr key={movement.id}>
                    <td className="py-4">{formatDateTime(movement.happenedAt)}</td>
                    <td className="py-4 font-medium">{movement.productName}</td>
                    <td className="py-4 text-stone-600">{movementLabels[movement.type]}</td>
                    <td className="py-4 font-semibold">{movement.quantity > 0 ? `+${movement.quantity}` : movement.quantity}</td>
                    <td className="py-4 text-stone-600">{movement.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-5">
            <EmptyState description="Ajusta los filtros o registra movimientos." title="Sin movimientos" />
          </div>
        )}

        <Pagination
          basePath="/inventario"
          pageParam="movementPage"
          pageSizeParam="movementPageSize"
          searchParams={params}
          {...pagedMovements}
        />
      </article>
    </div>
  );
}
