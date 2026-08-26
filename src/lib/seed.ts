import type { AppStore } from "@/lib/types";

export const initialStore: AppStore = {
  settings: {
    salonName: "Peluqueria",
    businessName: "Peluqueria",
    currency: "CLP",
    locale: "es-CL",
    timezone: "America/Santiago",
    lowStockThreshold: 4,
  },
  profiles: [
    {
      id: "profile-admin",
      name: "Admin",
      email: "admin@peluqueria.local",
      password: "admin123",
      role: "admin",
      active: true,
    },
  ],
  professionals: [],
  serviceCategories: [],
  productCategories: [],
  expenseCategories: [],
  clients: [],
  services: [],
  products: [],
  appointments: [],
  sales: [],
  payments: [],
  purchases: [],
  expenses: [],
  inventoryMovements: [],
};
