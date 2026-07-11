"use client";

import type { Session } from "@supabase/supabase-js";
import { getBrowserSupabase } from "./supabase";
import { SESSION_COOKIE_NAME } from "./authCookieName";

/**
 * Supabase's browser client persists the session in localStorage, which the
 * server never sees. Mirroring the access token into a plain (non-httpOnly)
 * cookie is a pragmatic stand-in for @supabase/ssr in this scaffold, so API
 * routes can authenticate web app requests via a cookie as docs/API.md
 * describes, without adding the extra SSR package/middleware.
 */
export function syncSessionCookie(session: Session | null): void {
  if (session?.access_token) {
    const maxAge = Math.max(60, session.expires_in ?? 3600);
    document.cookie = `${SESSION_COOKIE_NAME}=${session.access_token}; path=/; max-age=${maxAge}; samesite=lax`;
  } else {
    document.cookie = `${SESSION_COOKIE_NAME}=; path=/; max-age=0`;
  }
}

export function startAuthCookieSync(): () => void {
  const supabase = getBrowserSupabase();

  supabase.auth.getSession().then(({ data }) => syncSessionCookie(data.session));

  const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
    syncSessionCookie(session);
  });

  return () => subscription.subscription.unsubscribe();
}
