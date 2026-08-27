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

  return {
    status: String(data.status),
    currentPeriodEnd: data.current_period_end ? String(data.current_period_end) : null,
    gracePeriodEnd: data.grace_period_end ? String(data.grace_period_end) : null,
    scheduledForDeletionAt: data.scheduled_for_deletion_at ? String(data.scheduled_for_deletion_at) : null,
    allowed: data.allowed === true,
    limits: (data.limits ?? {}) as SubscriptionAccess["limits"],
    features: (data.features ?? {}) as SubscriptionAccess["features"],
  };
}