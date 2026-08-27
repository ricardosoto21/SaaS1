import Link from "next/link";
import { redirect } from "next/navigation";
import { PackageSearch, ReceiptText, TrendingUp, Wallet } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { getClientName, getCurrentMonthRange, getProfessionalName, getVisibleAppointments, getVisibleSales, roleCanAccess } from "@/lib/data";
import { getParam, isInsideOptionalRange } from "@/lib/listing";
import { requireSession } from "@/lib/auth";
import { readStore } from "@/lib/store";
import { getSupabaseServerClient } from "@/lib/supabase";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

function topRows(items: Map<string, number>) {
  return [...items.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
}

export default async function ReportsPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireSession();
  if (!roleCanAccess(user.role, "/reportes")) redirect("/dashboard");

  const params = (await searchParams) ?? {};
  const currentMonth = getCurrentMonthRange();
  const from = getParam(params, "from") || currentMonth.from;
  const to = getParam(params, "to") || currentMonth.to;
  const store = await readStore(user);
  const supabase = await getSupabaseServerClient();
  const sales = getVisibleSales(store, user).filter((sale) => isInsideOptionalRange(sale.soldAt, from, to));
  const appointments = getVisibleAppointments(store, user).filter((appointment) => isInsideOptionalRange(appointment.startAt, from, to));
  const expenses = store.expenses.filter((expense) => isInsideOptionalRange(expense.spentAt, from, to));
  const revenue = sales.reduce((sum, sale) => sum + sale.total, 0);
  const collected = sales.reduce((sum, sale) => sum + sale.amountPaid, 0);
  const receivable = sales.reduce((sum, sale) => sum + sale.amountDue, 0);
  const productCost = sales.flatMap((sale) => sale.items).filter((item) => item.type === "product").reduce((sum, item) => sum + ((store.products.find((product) => product.id === item.referenceId)?.cost ?? 0) * item.quantity), 0);
  const expenseTotal = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const commissionResponse = supabase ? await supabase.from("commission_entries").select("amount,created_at").eq("organization_id", user.organizationId ?? "").eq("branch_id", user.branchId ?? "").gte("created_at", `${from}T00:00:00`).lte("created_at", `${to}T23:59:59.999`) : { data: [] };
  const commissionTotal = (commissionResponse.data ?? []).reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0);
  const operationalProfit = revenue - productCost - expenseTotal - commissionTotal;
  const criticalStock = store.products.filter((product) => product.currentStock <= store.settings.lowStockThreshold);
  const noShows = appointments.filter((appointment) => appointment.status === "no_show");
  const productTotals = new Map<string, number>();
  const serviceTotals = new Map<string, number>();
  const professionalTotals = new Map<string, number>();

  for (const sale of sales) {
    const professionalName = getProfessionalName(store, sale.professionalId);
    professionalTotals.set(professionalName, (professionalTotals.get(professionalName) ?? 0) + sale.total);
    for (const item of sale.items) {
      const target = item.type === "product" ? productTotals : serviceTotals;
      target.set(item.name, (target.get(item.name) ?? 0) + item.quantity);
    }
  }

  return <div className="space-y-4">
    <PageHeader eyebrow="Reportes" title="Operación" description="La utilidad es estimada y no reemplaza contabilidad formal." />
    <form className="surface grid gap-3 rounded-[1rem] p-5 md:grid-cols-[1fr_1fr_auto]" method="get">
      <input className="input-base" defaultValue={from} name="from" type="date" />
      <input className="input-base" defaultValue={to} name="to" type="date" />
      <button className="btn-primary" type="submit">Aplicar periodo</button>
    </form>
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <StatCard accent="teal" icon={Wallet} hint={"Cobrado " + formatCurrency(collected) + "."} label="Ventas" value={formatCurrency(revenue)} />
      <StatCard accent="orange" icon={TrendingUp} hint="Antes de impuestos." label="Utilidad estimada" value={formatCurrency(operationalProfit)} />
      <StatCard accent="indigo" icon={ReceiptText} hint="Saldos pendientes." label="Por cobrar" value={formatCurrency(receivable)} />
      <StatCard accent="orange" icon={PackageSearch} hint="Bajo el mínimo." label="Stock crítico" value={String(criticalStock.length)} />
    </section>
    <section className="grid gap-4 xl:grid-cols-2">
      <article className="surface rounded-[1rem] p-5"><div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Ventas y cobranzas</h2><Link className="btn-secondary !py-2" href="/api/exports/sales">CSV</Link></div><div className="mt-4 space-y-2 text-sm">{sales.slice(0, 8).map((sale) => <div className="flex justify-between gap-3 border-b border-stone-100 py-2" key={sale.id}><span>{getClientName(store, sale.clientId)} · {getProfessionalName(store, sale.professionalId)}</span><strong>{formatCurrency(sale.total)}</strong></div>)}</div></article>
      <article className="surface rounded-[1rem] p-5"><div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Compras y gastos</h2><div className="flex gap-2"><Link className="btn-secondary !py-2" href="/api/exports/purchases">Compras</Link><Link className="btn-secondary !py-2" href="/api/exports/expenses">Gastos</Link></div></div><div className="mt-4 grid grid-cols-3 gap-3 text-sm"><div className="rounded-xl bg-stone-50 p-3"><p className="text-stone-500">Gastos</p><strong>{formatCurrency(expenseTotal)}</strong></div><div className="rounded-xl bg-stone-50 p-3"><p className="text-stone-500">Costo productos</p><strong>{formatCurrency(productCost)}</strong></div><div className="rounded-xl bg-stone-50 p-3"><p className="text-stone-500">Comisiones</p><strong>{formatCurrency(commissionTotal)}</strong></div></div></article>
      <article className="surface rounded-[1rem] p-5"><h2 className="text-lg font-semibold">Reservas y no-show</h2><div className="mt-4 grid grid-cols-2 gap-3 text-sm"><div className="rounded-xl bg-stone-50 p-3"><p className="text-stone-500">Citas</p><strong>{appointments.length}</strong></div><div className="rounded-xl bg-stone-50 p-3"><p className="text-stone-500">No-show</p><strong>{noShows.length}</strong></div></div></article>
      <article className="surface rounded-[1rem] p-5"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Stock crítico</h2><Link className="btn-secondary !py-2" href="/api/exports/inventory">CSV</Link></div><div className="mt-4 space-y-2 text-sm">{criticalStock.length ? criticalStock.map((product) => <div className="flex justify-between border-b border-stone-100 py-2" key={product.id}><span>{product.name}</span><strong>{product.currentStock}</strong></div>) : <p className="text-stone-600">Sin productos bajo el mínimo.</p>}</div></article>
      <article className="surface rounded-[1rem] p-5"><h2 className="text-lg font-semibold">Servicios más vendidos</h2><div className="mt-4 space-y-2 text-sm">{topRows(serviceTotals).map(([name, quantity]) => <div className="flex justify-between border-b border-stone-100 py-2" key={name}><span>{name}</span><strong>{quantity}</strong></div>)}</div></article>
      <article className="surface rounded-[1rem] p-5"><h2 className="text-lg font-semibold">Productos más vendidos</h2><div className="mt-4 space-y-2 text-sm">{topRows(productTotals).map(([name, quantity]) => <div className="flex justify-between border-b border-stone-100 py-2" key={name}><span>{name}</span><strong>{quantity}</strong></div>)}</div></article>
      <article className="surface rounded-[1rem] p-5"><h2 className="text-lg font-semibold">Desempeño por profesional</h2><div className="mt-4 space-y-2 text-sm">{topRows(professionalTotals).map(([name, total]) => <div className="flex justify-between border-b border-stone-100 py-2" key={name}><span>{name}</span><strong>{formatCurrency(total)}</strong></div>)}</div></article>
      <article className="surface rounded-[1rem] p-5"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Cuentas</h2><Link className="btn-secondary !py-2" href="/api/exports/accounts">CSV</Link></div><div className="mt-4 text-sm text-stone-600"><p>Por cobrar: <strong className="text-stone-900">{formatCurrency(receivable)}</strong></p><p className="mt-2">Revisa el detalle y los abonos desde ventas, compras y gastos.</p></div></article>
    </section>
  </div>;
}
