import { initialStore } from "@/lib/seed";
import { getSupabaseAdminClient, hasSupabaseEnv } from "@/lib/supabase";
import type { TenantScope } from "@/lib/tenant";
import type {
  AppStore,
  Appointment,
  AppointmentServiceLine,
  CategoryOption,
  Client,
  Expense,
  InventoryMovement,
  Payment,
  Product,
  Professional,
  Profile,
  Purchase,
  PurchaseItem,
  Sale,
  SaleItem,
  Service,
  Settings,
} from "@/lib/types";

type Row = Record<string, unknown>;

export function shouldUseSupabaseStore() {
  return hasSupabaseEnv() && process.env.APP_DATA_MODE !== "local";
}

function requiredClient() {
  const client = getSupabaseAdminClient();
  if (!client) {
    throw new Error("Supabase no esta configurado.");
  }
  return client;
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asBoolean(value: unknown, fallback = true) {
  return typeof value === "boolean" ? value : fallback;
}

function indexById<T extends { id: string }>(items: T[]) {
  return new Map(items.map((item) => [item.id, item]));
}

const BRANCH_SCOPED_TABLES = new Set([
  "products",
  "appointments",
  "appointment_services",
  "sales",
  "sale_items",
  "payments",
  "purchases",
  "purchase_items",
  "expenses",
  "inventory_movements",
]);

async function selectAll(table: string, scope: TenantScope) {
  let query = requiredClient().from(table).select("*").eq("organization_id", scope.organizationId);
  if (BRANCH_SCOPED_TABLES.has(table)) {
    query = query.eq("branch_id", scope.branchId);
  }
  const { data, error } = await query;
  if (error) {
    throw new Error(`No se pudo leer ${table}: ${error.message}`);
  }
  return (data ?? []) as Row[];
}

export async function readSupabaseStore(scope: TenantScope): Promise<AppStore> {
  const [
    settingsRows,
    profileRows,
    professionalRows,
    clientRows,
    serviceCategoryRows,
    productCategoryRows,
    expenseCategoryRows,
    serviceRows,
    productRows,
    appointmentRows,
    appointmentServiceRows,
    saleRows,
    saleItemRows,
    paymentRows,
    purchaseRows,
    purchaseItemRows,
    expenseRows,
    inventoryRows,
  ] = await Promise.all([
    selectAll("settings", scope),
    selectAll("profiles", scope),
    selectAll("professionals", scope),
    selectAll("clients", scope),
    selectAll("service_categories", scope),
    selectAll("product_categories", scope),
    selectAll("expense_categories", scope),
    selectAll("services", scope),
    selectAll("products", scope),
    selectAll("appointments", scope),
    selectAll("appointment_services", scope),
    selectAll("sales", scope),
    selectAll("sale_items", scope),
    selectAll("payments", scope),
    selectAll("purchases", scope),
    selectAll("purchase_items", scope),
    selectAll("expenses", scope),
    selectAll("inventory_movements", scope),
  ]);

  const settingsRow = settingsRows[0];
  const settings: Settings = settingsRow
    ? {
        salonName: asString(settingsRow.salon_name, initialStore.settings.salonName),
        businessName: asString(settingsRow.business_name, initialStore.settings.businessName),
        currency: asString(settingsRow.currency, initialStore.settings.currency),
        locale: asString(settingsRow.locale, initialStore.settings.locale),
        timezone: asString(settingsRow.timezone, initialStore.settings.timezone),
        lowStockThreshold: asNumber(settingsRow.low_stock_threshold, initialStore.settings.lowStockThreshold),
      }
    : initialStore.settings;

  const profiles: Profile[] = profileRows.map((row) => ({
    id: asString(row.id),
    name: asString(row.full_name),
    email: asString(row.email),
    password: "",
    role: asString(row.role, "recepcion") as Profile["role"],
    professionalId: asString(row.professional_id) || undefined,
    active: asBoolean(row.active, true),
  }));

  const professionals: Professional[] = professionalRows.map((row) => ({
    id: asString(row.id),
    name: asString(row.full_name),
    specialty: asString(row.specialty),
    color: asString(row.color, "#0f766e"),
    active: asBoolean(row.active, true),
  }));

  const serviceCategories: CategoryOption[] = serviceCategoryRows.map((row) => ({
    id: asString(row.id),
    name: asString(row.name),
  }));
  const productCategories: CategoryOption[] = productCategoryRows.map((row) => ({
    id: asString(row.id),
    name: asString(row.name),
  }));
  const expenseCategories: CategoryOption[] = expenseCategoryRows.map((row) => ({
    id: asString(row.id),
    name: asString(row.name),
  }));
  const serviceCategoryMap = indexById(serviceCategories);
  const productCategoryMap = indexById(productCategories);
  const expenseCategoryMap = indexById(expenseCategories);

  const services: Service[] = serviceRows.map((row) => {
    const categoryId = asString(row.category_id);
    return {
      id: asString(row.id),
      name: asString(row.name),
      categoryId,
      categoryName: serviceCategoryMap.get(categoryId)?.name ?? "",
      durationMinutes: asNumber(row.duration_minutes, 15),
      basePrice: asNumber(row.base_price),
      active: asBoolean(row.active, true),
    };
  });

  const products: Product[] = productRows.map((row) => {
    const categoryId = asString(row.category_id);
    return {
      id: asString(row.id),
      name: asString(row.name),
      categoryId,
      categoryName: productCategoryMap.get(categoryId)?.name ?? "",
      cost: asNumber(row.current_cost),
      salePrice: asNumber(row.sale_price),
      currentStock: asNumber(row.current_stock),
      sku: asString(row.sku),
      active: asBoolean(row.active, true),
    };
  });
  const productMap = indexById(products);

  const appointmentLinesById = new Map<string, AppointmentServiceLine[]>();
  appointmentServiceRows.forEach((row) => {
    const appointmentId = asString(row.appointment_id);
    const service = services.find((item) => item.id === asString(row.service_id));
    const line: AppointmentServiceLine = {
      id: asString(row.id),
      serviceId: asString(row.service_id),
      serviceName: service?.name ?? "Servicio",
      categoryName: service?.categoryName ?? "",
      price: asNumber(row.price),
      durationMinutes: asNumber(row.duration_minutes, 15),
      notes: asString(row.notes) || undefined,
    };
    appointmentLinesById.set(appointmentId, [...(appointmentLinesById.get(appointmentId) ?? []), line]);
  });

  const appointments: Appointment[] = appointmentRows.map((row) => ({
    id: asString(row.id),
    clientId: asString(row.client_id),
    professionalId: asString(row.professional_id),
    startAt: asString(row.start_at),
    notes: asString(row.notes),
    status: asString(row.status, "scheduled") as Appointment["status"],
    services: appointmentLinesById.get(asString(row.id)) ?? [],
    estimatedTotal: asNumber(row.estimated_total),
    totalDurationMinutes: asNumber(row.total_duration_minutes),
    saleId: asString(row.sale_id) || undefined,
    createdAt: asString(row.created_at),
  }));

  const saleItemsById = new Map<string, SaleItem[]>();
  saleItemRows.forEach((row) => {
    const saleId = asString(row.sale_id);
    const item: SaleItem = {
      id: asString(row.id),
      type: asString(row.item_type, "service") as SaleItem["type"],
      referenceId: asString(row.service_id) || asString(row.product_id) || undefined,
      name: asString(row.item_name),
      categoryName: asString(row.category_name),
      quantity: asNumber(row.quantity, 1),
      unitPrice: asNumber(row.unit_price),
      total: asNumber(row.total),
    };
    saleItemsById.set(saleId, [...(saleItemsById.get(saleId) ?? []), item]);
  });

  const sales: Sale[] = saleRows.map((row) => ({
    id: asString(row.id),
    clientId: asString(row.client_id),
    professionalId: asString(row.professional_id),
    origin: asString(row.origin, "manual") as Sale["origin"],
    appointmentId: asString(row.appointment_id) || undefined,
    soldAt: asString(row.sold_at),
    notes: asString(row.notes),
    items: saleItemsById.get(asString(row.id)) ?? [],
    total: asNumber(row.total),
    amountPaid: asNumber(row.amount_paid),
    amountDue: asNumber(row.amount_due),
    paymentStatus: asString(row.payment_status, "unpaid") as Sale["paymentStatus"],
  }));

  const payments: Payment[] = paymentRows.map((row) => ({
    id: asString(row.id),
    saleId: asString(row.sale_id),
    amount: asNumber(row.amount),
    method: asString(row.method, "cash") as Payment["method"],
    paidAt: asString(row.paid_at),
    note: asString(row.note),
  }));

  const purchaseItemsById = new Map<string, PurchaseItem[]>();
  purchaseItemRows.forEach((row) => {
    const purchaseId = asString(row.purchase_id);
    const product = productMap.get(asString(row.product_id));
    const item: PurchaseItem = {
      id: asString(row.id),
      productId: asString(row.product_id),
      productName: product?.name ?? "Producto",
      quantity: asNumber(row.quantity),
      unitCost: asNumber(row.unit_cost),
      total: asNumber(row.total),
    };
    purchaseItemsById.set(purchaseId, [...(purchaseItemsById.get(purchaseId) ?? []), item]);
  });

  const purchases: Purchase[] = purchaseRows.map((row) => ({
    id: asString(row.id),
    purchasedAt: asString(row.purchased_at),
    supplier: asString(row.supplier),
    categoryName: asString(row.category_name),
    notes: asString(row.notes),
    items: purchaseItemsById.get(asString(row.id)) ?? [],
    total: asNumber(row.total),
  }));

  const expenses: Expense[] = expenseRows.map((row) => {
    const categoryId = asString(row.category_id);
    return {
      id: asString(row.id),
      spentAt: asString(row.spent_at),
      categoryId,
      categoryName: expenseCategoryMap.get(categoryId)?.name ?? "",
      description: asString(row.description),
      amount: asNumber(row.amount),
    };
  });

  const inventoryMovements: InventoryMovement[] = inventoryRows.map((row) => {
    const productId = asString(row.product_id);
    return {
      id: asString(row.id),
      productId,
      productName: productMap.get(productId)?.name ?? "Producto",
      type: asString(row.movement_type, "adjustment") as InventoryMovement["type"],
      quantity: asNumber(row.quantity),
      unitCost: row.unit_cost === null ? undefined : asNumber(row.unit_cost),
      note: asString(row.note),
      happenedAt: asString(row.happened_at),
      referenceId: asString(row.reference_id) || undefined,
    };
  });

  const clients: Client[] = clientRows.map((row) => ({
    id: asString(row.id),
    name: asString(row.full_name),
    phone: asString(row.phone),
    email: asString(row.email) || undefined,
    birthday: asString(row.birthday) || undefined,
    preferences: asString(row.preferences),
    notes: asString(row.notes),
    createdAt: asString(row.created_at),
  }));

  return {
    settings,
    profiles,
    professionals,
    serviceCategories,
    productCategories,
    expenseCategories,
    clients,
    services,
    products,
    appointments,
    sales,
    payments,
    purchases,
    expenses,
    inventoryMovements,
  };
}

export async function writeSupabaseStore(store: AppStore, scope: TenantScope) {
  const { error } = await requiredClient().rpc("replace_app_store", {
    payload: { ...store, organizationId: scope.organizationId, branchId: scope.branchId },
  });
  if (error) {
    throw new Error(`No se pudo guardar en Supabase: ${error.message}`);
  }
}
