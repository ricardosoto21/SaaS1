import { createHash } from "node:crypto";

import { headers } from "next/headers";

import { getSupabaseAdminClient } from "@/lib/supabase";

export async function enforcePublicRateLimit(scope: string, subject: string, limit: number, windowSeconds: number) {
  const headerStore = await headers();
  const ip = headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const hash = createHash("sha256").update(`${scope}:${ip}:${subject.toLowerCase()}`).digest("hex");
  const supabase = getSupabaseAdminClient();
  if (!supabase) return false;
  const { data, error } = await supabase.rpc("consume_public_rate_limit", { p_scope: scope, p_subject_hash: hash, p_limit: limit, p_window_seconds: windowSeconds });
  return !error && data === true;
}