import { NextResponse } from "next/server";

import { logEvent } from "@/lib/observability/logger";
import { getSupabaseAdminClient } from "@/lib/supabase";

export async function GET(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authorization !== `Bearer ${process.env.CRON_SECRET}`) { logEvent("warn", "cron_unauthorized"); return new NextResponse("Unauthorized", { status: 401 }); }
  const supabase = getSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const { data, error } = await supabase.rpc("run_booking_and_messaging_maintenance");
  if (error) { logEvent("error", "maintenance_failed"); return NextResponse.json({ error: "maintenance_failed" }, { status: 500 }); }
  logEvent("info", "maintenance_completed"); return NextResponse.json({ ok: true, ...data });
}