import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getUserId } from "@/lib/auth";
import { getServiceSupabase } from "@/lib/supabase";
import { getPlanStatus, getStripe } from "@/lib/billing";
import { unauthorized } from "@/lib/http";

export const runtime = "nodejs";

/**
 * Plan status for the account UI. On top of the fast quota fields, a Pro
 * user's subscription is read live from Stripe so the in-app view shows the
 * real next-billing date and whether cancellation is already scheduled —
 * without depending on webhook timing right after checkout.
 */
export async function GET(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) return unauthorized();

  const supabase = getServiceSupabase();
  const status = await getPlanStatus(supabase, userId);

  let subscription: { nextBillingAt: string | null; cancelAtPeriodEnd: boolean } | null = null;
  if (status.plan === "pro") {
    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_subscription_id")
      .eq("id", userId)
      .maybeSingle();
    const subId = profile?.stripe_subscription_id as string | undefined;
    if (subId) {
      try {
        const sub = (await getStripe().subscriptions.retrieve(subId)) as Stripe.Subscription;
        subscription = {
          nextBillingAt: sub.current_period_end
            ? new Date(sub.current_period_end * 1000).toISOString()
            : null,
          cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
        };
      } catch {
        subscription = null;
      }
    }
  }

  return NextResponse.json({ ...status, subscription });
}
