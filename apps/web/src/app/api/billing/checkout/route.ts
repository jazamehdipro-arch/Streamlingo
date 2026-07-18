import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUserId } from "@/lib/auth";
import { getServiceSupabase } from "@/lib/supabase";
import { getStripe } from "@/lib/billing";
import { badRequest, serverError, unauthorized } from "@/lib/http";

export const runtime = "nodejs";

const bodySchema = z.object({
  plan: z.enum(["monthly", "annual"]),
});

export async function POST(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) return unauthorized();

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return badRequest(parsed.error.message);

  const priceId =
    parsed.data.plan === "monthly"
      ? process.env.STRIPE_PRICE_MONTHLY
      : process.env.STRIPE_PRICE_ANNUAL;
  if (!priceId) return serverError("Stripe prices are not configured");

  const supabase = getServiceSupabase();
  const { data: userData } = await supabase.auth.admin.getUserById(userId);
  const email = userData?.user?.email;

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", userId)
    .maybeSingle();

  const origin = req.headers.get("origin") ?? `https://${req.headers.get("host")}`;

  try {
    const session = await getStripe().checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      // client_reference_id is how the webhook maps the payment back to the
      // Supabase user without trusting anything client-controlled.
      client_reference_id: userId,
      customer: (profile?.stripe_customer_id as string | undefined) || undefined,
      customer_email: profile?.stripe_customer_id ? undefined : email,
      allow_promotion_codes: true,
      success_url: `${origin}/pricing?success=1`,
      cancel_url: `${origin}/pricing`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    return serverError(`Stripe checkout failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
