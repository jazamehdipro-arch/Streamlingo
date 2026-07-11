import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { reviewSrsState, type ReviewQuality } from "@streamlingo/shared";
import { getUserId } from "@/lib/auth";
import { getServiceSupabase } from "@/lib/supabase";
import { badRequest, notFound, serverError, unauthorized } from "@/lib/http";
import { mapSrsState, type SrsStateRow } from "@/lib/mappers";

export const runtime = "nodejs";

const bodySchema = z.object({
  quality: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ vocabItemId: string }> }
) {
  const userId = await getUserId(req);
  if (!userId) return unauthorized();

  const { vocabItemId } = await context.params;

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return badRequest(parsed.error.message);

  const supabase = getServiceSupabase();

  const { data: vocabItem } = await supabase
    .from("vocab_items")
    .select("id")
    .eq("id", vocabItemId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!vocabItem) return notFound("Vocab item not found");

  const { data: srsRow } = await supabase
    .from("srs_states")
    .select("*")
    .eq("vocab_item_id", vocabItemId)
    .maybeSingle<SrsStateRow>();
  if (!srsRow) return notFound("SRS state not found");

  const updated = reviewSrsState(mapSrsState(srsRow), parsed.data.quality as ReviewQuality, new Date());

  const { data: savedRow, error } = await supabase
    .from("srs_states")
    .update({
      ease_factor: updated.easeFactor,
      interval_days: updated.intervalDays,
      repetitions: updated.repetitions,
      due_at: updated.dueAt,
      last_reviewed_at: updated.lastReviewedAt,
    })
    .eq("vocab_item_id", vocabItemId)
    .select()
    .single<SrsStateRow>();

  if (error || !savedRow) return serverError(error?.message);

  return NextResponse.json(mapSrsState(savedRow));
}
