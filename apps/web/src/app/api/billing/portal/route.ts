import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { getServiceSupabase } from "@/lib/supabase";
import { getStripe } from "@/lib/billing";
import { badRequest, serverError, unauthorized } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) return unauthorized();

  const { data: profile } = await getServiceSupabase()
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", userId)
    .maybeSingle();

  const customerId = profile?.stripe_customer_id as string | undefined;
  if (!customerId) return badRequest("Aucun abonnement à gérer");

  const origin = req.headers.get("origin") ?? `https://${req.headers.get("host")}`;

  try {
    const session = await getStripe().billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/pricing`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    return serverError(`Stripe portal failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
