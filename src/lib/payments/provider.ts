export interface CheckoutVerification { id: string; status: "paid" | "pending" | "failed"; amount: number; }
export interface PaymentProvider {
  createCheckout(input: { amount: number; reference: string; returnUrl: string }): Promise<{ checkoutId: string; checkoutUrl: string }>;
  getCheckout(checkoutId: string): Promise<CheckoutVerification>;
  getConnectionStatus(): Promise<"connected" | "disconnected">;
  disconnectAccount(): Promise<void>;
  refundPayment(checkoutId: string, amount: number): Promise<void>;
}