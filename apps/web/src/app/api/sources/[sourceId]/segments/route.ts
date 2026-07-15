import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { filterKeywordsForLevel, type KeywordCue } from "@streamlingo/shared";
import { getUserId } from "@/lib/auth";
import { getServiceSupabase } from "@/lib/supabase";
import { badRequest, notFound, serverError, unauthorized } from "@/lib/http";
import { extractKeywords } from "@/lib/llm";
import { estimateWordTimings } from "@/lib/wordTiming";
import { recordVocabEncounter, fetchProfile } from "@/lib/db";
import { mapSegment, type SegmentRow } from "@/lib/mappers";

export const runtime = "nodejs";
// LLM calls routinely take 15-30s; Vercel's default function timeout kills
// them mid-flight as an opaque 500. 60s is the Hobby-plan ceiling.
export const maxDuration = 60;

const bodySchema = z.object({
  index: z.number().int().min(0),
  startSeconds: z.number().min(0),
  endSeconds: z.number().min(0),
  transcript: z.string().min(1),
  // Original caption cues with real timestamps, when the client has them
  // (extension always does; web app podcast flow usually doesn't). Lets
  // wordTiming anchor keywords to real cue times instead of interpolating.
  cues: z
    .array(
      z.object({
        text: z.string(),
        startSeconds: z.number().min(0),
        durSeconds: z.number().min(0),
      })
    )
    .optional(),
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

  const { index, startSeconds, endSeconds, transcript, cues } = parsed.data;

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

  let rawKeywords;
  try {
    rawKeywords = await extractKeywords(
      transcript,
      profile.level,
      profile.targetLanguage,
      profile.nativeLanguage
    );
  } catch (err) {
    // Without this, an LLM failure surfaces as a bare Next.js 500 with no
    // body — undiagnosable from the extension console in the field.
    const message = err instanceof Error ? err.message : String(err);
    console.error("extractKeywords failed:", message);
    return serverError(`LLM keyword extraction failed: ${message}`);
  }
  const timedCues = estimateWordTimings(transcript, startSeconds, endSeconds, rawKeywords, cues);
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

    // One encounter per lemma per segment — a word repeated within the same
    // segment isn't a new "encounter", and recording it twice would also
    // trip recordVocabEncounter's non-atomic read-then-insert against itself.
    const byLemma = new Map<string, KeywordCue[]>();
    for (const cue of filteredCues) {
      const group = byLemma.get(cue.lemma);
      if (group) group.push(cue);
      else byLemma.set(cue.lemma, [cue]);
    }
    for (const [, group] of byLemma) {
      const { previouslyEncountered } = await recordVocabEncounter(supabase, userId, sourceId, group[0]);
      for (const cue of group) cue.previouslyEncountered = previouslyEncountered;
    }
  }

  return NextResponse.json({
    segment: mapSegment(segmentRow),
    keywordCues: filteredCues,
  });
}
