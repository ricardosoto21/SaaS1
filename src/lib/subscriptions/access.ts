import type { SessionUser } from "@/lib/types";
import { getSupabaseServerClient } from "@/lib/supabase";

export type SubscriptionAccess = {
  status: string;
  currentPeriodEnd: string | null;
  gracePeriodEnd: string | null;
  scheduledForDeletionAt: string | null;
  allowed: boolean;
  limits: { branches?: number | null; users?: number | null };
  features: Record<string, boolean>;
};

type SubscriptionAccessRow = {
  status: string;
  current_period_end: string | null;
  grace_period_end: string | null;
  scheduled_for_deletion_at: string | null;
  allowed: boolean;
  limits: SubscriptionAccess["limits"] | null;
  features: SubscriptionAccess["features"] | null;
};

const platformAccess: SubscriptionAccess = {
  status: "active",
  currentPeriodEnd: null,
  gracePeriodEnd: null,
  scheduledForDeletionAt: null,
  allowed: true,
  limits: {},
  features: {},
};

export async function getSubscriptionAccess(user: SessionUser): Promise<SubscriptionAccess> {
  if (process.env.APP_DATA_MODE === "local" || user.role === "super_admin" || user.isPlatformAdmin) return platformAccess;
  if (!user.organizationId) return { ...platformAccess, status: "missing", allowed: false };

  const supabase = await getSupabaseServerClient();
  if (!supabase) return platformAccess;
  const { data, error } = await supabase.rpc("subscription_access_state", { p_organization_id: user.organizationId }).maybeSingle();
  if (error || !data) return { ...platformAccess, status: "missing", allowed: false };

  const row = data as SubscriptionAccessRow;
  return {
    status: row.status,
    currentPeriodEnd: row.current_period_end,
    gracePeriodEnd: row.grace_period_end,
    scheduledForDeletionAt: row.scheduled_for_deletion_at,
    allowed: row.allowed === true,
    limits: row.limits ?? {},
    features: row.features ?? {},
  };
}
