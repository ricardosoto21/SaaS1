import { NextResponse } from "next/server";

import { requireSession } from "@/lib/auth";
import { readStore } from "@/lib/store";

const allowedDatasets = new Set(["clients", "sales", "products", "inventory", "purchases", "expenses", "accounts"]);

function csvCell(value: unknown) {
  const text = String(value ?? "").replace(/\r?\n/g, " ");
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

function asCsv(rows: Array<Record<string, unknown>>) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  return [headers.map(csvCell).join(","), ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(","))].join("\n");
}

export async function GET(_request: Request, { params }: { params: Promise<{ dataset: string }> }) {
  const user = await requireSession();
  if (user.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { dataset } = await params;
  if (!allowedDatasets.has(dataset)) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const store = await readStore(user);
  const rows: Record<string, unknown>[] = dataset === "clients"
    ? store.clients.map((item) => ({ id: item.id, nombre: item.name, telefono: item.phone, email: item.email, preferencias: item.preferences, notas: item.notes, creado: item.createdAt }))
    : dataset === "sales"
      ? store.sales.map((item) => ({ id: item.id, fecha: item.soldAt, cliente_id: item.clientId, profesional_id: item.professionalId, origen: item.origin, total: item.total, pagado: item.amountPaid, pendiente: item.amountDue, estado_pago: item.paymentStatus, notas: item.notes }))
      : dataset === "products"
        ? store.products.map((item) => ({ id: item.id, nombre: item.name, sku: item.sku, codigo_barras: item.barcode, costo: item.cost, precio_venta: item.salePrice, stock_actual: item.currentStock, activo: item.active }))
        : dataset === "inventory"
          ? store.inventoryMovements.map((item) => ({ id: item.id, fecha: item.happenedAt, producto_id: item.productId, producto: item.productName, tipo: item.type, cantidad: item.quantity, costo_unitario: item.unitCost, referencia: item.referenceId, nota: item.note }))
          : dataset === "purchases"
            ? store.purchases.map((item) => ({ id: item.id, fecha: item.purchasedAt, proveedor: item.supplier, categoria: item.categoryName, total: item.total, notas: item.notes, items: item.items.map((line) => `${line.productName} x${line.quantity}`).join(" | ") }))
            : dataset === "expenses"
              ? store.expenses.map((item) => ({ id: item.id, fecha: item.spentAt, categoria: item.categoryName, descripcion: item.description, monto: item.amount }))
              : store.sales.filter((item) => item.amountDue > 0).map((item) => ({ venta_id: item.id, fecha: item.soldAt, cliente_id: item.clientId, total: item.total, pagado: item.amountPaid, pendiente: item.amountDue, estado: item.paymentStatus }));

  return new NextResponse(asCsv(rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${dataset}.csv"`, "Cache-Control": "no-store" } });
}