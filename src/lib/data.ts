import {
  endOfMonth,
  format,
  isAfter,
  isBefore,
  parseISO,
  startOfMonth,
} from "date-fns";

import type {
  AppStore,
  Appointment,
  Client,
  FilterState,
  InventoryMovement,
  Payment,
  Professional,
  Role,
  Sale,
  SessionUser,
} from "@/lib/types";

export const navItems = [
  { href: "/super-admin", label: "Plataforma", roles: ["super_admin"] as Role[] },
  { href: "/dashboard", label: "Dashboard", roles: ["admin", "recepcion", "estilista"] as Role[] },
  { href: "/agenda", label: "Agenda", roles: ["admin", "recepcion", "estilista"] as Role[] },
  { href: "/clientes", label: "Clientes", roles: ["admin", "recepcion", "estilista"] as Role[] },
  { href: "/ventas", label: "Ventas", roles: ["admin", "recepcion"] as Role[] },
  { href: "/inventario", label: "Inventario", roles: ["admin", "recepcion"] as Role[] },
  { href: "/compras", label: "Compras", roles: ["admin", "recepcion"] as Role[] },
  { href: "/gastos", label: "Gastos", roles: ["admin", "recepcion"] as Role[] },
  { href: "/reportes", label: "Reportes", roles: ["admin", "recepcion"] as Role[] },
  { href: "/configuracion", label: "Configuracion", roles: ["admin"] as Role[] },
];

export function getCurrentMonthRange() {
  const now = new Date();
  return {
    from: format(startOfMonth(now), "yyyy-MM-dd"),
    to: format(endOfMonth(now), "yyyy-MM-dd"),
  };
}

export function normalizeFilters(
  searchParams?: Record<string, string | string[] | undefined>,
): FilterState {
  const current = getCurrentMonthRange();

  const getValue = (key: string) => {
    const value = searchParams?.[key];
    return typeof value === "string" ? value : "";
  };

  return {
    from: getValue("from") || current.from,
    to: getValue("to") || current.to,
    professionalId: getValue("professionalId"),
    category: getValue("category"),
    paymentStatus: getValue("paymentStatus"),
    appointmentStatus: getValue("appointmentStatus"),
    clientId: getValue("clientId"),
    saleKind: getValue("saleKind"),
  };
}

export function roleCanAccess(role: Role, path: string) {
  if (role === "super_admin") return path === "/super-admin";
  return navItems.some((item) => item.href === path && item.roles.includes(role));
}

export function getVisibleProfessionals(store: AppStore, user: SessionUser) {
  if (user.role === "estilista" && user.professionalId) {
    return store.professionals.filter((item) => item.id === user.professionalId);
  }

  return store.professionals.filter((item) => item.active);
}

export function getVisibleClients(store: AppStore) {
  return [...store.clients].sort((a, b) => a.name.localeCompare(b.name, "es-CL"));
}

export function getProfessionalName(store: AppStore, professionalId: string) {
  return store.professionals.find((item) => item.id === professionalId)?.name ?? "Sin profesional";
}

export function getClientName(store: AppStore, clientId: string) {
  return store.clients.find((item) => item.id === clientId)?.name ?? "Cliente sin ficha";
}

export function getPaymentsForSale(store: AppStore, saleId: string) {
  return store.payments
    .filter((item) => item.saleId === saleId)
    .sort((a, b) => a.paidAt.localeCompare(b.paidAt));
}

export function getClientDebt(store: AppStore, clientId: string) {
  return store.sales
    .filter((item) => item.clientId === clientId)
    .reduce((sum, sale) => sum + sale.amountDue, 0);
}

export function isInsideRange(value: string, from: string, to: string) {
  const date = parseISO(value);
  const fromDate = parseISO(`${from}T00:00:00`);
  const toDate = parseISO(`${to}T23:59:59`);
  return !isBefore(date, fromDate) && !isAfter(date, toDate);
}

export function getVisibleAppointments(store: AppStore, user: SessionUser) {
  return store.appointments
    .filter((item) => {
      if (user.role === "estilista") {
        return item.professionalId === user.professionalId;
      }
      return true;
    })
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
}

export function getVisibleSales(store: AppStore, user: SessionUser) {
  return store.sales
    .filter((item) => {
      if (user.role === "estilista") {
        return item.professionalId === user.professionalId;
      }
      return true;
    })
    .sort((a, b) => b.soldAt.localeCompare(a.soldAt));
}

export function getVisiblePurchases(store: AppStore) {
  return [...store.purchases].sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt));
}

export function getVisibleExpenses(store: AppStore) {
  return [...store.expenses].sort((a, b) => b.spentAt.localeCompare(a.spentAt));
}

export function getVisibleInventoryMovements(store: AppStore) {
  return [...store.inventoryMovements].sort((a, b) => b.happenedAt.localeCompare(a.happenedAt));
}

export function getAppointmentsReadyToClose(store: AppStore, user: SessionUser) {
  return getVisibleAppointments(store, user).filter((item) => item.status === "completed" && !item.saleId);
}

function saleMatchesCategory(sale: Sale, category: string) {
  if (!category) {
    return true;
  }

  return sale.items.some((item) => item.categoryName === category);
}

function appointmentMatchesCategory(appointment: Appointment, category: string) {
  if (!category) {
    return true;
  }

  return appointment.services.some((item) => item.categoryName === category);
}

function saleMatchesKind(sale: Sale, saleKind: string) {
  if (!saleKind) {
    return true;
  }

  const computedKind =
    sale.items.some((item) => item.type === "service") && sale.items.some((item) => item.type === "product")
      ? "mixed"
      : sale.origin;

  return computedKind === saleKind;
}

export function getDashboardData(
  store: AppStore,
  user: SessionUser,
  filters: FilterState,
) {
  const sales = getVisibleSales(store, user).filter(
    (sale) =>
      isInsideRange(sale.soldAt, filters.from, filters.to) &&
      (!filters.professionalId || sale.professionalId === filters.professionalId) &&
      (!filters.clientId || sale.clientId === filters.clientId) &&
      (!filters.paymentStatus || sale.paymentStatus === filters.paymentStatus) &&
      saleMatchesCategory(sale, filters.category) &&
      saleMatchesKind(sale, filters.saleKind),
  );

  const payments = store.payments.filter((payment) => {
    const sale = store.sales.find((item) => item.id === payment.saleId);
    if (!sale) {
      return false;
    }

    if (user.role === "estilista" && sale.professionalId !== user.professionalId) {
      return false;
    }

    return isInsideRange(payment.paidAt, filters.from, filters.to);
  });

  const appointments = getVisibleAppointments(store, user).filter(
    (appointment) =>
      isInsideRange(appointment.startAt, filters.from, filters.to) &&
      (!filters.professionalId || appointment.professionalId === filters.professionalId) &&
      (!filters.clientId || appointment.clientId === filters.clientId) &&
      (!filters.appointmentStatus || appointment.status === filters.appointmentStatus) &&
      appointmentMatchesCategory(appointment, filters.category),
  );

  const expenses = store.expenses.filter(
    (expense) =>
      isInsideRange(expense.spentAt, filters.from, filters.to) &&
      (!filters.category || expense.categoryName === filters.category),
  );

  const purchases = store.purchases.filter(
    (purchase) =>
      isInsideRange(purchase.purchasedAt, filters.from, filters.to) &&
      (!filters.category || purchase.categoryName === filters.category),
  );

  const totalSales = sales.reduce((sum, sale) => sum + sale.total, 0);
  const totalCollected = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const totalDue = sales.reduce((sum, sale) => sum + sale.amountDue, 0);
  const totalExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const totalPurchases = purchases.reduce((sum, purchase) => sum + purchase.total, 0);

  const appointmentStatusCounts = appointments.reduce<Record<string, number>>((acc, appointment) => {
    acc[appointment.status] = (acc[appointment.status] ?? 0) + 1;
    return acc;
  }, {});

  const topServices = sales
    .flatMap((sale) => sale.items.filter((item) => item.type === "service"))
    .reduce<Record<string, number>>((acc, item) => {
      acc[item.name] = (acc[item.name] ?? 0) + item.total;
      return acc;
    }, {});

  const topProducts = sales
    .flatMap((sale) => sale.items.filter((item) => item.type === "product"))
    .reduce<Record<string, number>>((acc, item) => {
      acc[item.name] = (acc[item.name] ?? 0) + item.total;
      return acc;
    }, {});

  const topProfessionals = sales.reduce<Record<string, number>>((acc, sale) => {
    const name = getProfessionalName(store, sale.professionalId);
    acc[name] = (acc[name] ?? 0) + sale.total;
    return acc;
  }, {});

  const lowStockProducts = store.products
    .filter((product) => product.currentStock <= store.settings.lowStockThreshold)
    .sort((a, b) => a.currentStock - b.currentStock);

  return {
    sales,
    payments,
    appointments,
    expenses,
    purchases,
    totals: {
      totalSales,
      totalCollected,
      totalDue,
      totalExpenses,
      totalPurchases,
      cashResult: totalCollected - totalExpenses - totalPurchases,
    },
    appointmentStatusCounts,
    lowStockProducts,
    topServices: Object.entries(topServices)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5),
    topProducts: Object.entries(topProducts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5),
    topProfessionals: Object.entries(topProfessionals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5),
  };
}

export function getClientDetail(store: AppStore, clientId: string) {
  const client = store.clients.find((item) => item.id === clientId) ?? store.clients[0] ?? null;
  if (!client) {
    return null;
  }

  const appointments = store.appointments
    .filter((item) => item.clientId === client.id)
    .sort((a, b) => b.startAt.localeCompare(a.startAt));
  const sales = store.sales
    .filter((item) => item.clientId === client.id)
    .sort((a, b) => b.soldAt.localeCompare(a.soldAt));

  return {
    client,
    appointments,
    sales,
    debt: getClientDebt(store, client.id),
  };
}

export function buildCalendarByProfessional(
  appointments: Appointment[],
  professionals: Professional[],
  store: AppStore,
) {
  return professionals.map((professional) => ({
    professional,
    appointments: appointments
      .filter((item) => item.professionalId === professional.id)
      .map((item) => ({
        ...item,
        clientName: getClientName(store, item.clientId),
      })),
  }));
}

export function getCategoriesForFilters(store: AppStore) {
  return [
    ...store.serviceCategories.map((item) => item.name),
    ...store.productCategories.map((item) => item.name),
    ...store.expenseCategories.map((item) => item.name),
    ...store.purchases.map((item) => item.categoryName),
  ].filter((value, index, values) => value && values.indexOf(value) === index);
}

export function getRecentActivity(store: AppStore, user: SessionUser) {
  const appointmentEvents = getVisibleAppointments(store, user).map((item) => ({
    id: item.id,
    happenedAt: item.startAt,
    title: `${getClientName(store, item.clientId)} - ${getProfessionalName(store, item.professionalId)}`,
    subtitle: `Cita ${item.status}`,
  }));

  const saleEvents = getVisibleSales(store, user).map((item) => ({
    id: item.id,
    happenedAt: item.soldAt,
    title: `${getClientName(store, item.clientId)} - ${getProfessionalName(store, item.professionalId)}`,
    subtitle: `Venta ${item.paymentStatus}`,
  }));

  const expenseEvents = getVisibleExpenses(store).map((item) => ({
    id: item.id,
    happenedAt: item.spentAt,
    title: item.categoryName,
    subtitle: item.description,
  }));

  return [...appointmentEvents, ...saleEvents, ...expenseEvents]
    .sort((a, b) => b.happenedAt.localeCompare(a.happenedAt))
    .slice(0, 8);
}

export function getProductSalesMovements(store: AppStore, productId: string): InventoryMovement[] {
  return getVisibleInventoryMovements(store).filter((item) => item.productId === productId);
}

export function getPaymentSummary(store: AppStore, sale: Sale): Payment[] {
  return getPaymentsForSale(store, sale.id);
}

export function findClient(store: AppStore, clientId: string): Client | undefined {
  return store.clients.find((item) => item.id === clientId);
}
