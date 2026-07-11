# StreamLingo — browser extension

Manifest V3 extension covering everything on `youtube.com/watch` pages: the
real-time keyword overlay, end-of-segment quiz prompt, B1+ cloze-subtitle
mode, and active replay. All learning content (vocab bank, flashcards,
podcast flow) lives in `apps/web`; this extension is a thin client over the
API in `docs/API.md`.

## Build

From the monorepo root:

```
npm install
npm run build --workspace=extension
```

This runs `extension/scripts/build.mjs` (plain esbuild, no framework),
bundling each entry point (`background`, `content`, `popup`, `options`) as a
self-contained IIFE into `extension/dist/`, and copies `manifest.json` plus
the popup/options HTML alongside them.

`npm run watch --workspace=extension` rebuilds on file changes.
`npm run typecheck --workspace=extension` runs `tsc --noEmit` in strict mode.

## Load unpacked

**Chrome / Chromium / Edge**
1. `chrome://extensions`
2. Enable "Developer mode" (top right)
3. "Load unpacked" → select `extension/dist`

**Firefox**
1. `about:debugging#/runtime/this-firefox`
2. "Load Temporary Add-on…" → select any file inside `extension/dist` (e.g. `manifest.json`)
3. Temporary add-ons are removed when Firefox restarts — reload after each browser restart during development.

## First-time setup

1. Complete onboarding (target language, native language, CEFR level) on the
   web app (`apps/web`) first — the extension has no onboarding UI of its
   own, per the product spec.
2. On the web app, open `/connect-extension` to get a short-lived pairing
   code.
3. In the extension's options page (right-click the toolbar icon →
   Options, or via the popup's "Ouvrir les options" link), paste the code.
   This exchanges it for a bearer token via `POST /api/extension/pair`,
   stored in `chrome.storage.local` and used by the background worker for
   every subsequent request.
4. Open any `youtube.com/watch` page with captions in the target language.

## Architecture notes

- **Background worker holds the token, not the content script.** The
  content script executes inside youtube.com's page — anything it holds is
  reachable by other content scripts/extensions sharing that page, and
  cross-origin `fetch` from that context is also more exposed to the page's
  own CSP. `extension/src/background/index.ts` is the only code that ever
  calls `fetch` with the `Authorization` header; the content script, popup,
  and options page all go through `chrome.runtime.sendMessage` (see
  `extension/src/lib/messages.ts` and `extension/src/lib/api.ts`).
- **Caption extraction is best-effort.** Per `docs/RISKS.md`, YouTube's own
  caption track is not commercially validated — quality and coverage vary,
  and per-cue timestamps cover a whole caption line, not a single word.
  `extension/src/content/youtubeCaptions.ts` fetches a fresh copy of the
  watch page HTML per video (rather than trusting the DOM's already-injected
  `ytInitialPlayerResponse`, which goes stale across YouTube's SPA
  navigations) and extracts the caption track that best matches the user's
  target language, falling back to the first available track.
- **Segment slicing uses cumulative cue duration**, not a fixed wall-clock
  window, so a segment boundary always falls between cues rather than
  through the middle of one — see `extension/src/content/segmenter.ts`.
- **The one legitimate programmatic seek** is "revenir à ce passage" inside
  the active-replay modal (`extension/src/content/overlay.ts` →
  `showReplayModal`). Nothing else in the extension calls
  `video.currentTime = …` or `.pause()`/`.play()` — the overlay, quiz, and
  cloze mode are all designed to sit alongside playback, never gate it.

## Known gaps / deviations from `docs/API.md`

- **`extension/src/content/index.tsx` is `index.ts`, no JSX.** The content
  script is plain DOM manipulation into a shadow root (see `overlay.ts`) —
  pulling in React just to render into a shadow root added a dependency and
  a hydration-into-shadow-DOM footgun for no real benefit at this scope. If
  the overlay's UI complexity grows, revisiting this with `preact` (small
  runtime, works fine mounted into a shadow root) is a reasonable next step.
- **No `webextension-polyfill` dependency.** Firefox has aliased `chrome.*`
  to `browser.*` since Firefox 101, including promise-returning
  `chrome.storage`/`chrome.runtime` calls used throughout this codebase, so
  the extra dependency wasn't pulled in. If you need to support older
  Firefox ESR releases, add `webextension-polyfill` and import it at the
  top of each entry point.
- **Icons omitted from `manifest.json`.** No `icons`/`action.default_icon`
  key — Chrome/Firefox fall back to a generic puzzle-piece icon. Add real
  PNGs and wire them in before shipping.

## Production checklist

- Update `API_BASE_URL` (and `WEB_APP_BASE_URL` if it differs) in
  `extension/src/config.ts` to the deployed origin.
- Add that same origin to `host_permissions` in `extension/manifest.json` —
  without it, every background-worker `fetch` is silently blocked by the
  browser before it leaves the machine.
