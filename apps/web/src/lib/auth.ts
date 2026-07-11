import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { getServiceSupabase } from "./supabase";
import { hashToken } from "./extensionTokens";
import { SESSION_COOKIE_NAME } from "./authCookieName";

/**
 * The web app has no @supabase/ssr wiring, so instead of an httpOnly
 * server-set cookie we mirror the Supabase browser session into a plain
 * cookie client-side (see src/lib/authClient.ts) on every auth state
 * change. This route reads that cookie for web app requests and validates
 * it against Supabase the same way it validates an extension bearer token.
 */

/**
 * Resolves the current user id from either path described in docs/API.md:
 * an `Authorization: Bearer <token>` header (extension requests — checked
 * against extension_tokens first, then falls back to treating the token as
 * a Supabase access token so the same header also works for the web app),
 * or the session cookie the web app sets after login.
 */
export async function getUserId(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get("authorization");
  if (authHeader?.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice("bearer ".length).trim();
    const extensionUserId = await resolveExtensionToken(token);
    if (extensionUserId) return extensionUserId;
    return resolveSupabaseAccessToken(token);
  }

  const cookieStore = await cookies();
  const cookieToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (cookieToken) return resolveSupabaseAccessToken(cookieToken);

  return null;
}

async function resolveExtensionToken(token: string): Promise<string | null> {
  const supabase = getServiceSupabase();
  const { data } = await supabase
    .from("extension_tokens")
    .select("user_id")
    .eq("token_hash", hashToken(token))
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (!data) return null;

  // Fire-and-forget usage timestamp — auth must not block on it.
  void supabase
    .from("extension_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("token_hash", hashToken(token))
    .then(() => undefined);

  return (data.user_id as string | undefined) ?? null;
}

async function resolveSupabaseAccessToken(token: string): Promise<string | null> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user.id;
}
