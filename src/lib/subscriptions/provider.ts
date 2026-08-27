export interface SubscriptionPaymentProvider {
  createCustomer(input: { email: string; name: string }): Promise<{ customerId: string }>;
  createSubscription(input: { customerId: string; planCode: string; returnUrl: string }): Promise<{ subscriptionId: string; checkoutUrl?: string }>;
  cancelSubscription(input: { subscriptionId: string }): Promise<void>;
  updateSubscription(input: { subscriptionId: string; planCode: string }): Promise<void>;
  getSubscription(input: { subscriptionId: string }): Promise<{ status: "active" | "past_due" | "cancelled"; currentPeriodEnd: string }>;
  handleWebhook(input: { payload: string; signature?: string | null }): Promise<void>;
}

// A provider must be configured by platform operations before SaaS checkout is enabled.
export class DisabledSubscriptionPaymentProvider implements SubscriptionPaymentProvider {
  private unavailable(): never { throw new Error("Subscription payments are not configured."); }
  async createCustomer(): Promise<{ customerId: string }> { return this.unavailable(); }
  async createSubscription(): Promise<{ subscriptionId: string; checkoutUrl?: string }> { return this.unavailable(); }
  async cancelSubscription(): Promise<void> { return this.unavailable(); }
  async updateSubscription(): Promise<void> { return this.unavailable(); }
  async getSubscription(): Promise<{ status: "active" | "past_due" | "cancelled"; currentPeriodEnd: string }> { return this.unavailable(); }
  async handleWebhook(): Promise<void> { return this.unavailable(); }
}