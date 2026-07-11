import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { getServiceSupabase } from "@/lib/supabase";
import { badRequest, notFound, serverError, unauthorized } from "@/lib/http";
import { fetchProfile, getOwnedSegment } from "@/lib/db";
import { generateQuiz } from "@/lib/llm";
import { mapQuizQuestion, type QuizQuestionRow } from "@/lib/mappers";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ segmentId: string }> }
) {
  const userId = await getUserId(req);
  if (!userId) return unauthorized();

  const { segmentId } = await context.params;
  const supabase = getServiceSupabase();

  const segment = await getOwnedSegment(supabase, segmentId, userId);
  if (!segment) return notFound("Segment not found");

  const { data: existing } = await supabase
    .from("quiz_questions")
    .select("*")
    .eq("segment_id", segmentId)
    .returns<QuizQuestionRow[]>();

  if (existing && existing.length > 0) {
    return NextResponse.json({ questions: existing.map(mapQuizQuestion) });
  }

  const profile = await fetchProfile(supabase, userId);
  if (!profile) return badRequest("Complete onboarding before generating a quiz");

  const questions = await generateQuiz(
    segment.transcript,
    profile.level,
    profile.targetLanguage,
    profile.nativeLanguage
  );

  const { data: inserted, error } = await supabase
    .from("quiz_questions")
    .insert(
      questions.map((q) => ({
        segment_id: segmentId,
        question: q.question,
        choices: q.choices,
        correct_index: q.correctIndex,
        explanation: q.explanation,
      }))
    )
    .select()
    .returns<QuizQuestionRow[]>();

  if (error || !inserted) return serverError(error?.message);

  return NextResponse.json({ questions: inserted.map(mapQuizQuestion) });
}
