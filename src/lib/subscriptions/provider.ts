export interface SubscriptionPaymentProvider {
  createCustomer(input: { email: string; name: string }): Promise<{ customerId: string }>;
  createSubscription(input: { customerId: string; planCode: string; returnUrl: string }): Promise<{ subscriptionId: string; checkoutUrl?: string }>;
  cancelSubscription(input: { subscriptionId: string }): Promise<void>;
  updateSubscription(input: { subscriptionId: string; planCode: string }): Promise<void>;
  getSubscription(input: { subscriptionId: string }): Promise<{ status: "pending" | "active" | "past_due" | "cancelled"; currentPeriodEnd: string }>;
  handleWebhook(input: { payload: string; signature?: string | null }): Promise<void>;
}

type MercadoPreapproval = { id?: string; init_point?: string; status?: string; next_payment_date?: string };

export class MercadoPagoSubscriptionProvider implements SubscriptionPaymentProvider {
  constructor(private readonly accessToken: string, private readonly planIds: Record<string, string>) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`https://api.mercadopago.com${path}`, { ...init, headers: { Authorization: `Bearer ${this.accessToken}`, "Content-Type": "application/json", ...(init?.headers ?? {}) }, cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error("Subscription provider request failed.");
    return body as T;
  }

  async createCustomer(input: { email: string; name: string }) {
    void input.name;
    // Mercado Pago subscriptions identify the payer by email; no separate customer is required.
    return { customerId: input.email };
  }

  async createSubscription(input: { customerId: string; planCode: string; returnUrl: string }) {
    const planId = this.planIds[input.planCode];
    if (!planId) throw new Error("Subscription plan is not configured.");
    const subscription = await this.request<MercadoPreapproval>("/preapproval", { method: "POST", body: JSON.stringify({ preapproval_plan_id: planId, payer_email: input.customerId, back_url: input.returnUrl }) });
    if (!subscription.id) throw new Error("Subscription provider returned an invalid response.");
    return { subscriptionId: subscription.id, checkoutUrl: subscription.init_point };
  }

  async cancelSubscription(input: { subscriptionId: string }) {
    await this.request(`/preapproval/${encodeURIComponent(input.subscriptionId)}`, { method: "PUT", body: JSON.stringify({ status: "cancelled" }) });
  }

  async updateSubscription(input: { subscriptionId: string; planCode: string }) {
    const planId = this.planIds[input.planCode];
    if (!planId) throw new Error("Subscription plan is not configured.");
    await this.request(`/preapproval/${encodeURIComponent(input.subscriptionId)}`, { method: "PUT", body: JSON.stringify({ preapproval_plan_id: planId }) });
  }

  async getSubscription(input: { subscriptionId: string }) {
    const subscription = await this.request<MercadoPreapproval>(`/preapproval/${encodeURIComponent(input.subscriptionId)}`);
    const status: "pending" | "active" | "past_due" | "cancelled" = subscription.status === "authorized" ? "active" : subscription.status === "cancelled" ? "cancelled" : subscription.status === "pending" ? "pending" : "past_due";
    return { status, currentPeriodEnd: subscription.next_payment_date ?? new Date().toISOString() };
  }

  async handleWebhook(): Promise<void> {
    // The route validates the event and synchronizes its referenced subscription.
  }
}

export class DisabledSubscriptionPaymentProvider implements SubscriptionPaymentProvider {
  private unavailable(): never { throw new Error("Subscription payments are not configured."); }
  async createCustomer(): Promise<{ customerId: string }> { return this.unavailable(); }
  async createSubscription(): Promise<{ subscriptionId: string; checkoutUrl?: string }> { return this.unavailable(); }
  async cancelSubscription(): Promise<void> { return this.unavailable(); }
  async updateSubscription(): Promise<void> { return this.unavailable(); }
  async getSubscription(): Promise<{ status: "pending" | "active" | "past_due" | "cancelled"; currentPeriodEnd: string }> { return this.unavailable(); }
  async handleWebhook(): Promise<void> { return this.unavailable(); }
}

export function getSubscriptionPaymentProvider(): SubscriptionPaymentProvider {
  const accessToken = process.env.MERCADOPAGO_SUBSCRIPTIONS_ACCESS_TOKEN?.trim();
  const rawPlanIds = process.env.MERCADOPAGO_SUBSCRIPTION_PLAN_IDS?.trim();
  if (!accessToken || !rawPlanIds) return new DisabledSubscriptionPaymentProvider();
  try {
    const planIds = JSON.parse(rawPlanIds) as Record<string, string>;
    if (!Object.values(planIds).every((id) => typeof id === "string" && id.length > 5)) throw new Error("Invalid plan IDs.");
    return new MercadoPagoSubscriptionProvider(accessToken, planIds);
  } catch {
    return new DisabledSubscriptionPaymentProvider();
  }
}

export function isSubscriptionPaymentConfigured() {
  return Boolean(process.env.MERCADOPAGO_SUBSCRIPTIONS_ACCESS_TOKEN?.trim() && process.env.MERCADOPAGO_SUBSCRIPTION_PLAN_IDS?.trim());
}
