import type { CheckoutVerification, PaymentProvider } from "./provider";

export class SumUpProvider implements PaymentProvider {
  constructor(private readonly apiKey: string) {}
  async createCheckout(input: { amount: number; reference: string; returnUrl: string }) {
    const response = await fetch("https://api.sumup.com/v0.1/checkouts", { method: "POST", headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ amount: input.amount, currency: "CLP", checkout_reference: input.reference, return_url: input.returnUrl }) });
    if (!response.ok) throw new Error("Unable to create payment checkout.");
    const body = await response.json() as { id: string; hosted_checkout_url?: string };
    if (!body.id || !body.hosted_checkout_url) throw new Error("Invalid payment checkout.");
    return { checkoutId: body.id, checkoutUrl: body.hosted_checkout_url };
  }
  async getCheckout(checkoutId: string): Promise<CheckoutVerification> {
    const response = await fetch(`https://api.sumup.com/v0.1/checkouts/${encodeURIComponent(checkoutId)}`, { headers: { Authorization: `Bearer ${this.apiKey}` }, cache: "no-store" });
    if (!response.ok) throw new Error("Unable to verify payment checkout.");
    const body = await response.json() as { id: string; status: string; amount: number | string };
    return { id: body.id, amount: Number(body.amount), status: body.status === "PAID" ? "paid" : body.status === "FAILED" ? "failed" : "pending" };
  }
  async getConnectionStatus() { return this.apiKey ? "connected" as const : "disconnected" as const; }
  async disconnectAccount() {}
  async refundPayment(_checkoutId: string, _amount: number) { throw new Error("Refunds require the merchant SumUp workflow."); }
}