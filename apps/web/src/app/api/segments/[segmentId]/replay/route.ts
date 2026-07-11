import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { getServiceSupabase } from "@/lib/supabase";
import { badRequest, notFound, unauthorized } from "@/lib/http";
import { fetchProfile, getOwnedSegment } from "@/lib/db";
import { generateReplay } from "@/lib/llm";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ segmentId: string }> }
) {
  const userId = await getUserId(req);
  if (!userId) return unauthorized();

  const { segmentId } = await context.params;
  const supabase = getServiceSupabase();

  const segment = await getOwnedSegment(supabase, segmentId, userId);
  if (!segment) return notFound("Segment not found");

  const profile = await fetchProfile(supabase, userId);
  if (!profile) return badRequest("Complete onboarding before requesting active replay");

  // Generated on demand every call, not cached — most segments are never
  // revisited this way (per docs/API.md).
  const replay = await generateReplay(segment.transcript, profile.targetLanguage, profile.nativeLanguage);

  return NextResponse.json(replay);
}
