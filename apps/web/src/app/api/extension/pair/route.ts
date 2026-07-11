import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServiceSupabase } from "@/lib/supabase";
import { hashToken, EXTENSION_TOKEN_TTL_MS } from "@/lib/extensionTokens";
import { badRequest, serverError } from "@/lib/http";

export const runtime = "nodejs";

const bodySchema = z.object({
  code: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return badRequest(parsed.error.message);

  const supabase = getServiceSupabase();

  // Consume-and-read in one conditional UPDATE: two concurrent redeems of
  // the same code race on `consumed_at is null`, and only the winner gets a
  // row back — a read-then-update pair would hand both callers a token.
  const { data: consumed } = await supabase
    .from("extension_pairing_codes")
    .update({ consumed_at: new Date().toISOString() })
    .eq("code", parsed.data.code.trim().toUpperCase())
    .is("consumed_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("user_id")
    .maybeSingle();

  if (!consumed) return badRequest("Invalid or expired code");

  const accessToken = crypto.randomBytes(32).toString("hex");
  const { error } = await supabase.from("extension_tokens").insert({
    token_hash: hashToken(accessToken),
    user_id: consumed.user_id as string,
    expires_at: new Date(Date.now() + EXTENSION_TOKEN_TTL_MS).toISOString(),
  });
  if (error) return serverError(error.message);

  return NextResponse.json({ accessToken });
}
