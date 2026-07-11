import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let serviceClient: SupabaseClient | null = null;
let browserClient: SupabaseClient | null = null;

/**
 * Service-role client for API route handlers: full DB access, bypasses RLS.
 * Never import this from a client component. Constructed lazily (not at
 * module scope) so importing this file never throws during `next build`
 * when the real Supabase env vars aren't present in the build environment.
 */
export function getServiceSupabase(): SupabaseClient {
  if (serviceClient) return serviceClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase server env missing: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  serviceClient = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return serviceClient;
}

/** Browser client for client components: anon key, session persisted in localStorage. */
export function getBrowserSupabase(): SupabaseClient {
  if (browserClient) return browserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase browser env missing: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }

  browserClient = createClient(url, key);
  return browserClient;
}
