import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUserId } from "@/lib/auth";
import { getServiceSupabase } from "@/lib/supabase";
import { badRequest, serverError, unauthorized } from "@/lib/http";
import { mapSource, type ContentSourceRow } from "@/lib/mappers";

export const runtime = "nodejs";

const bodySchema = z.object({
  kind: z.enum(["youtube", "podcast"]),
  externalId: z.string().optional(),
  title: z.string().min(1),
  durationSeconds: z.number().optional(),
});

export async function POST(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) return unauthorized();

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return badRequest(parsed.error.message);

  const supabase = getServiceSupabase();
  const { kind, externalId, title, durationSeconds } = parsed.data;

  if (kind === "youtube" && externalId) {
    const { data: existing } = await supabase
      .from("content_sources")
      .select("*")
      .eq("user_id", userId)
      .eq("kind", "youtube")
      .eq("external_id", externalId)
      .maybeSingle<ContentSourceRow>();
    if (existing) return NextResponse.json(mapSource(existing));
  }

  const { data, error } = await supabase
    .from("content_sources")
    .insert({
      user_id: userId,
      kind,
      external_id: externalId ?? null,
      title,
      duration_seconds: durationSeconds ?? null,
    })
    .select()
    .single<ContentSourceRow>();

  if (error || !data) return serverError(error?.message);

  return NextResponse.json(mapSource(data));
}
