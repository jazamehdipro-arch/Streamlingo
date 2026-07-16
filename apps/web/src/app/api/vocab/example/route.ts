import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUserId } from "@/lib/auth";
import { getServiceSupabase } from "@/lib/supabase";
import { badRequest, serverError, unauthorized } from "@/lib/http";
import { generateExample } from "@/lib/llm";
import { fetchProfile } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 30;

const bodySchema = z.object({
  lemma: z.string().min(1),
  word: z.string().min(1),
  translation: z.string().min(1),
});

/**
 * Lazy example generation (token-cost lever 2): examples are no longer
 * produced at extraction time — this endpoint creates one the first time a
 * word's card is opened, persists it on the vocab item, and returns it.
 * Subsequent opens are served from the stored copy by the caller.
 */
export async function POST(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) return unauthorized();

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return badRequest(parsed.error.message);
  const { lemma, word, translation } = parsed.data;

  const supabase = getServiceSupabase();

  // Already generated (any client, any session): free.
  const { data: existing } = await supabase
    .from("vocab_items")
    .select("example_sentence, example_translation")
    .eq("user_id", userId)
    .eq("lemma", lemma)
    .maybeSingle();
  if (existing && (existing.example_sentence as string)?.length > 0) {
    return NextResponse.json({
      exampleSentence: existing.example_sentence,
      exampleTranslation: existing.example_translation,
    });
  }

  const profile = await fetchProfile(supabase, userId);
  if (!profile) return badRequest("Complete onboarding first");

  try {
    const example = await generateExample(word, translation, profile.targetLanguage, profile.nativeLanguage);

    await supabase
      .from("vocab_items")
      .update({
        example_sentence: example.exampleSentence,
        example_translation: example.exampleTranslation,
      })
      .eq("user_id", userId)
      .eq("lemma", lemma);

    return NextResponse.json(example);
  } catch (err) {
    return serverError(`Example generation failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
