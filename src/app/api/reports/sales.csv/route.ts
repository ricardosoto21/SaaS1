import { getSessionUser } from "@/lib/auth";
import { getClientName, getProfessionalName, getVisibleSales } from "@/lib/data";
import { readStore } from "@/lib/store";

function csvValue(value: unknown) { const text = String(value ?? "").replaceAll('"', '""'); return `"${/^[=+\-@]/.test(text) ? `'${text}` : text}"`; }

export async function GET() {
  const user = await getSessionUser();
  if (!user || !["admin", "recepcion"].includes(user.role)) return new Response("Unauthorized", { status: 401 });
  const store = await readStore(user); const sales = getVisibleSales(store, user);
  const rows = [["Fecha","Cliente","Profesional","Total","Pagado","Pendiente","Estado"], ...sales.map((sale) => [sale.soldAt, getClientName(store,sale.clientId), getProfessionalName(store,sale.professionalId), sale.total, sale.amountPaid, sale.amountDue, sale.paymentStatus])];
  return new Response(`\uFEFF${rows.map((row) => row.map(csvValue).join(",")).join("\n")}`, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=ventas.csv", "Cache-Control": "no-store" } });
}