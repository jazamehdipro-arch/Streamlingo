import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { getServiceSupabase } from "@/lib/supabase";
import { serverError, unauthorized } from "@/lib/http";

export const runtime = "nodejs";

/**
 * Permanently delete the signed-in user's account. Removing the auth user
 * cascades to every table that references auth.users(id) on delete cascade
 * (profile, vocab, srs, sources, usage…), so all personal data goes with it.
 */
export async function DELETE(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) return unauthorized();

  const supabase = getServiceSupabase();
  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error) return serverError(error.message);

  return NextResponse.json({ deleted: true });
}
