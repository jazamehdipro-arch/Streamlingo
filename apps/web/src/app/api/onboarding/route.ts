import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { CEFR_LEVELS } from "@streamlingo/shared";
import { getUserId } from "@/lib/auth";
import { getServiceSupabase } from "@/lib/supabase";
import { badRequest, serverError, unauthorized } from "@/lib/http";
import { mapProfile, type ProfileRow } from "@/lib/mappers";

export const runtime = "nodejs";

const bodySchema = z.object({
  targetLanguage: z.string().min(1),
  nativeLanguage: z.string().min(1),
  level: z.enum(CEFR_LEVELS as [string, ...string[]]),
});

export async function POST(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) return unauthorized();

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return badRequest(parsed.error.message);

  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("profiles")
    .upsert(
      {
        id: userId,
        target_language: parsed.data.targetLanguage,
        native_language: parsed.data.nativeLanguage,
        level: parsed.data.level,
      },
      { onConflict: "id" }
    )
    .select()
    .single<ProfileRow>();

  if (error || !data) return serverError(error?.message);

  return NextResponse.json(mapProfile(data));
}
