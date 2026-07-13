/**
 * Single source of truth for the backend origin. Kept as a plain constant
 * (not a build-time env var) so the value a reviewer sees here is exactly
 * the value that ships — no hidden .env resolution to audit.
 *
 * IMPORTANT: when pointing this at a deployed backend, `manifest.json`'s
 * `host_permissions` must also gain that origin (e.g. "https://app.streamlingo.example/*")
 * or every fetch the background worker makes will be silently rejected by
 * Chrome/Firefox before it leaves the browser.
 */
export const API_BASE_URL = "https://streamlingo-web.vercel.app";

/**
 * The web app also hosts onboarding + the pairing-code screen. Same origin
 * as the API in dev; kept as a separate constant because a production
 * deployment could plausibly split API and web app onto different hosts.
 */
export const WEB_APP_BASE_URL = "https://streamlingo-web.vercel.app";

export const CONNECT_EXTENSION_PATH = "/connect-extension";

export const STORAGE_KEYS = {
  authToken: "streamlingo_auth_token",
  overlayPosition: "streamlingo_overlay_position",
} as const;
