import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { KeywordCue } from "@streamlingo/shared";
import { getUserId } from "@/lib/auth";
import { getServiceSupabase } from "@/lib/supabase";
import { badRequest, unauthorized } from "@/lib/http";
import { mapSegment, type SegmentRow } from "@/lib/mappers";

export const runtime = "nodejs";

/**
 * Replays a previously-analyzed YouTube video from the database — the
 * mobile fallback when YouTube's bot wall blocks server-side caption
 * fetching. Any video watched once with the desktop extension (which
 * pipes segments through the same tables) becomes instantly available
 * here: word feed, timings, quiz — no YouTube call, no LLM call.
 */

const bodySchema = z.object({
  videoId: z.string().regex(/^[A-Za-z0-9_-]{5,20}$/),
});

export async function POST(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) return unauthorized();

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return badRequest(parsed.error.message);

  const supabase = getServiceSupabase();

  const { data: source } = await supabase
    .from("content_sources")
    .select("id")
    .eq("user_id", userId)
    .eq("kind", "youtube")
    .eq("external_id", parsed.data.videoId)
    .maybeSingle();
  if (!source) return NextResponse.json({ found: false });

  const { data: segmentRows } = await supabase
    .from("segments")
    .select("*")
    .eq("source_id", source.id)
    .order("index")
    .returns<SegmentRow[]>();
  if (!segmentRows || segmentRows.length === 0) return NextResponse.json({ found: false });

  const { data: cueRows } = await supabase
    .from("keyword_cues")
    .select("*")
    .in("segment_id", segmentRows.map((s) => s.id))
    .order("start_seconds");

  const lemmas = [...new Set((cueRows ?? []).map((r) => r.lemma as string))];
  const { data: vocabRows } =
    lemmas.length > 0
      ? await supabase.from("vocab_items").select("lemma, known").eq("user_id", userId).in("lemma", lemmas)
      : { data: [] };
  const known = new Set((vocabRows ?? []).filter((r) => r.known === true).map((r) => r.lemma as string));
  const banked = new Set((vocabRows ?? []).map((r) => r.lemma as string));

  const cuesBySegment = new Map<string, KeywordCue[]>();
  for (const row of cueRows ?? []) {
    if (known.has(row.lemma as string)) continue;
    const cue: KeywordCue = {
      word: row.word as string,
      lemma: row.lemma as string,
      translation: row.translation as string,
      exampleSentence: (row.example_sentence as string) ?? "",
      exampleTranslation: (row.example_translation as string) ?? "",
      phonetic: (row.phonetic as string | null) ?? null,
      startSeconds: Number(row.start_seconds),
      frequencyRank: row.frequency_rank as KeywordCue["frequencyRank"],
      previouslyEncountered: banked.has(row.lemma as string),
    };
    const list = cuesBySegment.get(row.segment_id as string);
    if (list) list.push(cue);
    else cuesBySegment.set(row.segment_id as string, [cue]);
  }

  return NextResponse.json({
    found: true,
    sourceId: source.id,
    segments: segmentRows.map((row) => ({
      segment: mapSegment(row),
      keywordCues: cuesBySegment.get(row.id) ?? [],
    })),
  });
}
