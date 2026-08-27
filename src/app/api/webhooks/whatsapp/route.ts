import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { logEvent } from "@/lib/observability/logger";
import { getSupabaseAdminClient } from "@/lib/supabase";

type WhatsAppWebhookPayload = {
  entry?: Array<{
    changes?: Array<{
      value?: { statuses?: Array<{ id?: string; status?: string }> };
    }>;
  }>;
};

function signatureIsValid(payload: string, signature: string | null) {
  const secret = process.env.WHATSAPP_CLOUD_APP_SECRET?.trim();
  if (!secret || !signature?.startsWith("sha256=")) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(payload).digest("hex"));
  const received = Buffer.from(signature.slice("sha256=".length));
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode === "subscribe" && challenge && token && token === process.env.WHATSAPP_CLOUD_VERIFY_TOKEN) return new NextResponse(challenge, { status: 200 });
  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (!signatureIsValid(raw, request.headers.get("x-hub-signature-256"))) return new NextResponse("Unauthorized", { status: 401 });
  const supabase = getSupabaseAdminClient();
  if (!supabase) return new NextResponse("Unavailable", { status: 503 });
  try {
    const payload = JSON.parse(raw) as WhatsAppWebhookPayload;
    let updated = 0;
    for (const entry of payload.entry ?? []) for (const change of entry.changes ?? []) for (const status of change.value?.statuses ?? []) {
      const mapped = status.status === "delivered" ? "delivered" : status.status === "failed" ? "failed" : "sent";
      if (!status.id) continue;
      const { error } = await supabase.from("message_deliveries").update({ status: mapped, error_message: mapped === "failed" ? "WhatsApp no pudo entregar el mensaje." : null }).eq("provider_message_id", status.id);
      if (!error) updated += 1;
    }
    logEvent("info", "whatsapp_webhook_processed", { updated });
    return NextResponse.json({ ok: true });
  } catch {
    logEvent("warn", "whatsapp_webhook_invalid");
    return new NextResponse("Bad request", { status: 400 });
  }
}
