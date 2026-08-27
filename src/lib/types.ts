export type Role = "admin" | "recepcion" | "estilista" | "super_admin";

export type AppointmentStatus =
  | "scheduled"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "no_show";

export type PaymentStatus = "unpaid" | "partial" | "paid";

export type InventoryMovementType = "purchase" | "sale" | "adjustment";

export type PaymentMethod =
  | "cash"
  | "transfer"
  | "card"
  | "mercado_pago"
  | "other";

export type SaleOrigin = "appointment" | "manual";

export type SaleItemType = "service" | "product";

export interface Settings {
  salonName: string;
  businessName: string;
  currency: string;
  locale: string;
  timezone: string;
  lowStockThreshold: number;
}

export interface Profile {
  id: string;
  name: string;
  email: string;
  password: string;
  role: Role;
  professionalId?: string;
  active?: boolean;
}

export interface Professional {
  id: string;
  name: string;
  specialty: string;
  color: string;
  active: boolean;
}

export interface CategoryOption {
  id: string;
  name: string;
}

export interface Client {
  id: string;
  name: string;
  phone: string;
  email?: string;
  birthday?: string;
  preferences: string;
  notes: string;
  createdAt: string;
}

export interface Service {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  durationMinutes: number;
  basePrice: number;
  active: boolean;
}

export interface Product {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  cost: number;
  salePrice: number;
  currentStock: number;
  sku: string;
  active: boolean;
}

export interface AppointmentServiceLine {
  id: string;
  serviceId: string;
  serviceName: string;
  categoryName: string;
  price: number;
  durationMinutes: number;
  notes?: string;
}

export interface Appointment {
  id: string;
  clientId: string;
  professionalId: string;
  startAt: string;
  notes: string;
  status: AppointmentStatus;
  services: AppointmentServiceLine[];
  estimatedTotal: number;
  totalDurationMinutes: number;
  saleId?: string;
  createdAt: string;
}

export interface SaleItem {
  id: string;
  type: SaleItemType;
  referenceId?: string;
  name: string;
  categoryName: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface Sale {
  id: string;
  clientId: string;
  professionalId: string;
  origin: SaleOrigin;
  appointmentId?: string;
  soldAt: string;
  notes: string;
  items: SaleItem[];
  total: number;
  amountPaid: number;
  amountDue: number;
  paymentStatus: PaymentStatus;
}

export interface Payment {
  id: string;
  saleId: string;
  amount: number;
  method: PaymentMethod;
  paidAt: string;
  note: string;
}

export interface PurchaseItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitCost: number;
  total: number;
}

export interface Purchase {
  id: string;
  purchasedAt: string;
  supplier: string;
  categoryName: string;
  notes: string;
  items: PurchaseItem[];
  total: number;
}

export interface Expense {
  id: string;
  spentAt: string;
  categoryId: string;
  categoryName: string;
  description: string;
  amount: number;
}

export interface InventoryMovement {
  id: string;
  productId: string;
  productName: string;
  type: InventoryMovementType;
  quantity: number;
  unitCost?: number;
  note: string;
  happenedAt: string;
  referenceId?: string;
}

export interface AppStore {
  settings: Settings;
  profiles: Profile[];
  professionals: Professional[];
  serviceCategories: CategoryOption[];
  productCategories: CategoryOption[];
  expenseCategories: CategoryOption[];
  clients: Client[];
  services: Service[];
  products: Product[];
  appointments: Appointment[];
  sales: Sale[];
  payments: Payment[];
  purchases: Purchase[];
  expenses: Expense[];
  inventoryMovements: InventoryMovement[];
}

export interface FilterState {
  from: string;
  to: string;
  professionalId: string;
  category: string;
  paymentStatus: string;
  appointmentStatus: string;
  clientId: string;
  saleKind: string;
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  professionalId?: string;
  organizationId?: string;
  branchId?: string;
  impersonatingOrganizationId?: string;
  isPlatformAdmin?: boolean;
}
