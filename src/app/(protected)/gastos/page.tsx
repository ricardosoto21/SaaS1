import { Landmark, ReceiptText } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { SubmitButton } from "@/components/forms/submit-button";
import { PageHeader } from "@/components/page-header";
import { PageNotice } from "@/components/page-notice";
import { Pagination } from "@/components/pagination";
import { StatCard } from "@/components/stat-card";
import { createExpenseAction, recordExpensePayablePaymentAction } from "@/lib/actions";
import { requireSession } from "@/lib/auth";
import { getCurrentMonthRange, getVisibleExpenses, roleCanAccess } from "@/lib/data";
import { getParam, isInsideOptionalRange, matchesQuery, paginateItems, uniqueValues } from "@/lib/listing";
import { readStore } from "@/lib/store";
import { getSupabaseServerClient } from "@/lib/supabase";
import { formatCurrency, formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface GastosPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function GastosPage({ searchParams }: GastosPageProps) {
  const user = await requireSession();
  if (!roleCanAccess(user.role, "/gastos")) {
    redirect("/dashboard");
  }

  const params = (await searchParams) ?? {};
  const store = await readStore(user);
  const supabase = await getSupabaseServerClient();
  const [supplierResponse, payableResponse] = await Promise.all([
    supabase ? supabase.from("suppliers").select("id,name").eq("organization_id", user.organizationId ?? "").eq("active", true).order("name") : { data: [] },
    supabase ? supabase.from("expenses").select("id,payment_status").eq("organization_id", user.organizationId ?? "").eq("branch_id", user.branchId ?? "") : { data: [] },
  ]);
  const suppliers = supplierResponse.data ?? [];
  const payableStatusByExpense = new Map((payableResponse.data ?? []).map((item) => [String(item.id), String(item.payment_status ?? "paid")]));
  const expenses = getVisibleExpenses(store);
  const currentMonth = getCurrentMonthRange();
  const filters = {
    from: getParam(params, "from") || currentMonth.from,
    to: getParam(params, "to") || currentMonth.to,
    category: getParam(params, "category"),
    q: getParam(params, "q"),
  };
  const categories = uniqueValues(expenses.map((expense) => expense.categoryName));
  const filteredExpenses = expenses.filter(
    (expense) =>
      isInsideOptionalRange(expense.spentAt, filters.from, filters.to) &&
      (!filters.category || expense.categoryName === filters.category) &&
      matchesQuery(filters.q, [expense.categoryName, expense.description]),
  );
  const totalExpenses = filteredExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const pagedExpenses = paginateItems(filteredExpenses, params);

  return (
    <div className="space-y-4">
      <PageHeader description="Gastos del negocio." eyebrow="Gastos" title="Gastos" />
      <PageNotice searchParams={params} />

      <section className="grid gap-4 md:grid-cols-2">
        <StatCard accent="orange" hint="Segun filtros." icon={Landmark} label="Gastos" value={formatCurrency(totalExpenses)} />
        <StatCard accent="teal" hint="Filtrados." icon={ReceiptText} label="Movimientos" value={String(filteredExpenses.length)} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.72fr_1.28fr]">
        <article className="surface rounded-[1.8rem] p-5">
          <p className="label">Nuevo gasto</p>
          <h2 className="mt-1 text-2xl font-semibold">Registrar egreso</h2>
          <form action={createExpenseAction} className="mt-5 space-y-4">
            <input className="input-base" name="categoryName" placeholder="Categoria" required />
            <input className="input-base" defaultValue={new Date().toISOString().slice(0, 16)} name="spentAt" required type="datetime-local" />
            <input className="input-base" name="description" placeholder="Descripcion" required />
            <input className="input-base" min={0} name="amount" placeholder="Monto" required type="number" />
            <select className="select-base" name="supplierId"><option value="">Sin proveedor</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select>
            <select className="select-base" defaultValue="paid" name="paymentStatus"><option value="paid">Pagado</option><option value="pending">Pendiente</option></select>
            <select className="select-base" defaultValue="cash" name="paymentMethod"><option value="cash">Efectivo</option><option value="transfer">Transferencia</option><option value="card">Tarjeta</option><option value="other">Otro</option></select>
            <SubmitButton label="Guardar gasto" pendingLabel="Guardando..." />
          </form>
        </article>

        <article className="surface rounded-[1.8rem] p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="label">Historial</p>
              <h2 className="mt-1 text-2xl font-semibold">Gastos registrados</h2>
            </div>
            <Link className="btn-secondary !py-2" href="/gastos">
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

          {pagedExpenses.items.length ? (
            <div className="mt-5 overflow-x-auto">
              <table className="min-w-[680px] text-left text-sm">
                <thead className="text-stone-500">
                  <tr>
                    <th className="pb-3">Fecha</th>
                    <th className="pb-3">Categoria</th>
                    <th className="pb-3">Descripcion</th>
                    <th className="pb-3">Monto</th>
                    <th className="pb-3">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200/60">
                  {pagedExpenses.items.map((expense) => (
                    <tr key={expense.id}>
                      <td className="py-4">{formatDateTime(expense.spentAt)}</td>
                      <td className="py-4 font-medium">{expense.categoryName}</td>
                      <td className="py-4 text-stone-600">{expense.description}</td>
                      <td className="py-4 font-semibold">{formatCurrency(expense.amount)}</td>
                      <td className="py-4">{payableStatusByExpense.get(expense.id) === "pending" && user.role === "admin" ? <details><summary className="cursor-pointer font-semibold text-orange-700">Pendiente</summary><form action={recordExpensePayablePaymentAction} className="mt-3 grid gap-2 rounded-xl bg-stone-50 p-3"><input name="expenseId" type="hidden" value={expense.id}/><input name="amount" type="hidden" value={expense.amount}/><select className="select-base" defaultValue="transfer" name="method"><option value="transfer">Transferencia</option><option value="cash">Efectivo</option><option value="card">Tarjeta</option><option value="other">Otro</option></select><input className="input-base" defaultValue={new Date().toISOString().slice(0, 16)} name="paidAt" required type="datetime-local"/><input className="input-base" name="note" placeholder="Nota"/><button className="btn-primary !py-2 text-sm" type="submit">Marcar pagado</button></form></details> : <span className="text-stone-500">{payableStatusByExpense.get(expense.id) === "pending" ? "Pendiente" : "Pagado"}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mt-5">
              <EmptyState description="Ajusta los filtros o registra un gasto." title="Sin resultados" />
            </div>
          )}

          <Pagination basePath="/gastos" searchParams={params} {...pagedExpenses} />
        </article>
      </section>
    </div>
  );
}
