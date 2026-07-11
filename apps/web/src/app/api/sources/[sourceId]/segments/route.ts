import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { filterKeywordsForLevel } from "@streamlingo/shared";
import { getUserId } from "@/lib/auth";
import { getServiceSupabase } from "@/lib/supabase";
import { badRequest, notFound, serverError, unauthorized } from "@/lib/http";
import { extractKeywords } from "@/lib/llm";
import { estimateWordTimings } from "@/lib/wordTiming";
import { recordVocabEncounter, fetchProfile } from "@/lib/db";
import { mapSegment, type SegmentRow } from "@/lib/mappers";

export const runtime = "nodejs";

const bodySchema = z.object({
  index: z.number().int().min(0),
  startSeconds: z.number().min(0),
  endSeconds: z.number().min(0),
  transcript: z.string().min(1),
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ sourceId: string }> }
) {
  const userId = await getUserId(req);
  if (!userId) return unauthorized();

  const { sourceId } = await context.params;

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return badRequest(parsed.error.message);

  const supabase = getServiceSupabase();

  const { data: source } = await supabase
    .from("content_sources")
    .select("id")
    .eq("id", sourceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!source) return notFound("Source not found");

  const profile = await fetchProfile(supabase, userId);
  if (!profile) return badRequest("Complete onboarding before analyzing segments");

  const { index, startSeconds, endSeconds, transcript } = parsed.data;

  const { data: segmentRow, error: segmentError } = await supabase
    .from("segments")
    .upsert(
      {
        source_id: sourceId,
        index,
        start_seconds: startSeconds,
        end_seconds: endSeconds,
        transcript,
      },
      { onConflict: "source_id,index" }
    )
    .select()
    .single<SegmentRow>();

  if (segmentError || !segmentRow) return serverError(segmentError?.message);

  const rawKeywords = await extractKeywords(
    transcript,
    profile.level,
    profile.targetLanguage,
    profile.nativeLanguage
  );
  const timedCues = estimateWordTimings(transcript, startSeconds, endSeconds, rawKeywords);
  const filteredCues = filterKeywordsForLevel(timedCues, profile.level);

  await supabase.from("keyword_cues").delete().eq("segment_id", segmentRow.id);

  if (filteredCues.length > 0) {
    const { error: cuesError } = await supabase.from("keyword_cues").insert(
      filteredCues.map((cue) => ({
        segment_id: segmentRow.id,
        word: cue.word,
        lemma: cue.lemma,
        translation: cue.translation,
        example_sentence: cue.exampleSentence,
        example_translation: cue.exampleTranslation,
        phonetic: cue.phonetic,
        start_seconds: cue.startSeconds,
        frequency_rank: cue.frequencyRank,
      }))
    );
    if (cuesError) return serverError(cuesError.message);

    for (const cue of filteredCues) {
      const { previouslyEncountered } = await recordVocabEncounter(supabase, userId, sourceId, cue);
      cue.previouslyEncountered = previouslyEncountered;
    }
  }

  return NextResponse.json({
    segment: mapSegment(segmentRow),
    keywordCues: filteredCues,
  });
}
