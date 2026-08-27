import { randomUUID } from "node:crypto";

import { decryptSumUpCredentials } from "@/lib/payments/credentials";
import { SumUpProvider } from "@/lib/payments/sumup";
import { getSupabaseAdminClient } from "@/lib/supabase";

export async function createBookingCheckout(holdId: string, returnUrl: string) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) throw new Error("Payment service is unavailable.");
  const { data: hold, error: holdError } = await supabase.from("booking_holds").select("id,organization_id,deposit_amount,status,expires_at").eq("id", holdId).maybeSingle();
  if (holdError || !hold || hold.status !== "pending_payment" || new Date(hold.expires_at) <= new Date()) throw new Error("Booking hold is unavailable.");
  const { data: existing } = await supabase.from("booking_payment_attempts").select("checkout_url,status").eq("hold_id", hold.id).maybeSingle();
  if (existing?.status === "pending") return existing.checkout_url;
  const { data: connection } = await supabase.from("payment_provider_connections").select("provider,encrypted_credentials,credential_iv").eq("organization_id", hold.organization_id).eq("active", true).maybeSingle();
  if (!connection || connection.provider !== "sumup") throw new Error("Payment provider is unavailable.");
  const credentials = decryptSumUpCredentials(connection.encrypted_credentials, connection.credential_iv);
  const checkout = await new SumUpProvider(credentials.apiKey).createCheckout({ amount: Number(hold.deposit_amount), reference: `booking-${hold.id}`, returnUrl });
  const { error } = await supabase.from("booking_payment_attempts").insert({ id: randomUUID(), organization_id: hold.organization_id, hold_id: hold.id, provider: "sumup", external_checkout_id: checkout.checkoutId, checkout_url: checkout.checkoutUrl });
  if (error) {
    const { data: raced } = await supabase.from("booking_payment_attempts").select("checkout_url").eq("hold_id", hold.id).maybeSingle();
    if (raced) return raced.checkout_url;
    throw error;
  }
  return checkout.checkoutUrl;
}