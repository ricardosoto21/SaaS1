import { NextResponse } from "next/server";

import { logEvent } from "@/lib/observability/logger";
import { getMessagingProvider, isMessagingConfigured } from "@/lib/messaging/provider";
import { getSubscriptionPaymentProvider, isSubscriptionPaymentConfigured } from "@/lib/subscriptions/provider";
import { getSupabaseAdminClient } from "@/lib/supabase";

export async function GET(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authorization !== `Bearer ${process.env.CRON_SECRET}`) { logEvent("warn", "cron_unauthorized"); return new NextResponse("Unauthorized", { status: 401 }); }
  const supabase = getSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const { data, error } = await supabase.rpc("run_booking_and_messaging_maintenance");
  if (error) { logEvent("error", "maintenance_failed"); return NextResponse.json({ error: "maintenance_failed" }, { status: 500 }); }
  let subscriptionsSynced = 0;
  if (isSubscriptionPaymentConfigured()) {
    const { data: subscriptions } = await supabase.from("organization_subscriptions").select("id,external_subscription_id,status").eq("provider", "mercadopago").not("external_subscription_id", "is", null).in("status", ["pending", "active", "past_due"]);
    const provider = getSubscriptionPaymentProvider();
    for (const subscription of subscriptions ?? []) {
      try {
        const state = await provider.getSubscription({ subscriptionId: String(subscription.external_subscription_id) });
        await supabase.from("organization_subscriptions").update({ status: state.status, current_period_end: state.currentPeriodEnd, grace_period_end: state.status === "past_due" ? new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString() : null, updated_at: new Date().toISOString() }).eq("id", subscription.id);
        subscriptionsSynced += 1;
      } catch {
        logEvent("warn", "subscription_sync_failed", { subscriptionId: String(subscription.id) });
      }
    }
  }
  if (!isMessagingConfigured()) {
    logEvent("info", "maintenance_completed", { messagesSent: 0, subscriptionsSynced, messagingConfigured: false });
    return NextResponse.json({ ok: true, messagesSent: 0, subscriptionsSynced, messagingConfigured: false, ...data });
  }
  const { data: deliveries, error: claimError } = await supabase.rpc("claim_due_message_deliveries", { p_limit: 50 });
  if (claimError) { logEvent("error", "message_claim_failed"); return NextResponse.json({ error: "message_claim_failed" }, { status: 500 }); }
  const provider = getMessagingProvider();
  let sent = 0;
  for (const delivery of deliveries ?? []) {
    try {
      const result = await provider.sendMessage({ recipient: String(delivery.recipient), body: String(delivery.body) });
      await supabase.from("message_deliveries").update({ status: "sent", provider_message_id: result.providerMessageId, sent_at: new Date().toISOString(), error_message: null }).eq("id", delivery.id).eq("status", "processing");
      sent += 1;
    } catch {
      await supabase.from("message_deliveries").update({ status: "failed", error_message: "No fue posible enviar el mensaje." }).eq("id", delivery.id).eq("status", "processing");
      logEvent("warn", "message_delivery_failed", { deliveryId: String(delivery.id) });
    }
  }
  logEvent("info", "maintenance_completed", { messagesSent: sent, subscriptionsSynced }); return NextResponse.json({ ok: true, messagesSent: sent, subscriptionsSynced, ...data });
}
