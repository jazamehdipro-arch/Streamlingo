/**
 * Split into its own module (no `next/headers` import) so both the
 * server-only auth.ts and the client-only authClient.ts can share the name
 * without either pulling in the other's runtime.
 */
export const SESSION_COOKIE_NAME = "sl_access_token";
