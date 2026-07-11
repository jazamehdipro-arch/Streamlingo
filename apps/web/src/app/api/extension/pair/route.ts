import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServiceSupabase } from "@/lib/supabase";
import { badRequest, serverError } from "@/lib/http";

export const runtime = "nodejs";

const bodySchema = z.object({
  code: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return badRequest(parsed.error.message);

  const supabase = getServiceSupabase();
  const { data: pairing } = await supabase
    .from("extension_pairing_codes")
    .select("*")
    .eq("code", parsed.data.code)
    .is("consumed_at", null)
    .maybeSingle();

  if (!pairing || new Date(pairing.expires_at as string).getTime() < Date.now()) {
    return badRequest("Invalid or expired code");
  }

  await supabase
    .from("extension_pairing_codes")
    .update({ consumed_at: new Date().toISOString() })
    .eq("code", parsed.data.code);

  const accessToken = crypto.randomBytes(32).toString("hex");
  const { error } = await supabase.from("extension_tokens").insert({
    access_token: accessToken,
    user_id: pairing.user_id as string,
  });
  if (error) return serverError(error.message);

  return NextResponse.json({ accessToken });
}
