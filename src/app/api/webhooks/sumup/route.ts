import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import { decryptSumUpCredentials } from "@/lib/payments/credentials";
import { SumUpProvider } from "@/lib/payments/sumup";
import { getSupabaseAdminClient } from "@/lib/supabase";

export async function POST(request: Request) {
  const raw = await request.text();
  let event: { id?: string; event_type?: string };
  try { event = JSON.parse(raw) as { id?: string; event_type?: string }; } catch { return NextResponse.json({ error: "invalid_payload" }, { status: 400 }); }
  if (!event.id || !event.event_type) return NextResponse.json({ error: "invalid_event" }, { status: 400 });
  const supabase = getSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const hash = createHash("sha256").update(raw).digest("hex");
  const { data: existing } = await supabase.from("payment_webhook_events").select("processing_status").eq("provider", "sumup").eq("external_event_id", event.id).maybeSingle();
  if (existing?.processing_status === "processed") return new NextResponse(null, { status: 204 });
  await supabase.from("payment_webhook_events").upsert({ provider: "sumup", external_event_id: event.id, event_type: event.event_type, payload_hash: hash, payload: event, processing_status: "received" }, { onConflict: "provider,external_event_id" });
  try {
    const { data: attempt } = await supabase.from("booking_payment_attempts").select("hold_id,organization_id").eq("external_checkout_id", event.id).maybeSingle();
    if (!attempt) return new NextResponse(null, { status: 204 });
    const { data: connection } = await supabase.from("payment_provider_connections").select("encrypted_credentials,credential_iv").eq("organization_id", attempt.organization_id).eq("provider", "sumup").eq("active", true).maybeSingle();
    if (!connection) throw new Error("Payment connection unavailable");
    const credentials = decryptSumUpCredentials(connection.encrypted_credentials, connection.credential_iv);
    const checkout = await new SumUpProvider(credentials.apiKey).getCheckout(event.id);
    if (checkout.status !== "paid") return new NextResponse(null, { status: 204 });
    const { error } = await supabase.rpc("confirm_public_booking_payment", { p_hold_id: attempt.hold_id, p_provider: "sumup", p_checkout_id: checkout.id, p_paid_amount: checkout.amount });
    if (error) throw error;
    await supabase.from("booking_payment_attempts").update({ status: "paid", paid_at: new Date().toISOString() }).eq("external_checkout_id", checkout.id);
    await supabase.from("payment_webhook_events").update({ processing_status: "processed", processed_at: new Date().toISOString() }).eq("provider", "sumup").eq("external_event_id", event.id);
    return new NextResponse(null, { status: 204 });
  } catch {
    await supabase.from("payment_webhook_events").update({ processing_status: "failed" }).eq("provider", "sumup").eq("external_event_id", event.id);
    return NextResponse.json({ error: "verification_failed" }, { status: 502 });
  }
}