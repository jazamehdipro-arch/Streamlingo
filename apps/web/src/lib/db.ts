import type { SupabaseClient } from "@supabase/supabase-js";
import { createInitialSrsState, type KeywordCue } from "@streamlingo/shared";
import {
  mapProfile,
  type ProfileRow,
  type QuizQuestionRow,
  type SegmentRow,
} from "./mappers";
import type { UserProfile } from "@streamlingo/shared";

export async function fetchProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<UserProfile | null> {
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle<ProfileRow>();
  return data ? mapProfile(data) : null;
}

/**
 * Ownership is checked with two sequential queries instead of a single
 * nested-relationship filter (`segments.content_sources.user_id=eq...`) —
 * simpler to reason about and doesn't depend on how far PostgREST's
 * embedded-filter support extends for a given schema version.
 */
export async function getOwnedSegment(
  supabase: SupabaseClient,
  segmentId: string,
  userId: string
): Promise<SegmentRow | null> {
  const { data: segment } = await supabase
    .from("segments")
    .select("*")
    .eq("id", segmentId)
    .maybeSingle<SegmentRow>();
  if (!segment) return null;

  const { data: source } = await supabase
    .from("content_sources")
    .select("id")
    .eq("id", segment.source_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!source) return null;

  return segment;
}

export async function getOwnedQuizQuestion(
  supabase: SupabaseClient,
  questionId: string,
  userId: string
): Promise<QuizQuestionRow | null> {
  const { data: question } = await supabase
    .from("quiz_questions")
    .select("*")
    .eq("id", questionId)
    .maybeSingle<QuizQuestionRow>();
  if (!question) return null;

  const segment = await getOwnedSegment(supabase, question.segment_id, userId);
  if (!segment) return null;

  return question;
}

/**
 * Upserts a keyword's lemma into the user's vocab bank: increments
 * times_encountered + logs a vocab_encounters row if the lemma is already
 * known (the "you've seen this word before" cross-video signal), or creates
 * a fresh vocab_items + srs_states row if it's new.
 *
 * The read-then-write here isn't atomic (two concurrent analyze calls for
 * the same lemma could both see "not found" and both insert), which the
 * unique(user_id, lemma) constraint would then reject for the loser. Fine
 * for this MVP's request volume; a real upsert-with-increment (Postgres
 * function or ON CONFLICT ... DO UPDATE) would close that gap.
 */
export async function recordVocabEncounter(
  supabase: SupabaseClient,
  userId: string,
  sourceId: string,
  cue: KeywordCue
): Promise<{ previouslyEncountered: boolean }> {
  const { data: existing } = await supabase
    .from("vocab_items")
    .select("id, times_encountered")
    .eq("user_id", userId)
    .eq("lemma", cue.lemma)
    .maybeSingle();

  let vocabItemId: string;

  if (existing) {
    vocabItemId = existing.id as string;
    await supabase
      .from("vocab_items")
      .update({ times_encountered: (existing.times_encountered as number) + 1 })
      .eq("id", vocabItemId);
  } else {
    const { data: inserted, error } = await supabase
      .from("vocab_items")
      .insert({
        user_id: userId,
        lemma: cue.lemma,
        translation: cue.translation,
        example_sentence: cue.exampleSentence,
        example_translation: cue.exampleTranslation,
        phonetic: cue.phonetic,
        first_seen_source_id: sourceId,
        times_encountered: 1,
      })
      .select("id")
      .single();
    if (error || !inserted) {
      throw new Error(`Failed to insert vocab_items row: ${error?.message ?? "unknown error"}`);
    }
    vocabItemId = inserted.id as string;

    const initial = createInitialSrsState(vocabItemId);
    await supabase.from("srs_states").insert({
      vocab_item_id: vocabItemId,
      ease_factor: initial.easeFactor,
      interval_days: initial.intervalDays,
      repetitions: initial.repetitions,
      due_at: initial.dueAt,
      last_reviewed_at: initial.lastReviewedAt,
    });
  }

  await supabase.from("vocab_encounters").insert({
    vocab_item_id: vocabItemId,
    source_id: sourceId,
  });

  return { previouslyEncountered: Boolean(existing) };
}
