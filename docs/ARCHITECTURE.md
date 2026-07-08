# Architecture

```
streamlingo/
  apps/web/           Next.js web app: podcast learning UI + all backend API routes
  extension/           Chrome/Firefox MV3 extension: YouTube overlay
  packages/shared/     Types, SM-2 spaced repetition, level-based keyword filtering
  supabase/migrations/ Postgres schema (Supabase: auth + Postgres + RLS)
  docs/                RISKS.md (§5 risk points), API.md (contract), this file
```

## Why one backend for two clients

The extension and the web app are both thin clients over the same backend
(Next.js API routes in `apps/web`). Segmentation, LLM calls (keyword extraction,
quiz generation, cloze generation), and spaced-repetition scheduling all live
server-side so:
- API keys (Anthropic, Supabase service role) never ship in extension code,
- the logic is written once and shared, instead of duplicated in a content
  script and a web app,
- `packages/shared` still factors out the *pure* logic (SM-2 math, level
  filtering thresholds) that both the backend and, if needed later, offline
  extension code can reuse without a network round-trip.

## Data flow (video segment example)

1. Extension content script detects `youtube.com/watch`, extracts the page's
   own caption track, and locally slices it into ~30-60s segments.
2. For each segment as it's reached, extension calls
   `POST /api/sources/:id/segments` with the raw transcript slice.
3. Backend calls Claude to extract+translate keywords, filters them by the
   user's level (`filterKeywordsForLevel`), persists everything, upserts the
   user's vocab bank, and returns `KeywordCue[]` with `startSeconds`.
4. Content script renders the overlay, showing each cue at its `startSeconds`
   relative to video playback time.
5. At segment/video end, extension offers the quiz (`POST .../quiz`) — never
   mid-playback.
6. After the session, the web app's vocab bank + flashcards read directly from
   Supabase (`vocab_items` + `srs_states`), independent of extension vs web app
   as the original source.

The web app's own podcast flow (§3.1-3.3 of the spec) is the same pipeline,
minus step 1's YouTube-specific caption scraping — the user pastes/uploads a
transcript or audio instead (see `docs/RISKS.md` for the transcription
provider abstraction).

## Auth pairing

See `docs/API.md#auth` — the extension can't share cookies with the web app's
domain, so it exchanges a short-lived pairing code (generated on
`/connect-extension` in the web app) for a bearer token.
