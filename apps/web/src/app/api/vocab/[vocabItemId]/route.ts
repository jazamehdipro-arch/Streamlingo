import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUserId } from "@/lib/auth";
import { getServiceSupabase } from "@/lib/supabase";
import { badRequest, notFound, serverError, unauthorized } from "@/lib/http";

export const runtime = "nodejs";

const patchSchema = z.object({
  known: z.boolean(),
});

/** Toggle the "known" flag on a word (mark as mastered, or bring it back). */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ vocabItemId: string }> }
) {
  const userId = await getUserId(req);
  if (!userId) return unauthorized();

  const { vocabItemId } = await context.params;

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return badRequest(parsed.error.message);

  const supabase = getServiceSupabase();

  const { data: existing } = await supabase
    .from("vocab_items")
    .select("id")
    .eq("id", vocabItemId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!existing) return notFound("Vocab item not found");

  const { error } = await supabase
    .from("vocab_items")
    .update({ known: parsed.data.known })
    .eq("id", vocabItemId);
  if (error) return serverError(error.message);

  return NextResponse.json({ id: vocabItemId, known: parsed.data.known });
}

/** Permanently remove a word from the bank (srs_states + encounters cascade). */
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ vocabItemId: string }> }
) {
  const userId = await getUserId(req);
  if (!userId) return unauthorized();

  const { vocabItemId } = await context.params;
  const supabase = getServiceSupabase();

  const { data: existing } = await supabase
    .from("vocab_items")
    .select("id")
    .eq("id", vocabItemId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!existing) return notFound("Vocab item not found");

  const { error } = await supabase.from("vocab_items").delete().eq("id", vocabItemId);
  if (error) return serverError(error.message);

  return NextResponse.json({ id: vocabItemId, deleted: true });
}
