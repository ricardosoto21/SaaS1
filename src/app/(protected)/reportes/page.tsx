import Link from "next/link";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { getClientName, getProfessionalName, getVisibleSales, roleCanAccess } from "@/lib/data";
import { requireSession } from "@/lib/auth";
import { readStore } from "@/lib/store";
import { formatCurrency } from "@/lib/utils";
import { Wallet, TrendingUp, PackageSearch, ReceiptText } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const user = await requireSession();
  if (!roleCanAccess(user.role, "/reportes")) redirect("/dashboard");
  const store = await readStore(user);
  const sales = getVisibleSales(store, user);
  const revenue = sales.reduce((sum, sale) => sum + sale.total, 0);
  const receivable = sales.reduce((sum, sale) => sum + sale.amountDue, 0);
  const productCost = sales.flatMap((sale) => sale.items).filter((item) => item.type === "product").reduce((sum, item) => sum + ((store.products.find((product) => product.id === item.referenceId)?.cost ?? 0) * item.quantity), 0);
  const expenses = store.expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const commission = 0;
  const operationalProfit = revenue - productCost - expenses - commission;
  const criticalStock = store.products.filter((product) => product.currentStock <= store.settings.lowStockThreshold);
  const productTotals = new Map<string, number>(); const serviceTotals = new Map<string, number>();
  for (const sale of sales) for (const item of sale.items) { const target = item.type === "product" ? productTotals : serviceTotals; target.set(item.name, (target.get(item.name) ?? 0) + item.quantity); }
  const top = (items: Map<string, number>) => [...items.entries()].sort((a,b) => b[1]-a[1]).slice(0,5);

  return <div className="space-y-4"><PageHeader eyebrow="Reportes" title="Operación" description="Resultados operativos. La utilidad es estimada y no reemplaza contabilidad formal." /><section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><StatCard accent="teal" icon={Wallet} hint="Monto generado." label="Ventas" value={formatCurrency(revenue)} /><StatCard accent="orange" icon={TrendingUp} hint="Antes de impuestos." label="Utilidad estimada" value={formatCurrency(operationalProfit)} /><StatCard accent="indigo" icon={ReceiptText} hint="Saldos pendientes." label="Por cobrar" value={formatCurrency(receivable)} /><StatCard accent="orange" icon={PackageSearch} hint="Bajo el mínimo." label="Stock crítico" value={String(criticalStock.length)} /></section><section className="grid gap-4 xl:grid-cols-2"><article className="surface rounded-[1rem] p-5"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Ventas y cobranzas</h2><Link className="btn-secondary !py-2" href="/api/reports/sales.csv">Exportar CSV</Link></div><div className="mt-4 space-y-2 text-sm">{sales.slice(0,8).map((sale) => <div className="flex justify-between gap-3 border-b border-stone-100 py-2" key={sale.id}><span>{getClientName(store,sale.clientId)} · {getProfessionalName(store,sale.professionalId)}</span><strong>{formatCurrency(sale.total)}</strong></div>)}</div></article><article className="surface rounded-[1rem] p-5"><h2 className="text-lg font-semibold">Stock crítico</h2><div className="mt-4 space-y-2 text-sm">{criticalStock.length ? criticalStock.map((product) => <div className="flex justify-between border-b border-stone-100 py-2" key={product.id}><span>{product.name}</span><strong>{product.currentStock}</strong></div>) : <p className="text-stone-600">Sin productos bajo el mínimo.</p>}</div></article><article className="surface rounded-[1rem] p-5"><h2 className="text-lg font-semibold">Servicios más vendidos</h2><div className="mt-4 space-y-2 text-sm">{top(serviceTotals).map(([name, quantity]) => <div className="flex justify-between border-b border-stone-100 py-2" key={name}><span>{name}</span><strong>{quantity}</strong></div>)}</div></article><article className="surface rounded-[1rem] p-5"><h2 className="text-lg font-semibold">Productos más vendidos</h2><div className="mt-4 space-y-2 text-sm">{top(productTotals).map(([name, quantity]) => <div className="flex justify-between border-b border-stone-100 py-2" key={name}><span>{name}</span><strong>{quantity}</strong></div>)}</div></article></section></div>;
}