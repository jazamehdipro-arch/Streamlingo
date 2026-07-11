import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUserId } from "@/lib/auth";
import { getServiceSupabase } from "@/lib/supabase";
import { badRequest, notFound, unauthorized } from "@/lib/http";
import { getOwnedQuizQuestion } from "@/lib/db";

export const runtime = "nodejs";

const bodySchema = z.object({
  chosenIndex: z.number().int().min(0),
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ questionId: string }> }
) {
  const userId = await getUserId(req);
  if (!userId) return unauthorized();

  const { questionId } = await context.params;

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return badRequest(parsed.error.message);

  const supabase = getServiceSupabase();
  const question = await getOwnedQuizQuestion(supabase, questionId, userId);
  if (!question) return notFound("Quiz question not found");

  const isCorrect = parsed.data.chosenIndex === question.correct_index;

  await supabase.from("quiz_attempts").insert({
    user_id: userId,
    quiz_question_id: questionId,
    chosen_index: parsed.data.chosenIndex,
    is_correct: isCorrect,
  });

  return NextResponse.json({ isCorrect, explanation: question.explanation });
}
