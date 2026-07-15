import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUserId } from "@/lib/auth";
import { getServiceSupabase } from "@/lib/supabase";
import { badRequest, serverError, unauthorized } from "@/lib/http";

export const runtime = "nodejs";

const bodySchema = z.object({
  lemma: z.string().min(1),
  // The full cue payload, so a word marked known before its vocab_items row
  // exists (analyze bookkeeping is best-effort) can still be recorded.
  translation: z.string().min(1),
  exampleSentence: z.string().default(""),
  exampleTranslation: z.string().default(""),
  phonetic: z.string().nullable().default(null),
});

export async function POST(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) return unauthorized();

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return badRequest(parsed.error.message);
  const { lemma, translation, exampleSentence, exampleTranslation, phonetic } = parsed.data;

  const supabase = getServiceSupabase();

  const { data: existing } = await supabase
    .from("vocab_items")
    .select("id")
    .eq("user_id", userId)
    .eq("lemma", lemma)
    .maybeSingle();

  const { error } = existing
    ? await supabase.from("vocab_items").update({ known: true }).eq("id", existing.id)
    : await supabase.from("vocab_items").insert({
        user_id: userId,
        lemma,
        translation,
        example_sentence: exampleSentence,
        example_translation: exampleTranslation,
        phonetic,
        times_encountered: 1,
        known: true,
      });

  if (error) {
    // Most likely: migration 0003 (known column) not applied yet.
    return serverError(`Impossible de marquer le mot comme connu : ${error.message}`);
  }

  return NextResponse.json({ known: true, lemma });
}
