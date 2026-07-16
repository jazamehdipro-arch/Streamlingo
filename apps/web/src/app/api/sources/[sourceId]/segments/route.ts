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

  // Levier 1 des économies de tokens : un segment déjà analysé avec le même
  // transcript est servi depuis la base — re-visionnages et préchargements
  // répétés ne re-paient jamais le LLM.
  const { data: cachedSegment } = await supabase
    .from("segments")
    .select("*")
    .eq("source_id", sourceId)
    .eq("index", index)
    .maybeSingle<SegmentRow>();

  if (cachedSegment && cachedSegment.transcript === transcript) {
    const { data: cachedCueRows } = await supabase
      .from("keyword_cues")
      .select("*")
      .eq("segment_id", cachedSegment.id)
      .order("start_seconds");

    if (cachedCueRows && cachedCueRows.length > 0) {
      let cachedCues: KeywordCue[] = cachedCueRows.map((row) => ({
        word: row.word as string,
        lemma: row.lemma as string,
        translation: row.translation as string,
        exampleSentence: (row.example_sentence as string) ?? "",
        exampleTranslation: (row.example_translation as string) ?? "",
        phonetic: (row.phonetic as string | null) ?? null,
        startSeconds: Number(row.start_seconds),
        frequencyRank: row.frequency_rank as KeywordCue["frequencyRank"],
      }));

      // Les mots marqués connus depuis la première analyse restent exclus,
      // et un mot déjà en banque est un "déjà vu" par définition sur un
      // passage revisité.
      const { data: vocabRows } = await supabase
        .from("vocab_items")
        .select("lemma, known")
        .eq("user_id", userId)
        .in("lemma", cachedCues.map((c) => c.lemma));
      const known = new Set((vocabRows ?? []).filter((r) => r.known === true).map((r) => r.lemma as string));
      const banked = new Set((vocabRows ?? []).map((r) => r.lemma as string));
      cachedCues = cachedCues.filter((c) => !known.has(c.lemma));
      for (const c of cachedCues) c.previouslyEncountered = banked.has(c.lemma);

      return NextResponse.json({ segment: mapSegment(cachedSegment), keywordCues: cachedCues, cached: true });
    }
  }

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
  const keywordsWithEmptyExamples = rawKeywords.map((k) => ({
    ...k,
    exampleSentence: "",
    exampleTranslation: "",
  }));
  const timedCues = estimateWordTimings(transcript, startSeconds, endSeconds, keywordsWithEmptyExamples, cues);
  let filteredCues = filterKeywordsForLevel(timedCues, profile.level);

  // Drop words the user marked as known — they must never resurface in the
  // overlay. Fail-open: if the `known` column doesn't exist yet (migration
  // 0003 not applied), keep every cue rather than erroring the analyze call.
  if (filteredCues.length > 0) {
    const { data: knownRows } = await supabase
      .from("vocab_items")
      .select("lemma")
      .eq("user_id", userId)
      .eq("known", true)
      .in("lemma", filteredCues.map((c) => c.lemma));
    if (knownRows && knownRows.length > 0) {
      const knownLemmas = new Set(knownRows.map((r) => r.lemma as string));
      filteredCues = filteredCues.filter((c) => !knownLemmas.has(c.lemma));
    }
  }

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
      // Vocab bookkeeping must never fail the cue response — the overlay is
      // the product; the bank silently catches up on the next encounter.
      try {
        const { previouslyEncountered } = await recordVocabEncounter(supabase, userId, sourceId, group[0]);
        for (const cue of group) cue.previouslyEncountered = previouslyEncountered;
      } catch (err) {
        console.error(`recordVocabEncounter failed for lemma ${group[0].lemma}:`, err);
      }
    }
  }

  return NextResponse.json({
    segment: mapSegment(segmentRow),
    keywordCues: filteredCues,
  });
}
