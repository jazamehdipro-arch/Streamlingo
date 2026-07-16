import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUserId } from "@/lib/auth";
import { getServiceSupabase } from "@/lib/supabase";
import { badRequest, serverError, unauthorized } from "@/lib/http";
import { explainPassage } from "@/lib/llm";
import { fetchProfile } from "@/lib/db";

export const runtime = "nodejs";
// LLM calls routinely take 15-30s; Vercel's default function timeout kills
// them mid-flight as an opaque 500. 60s is the Hobby-plan ceiling.
export const maxDuration = 60;

const bodySchema = z.object({
  // The last few seconds of transcript around the point the user got lost.
  transcript: z.string().min(1).max(4000),
});

export async function POST(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) return unauthorized();

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return badRequest(parsed.error.message);

  const profile = await fetchProfile(getServiceSupabase(), userId);
  if (!profile) return badRequest("Complete onboarding first");

  try {
    const explanation = await explainPassage(
      parsed.data.transcript,
      profile.level,
      profile.targetLanguage,
      profile.nativeLanguage
    );
    return NextResponse.json(explanation);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("explainPassage failed:", message);
    return serverError(`Explanation failed: ${message}`);
  }
}
