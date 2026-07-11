import crypto from "node:crypto";

/**
 * 90 days: long enough that a paired extension doesn't nag, short enough
 * that a token lifted from a stolen laptop's chrome.storage.local ages out.
 * Re-pairing is a 30-second flow, so erring short is cheap.
 */
export const EXTENSION_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/** SHA-256 hex — the DB stores only this, never the plaintext token. */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
