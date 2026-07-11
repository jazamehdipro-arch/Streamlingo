import { NextRequest, NextResponse } from "next/server";
import { levelIndex } from "@streamlingo/shared";
import { getUserId } from "@/lib/auth";
import { getServiceSupabase } from "@/lib/supabase";
import { badRequest, forbidden, notFound, serverError, unauthorized } from "@/lib/http";
import { fetchProfile, getOwnedSegment } from "@/lib/db";
import { generateCloze } from "@/lib/llm";
import { mapClozeItem, type ClozeItemRow } from "@/lib/mappers";

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
  if (!profile) return badRequest("Complete onboarding before requesting cloze exercises");

  // B1+ only — checked here too, not just in the client UI (per docs/API.md).
  if (levelIndex(profile.level) < levelIndex("B1")) {
    return forbidden("Cloze exercises require level B1 or higher");
  }

  const { data: existing } = await supabase
    .from("cloze_items")
    .select("*")
    .eq("segment_id", segmentId)
    .maybeSingle<ClozeItemRow>();
  if (existing) return NextResponse.json(mapClozeItem(existing));

  const generated = await generateCloze(segment.transcript, profile.level, profile.targetLanguage);

  const { data: inserted, error } = await supabase
    .from("cloze_items")
    .insert({
      segment_id: segmentId,
      transcript_with_blanks: generated.transcriptWithBlanks,
      answers: generated.answers,
    })
    .select()
    .single<ClozeItemRow>();

  if (error || !inserted) return serverError(error?.message);

  return NextResponse.json(mapClozeItem(inserted));
}
