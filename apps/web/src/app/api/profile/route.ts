import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { getServiceSupabase } from "@/lib/supabase";
import { unauthorized } from "@/lib/http";
import { fetchProfile } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) return unauthorized();

  const profile = await fetchProfile(getServiceSupabase(), userId);
  return NextResponse.json(profile);
}
