import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { getServiceSupabase } from "@/lib/supabase";
import { serverError, unauthorized } from "@/lib/http";

export const runtime = "nodejs";

const PAIRING_CODE_TTL_MS = 10 * 60 * 1000;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I to avoid transcription errors

/**
 * Not part of docs/API.md's endpoint list (that doc only defines the pair
 * exchange, `POST /api/extension/pair`) — but /connect-extension needs
 * something server-side to actually mint a code into extension_pairing_codes
 * before the extension can redeem it, so this fills that gap.
 */
export async function POST(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) return unauthorized();

  const code = generateCode();
  const expiresAt = new Date(Date.now() + PAIRING_CODE_TTL_MS).toISOString();

  const supabase = getServiceSupabase();
  const { error } = await supabase.from("extension_pairing_codes").insert({
    code,
    user_id: userId,
    expires_at: expiresAt,
  });
  if (error) return serverError(error.message);

  return NextResponse.json({ code, expiresAt });
}

function generateCode(): string {
  const bytes = crypto.randomBytes(8);
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}
