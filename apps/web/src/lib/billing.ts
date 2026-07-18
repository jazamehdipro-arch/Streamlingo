import type { SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";

/**
 * Free tier: enough to hit the magic moment several times a month, not
 * enough to be a language learner's daily driver. Pro's cap is fair-use
 * protection (nobody watches 20h of analyzed video a month by hand), not a
 * product limit — marketed as unlimited.
 */
export const FREE_MONTHLY_SECONDS = 30 * 60;
export const PRO_MONTHLY_SECONDS = 20 * 3600;

export type Plan = "free" | "pro";

let stripe: Stripe | null = null;

/** Lazy so builds and non-billing routes never require the Stripe key. */
export function getStripe(): Stripe {
  if (stripe) return stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  stripe = new Stripe(key);
  return stripe;
}

export function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export interface PlanStatus {
  plan: Plan;
  analyzedSeconds: number;
  limitSeconds: number;
  remainingSeconds: number;
}

export async function getPlanStatus(supabase: SupabaseClient, userId: string): Promise<PlanStatus> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("plan, plan_expires_at")
    .eq("id", userId)
    .maybeSingle();

  // A lapsed subscription (webhook missed, grace period over) degrades to free.
  let plan: Plan = profile?.plan === "pro" ? "pro" : "free";
  if (
    plan === "pro" &&
    profile?.plan_expires_at &&
    new Date(profile.plan_expires_at as string).getTime() < Date.now() - 3 * 86400000
  ) {
    plan = "free";
  }

  const { data: usage } = await supabase
    .from("usage_monthly")
    .select("analyzed_seconds")
    .eq("user_id", userId)
    .eq("month", currentMonth())
    .maybeSingle();

  const analyzedSeconds = Number(usage?.analyzed_seconds ?? 0);
  const limitSeconds = plan === "pro" ? PRO_MONTHLY_SECONDS : FREE_MONTHLY_SECONDS;
  return {
    plan,
    analyzedSeconds,
    limitSeconds,
    remainingSeconds: Math.max(0, limitSeconds - analyzedSeconds),
  };
}

/**
 * Best-effort increment: usage metering must never fail a user-facing
 * request, and the read-modify-write race in the worst case undercounts a
 * few seconds — acceptable for quota purposes.
 */
export async function recordUsage(
  supabase: SupabaseClient,
  userId: string,
  seconds: number
): Promise<void> {
  try {
    const month = currentMonth();
    const { data: existing } = await supabase
      .from("usage_monthly")
      .select("analyzed_seconds")
      .eq("user_id", userId)
      .eq("month", month)
      .maybeSingle();
    if (existing) {
      await supabase
        .from("usage_monthly")
        .update({ analyzed_seconds: Number(existing.analyzed_seconds) + seconds })
        .eq("user_id", userId)
        .eq("month", month);
    } else {
      await supabase.from("usage_monthly").insert({ user_id: userId, month, analyzed_seconds: seconds });
    }
  } catch (err) {
    console.error("recordUsage failed:", err);
  }
}
