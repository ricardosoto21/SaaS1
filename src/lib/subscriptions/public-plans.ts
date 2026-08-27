import { getSupabaseAdminClient } from "@/lib/supabase";

export type PublicSubscriptionPlan = {
  code: string;
  name: string;
  monthlyPrice: number;
  currency: string;
  features: Record<string, boolean>;
};

export async function getPublicSubscriptionPlans(): Promise<PublicSubscriptionPlan[]> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("subscription_plans")
    .select("code,name,monthly_price,currency,features")
    .eq("active", true)
    .order("monthly_price");

  return (data ?? []).map((plan) => ({
    code: String(plan.code),
    name: String(plan.name),
    monthlyPrice: Number(plan.monthly_price),
    currency: String(plan.currency ?? "CLP"),
    features: (plan.features ?? {}) as Record<string, boolean>,
  }));
}
