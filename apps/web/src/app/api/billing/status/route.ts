import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { getServiceSupabase } from "@/lib/supabase";
import { getPlanStatus } from "@/lib/billing";
import { unauthorized } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) return unauthorized();
  return NextResponse.json(await getPlanStatus(getServiceSupabase(), userId));
}
