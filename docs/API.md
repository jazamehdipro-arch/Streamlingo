# API contract (apps/web backend)

The Next.js app in `apps/web` hosts both the web app UI and the backend API routes
under `/api/*`. The browser extension calls these same routes over HTTPS (CORS
enabled for the extension's origin), so extension and web app share one backend,
one LLM integration, and one database.

## Auth

Supabase Auth (email/password or magic link). The web app holds a session
cookie normally. The extension cannot share cookies with `youtube.com`, so:

1. User logs in on the web app.
2. Web app page `/connect-extension` shows a short-lived pairing code tied to
   their Supabase session.
3. Extension options page: user pastes the code, extension exchanges it via
   `POST /api/extension/pair` for a long-lived access token, stored in
   `chrome.storage.local`.
4. All subsequent extension requests send `Authorization: Bearer <token>`.

## Endpoints

All bodies/responses are JSON. Types referenced (`CefrLevel`, `KeywordCue`, etc.)
are defined in `packages/shared/src/types.ts`.

### `POST /api/onboarding`
Body: `{ targetLanguage: string, nativeLanguage: string, level: CefrLevel }`
→ `UserProfile`. Creates or updates the caller's profile.

### `GET /api/profile`
→ `UserProfile | null`.

### `POST /api/sources`
Body: `{ kind: "youtube" | "podcast", externalId?: string, title: string, durationSeconds?: number }`
→ `ContentSource`. Idempotent on `(userId, kind, externalId)` for YouTube sources.

### `POST /api/sources/:sourceId/segments`
Body: `{ index: number, startSeconds: number, endSeconds: number, transcript: string }`
→ `{ segment: Segment, keywordCues: KeywordCue[] }`.
Calls the LLM once to extract+translate keywords from the transcript, already
filtered to the caller's level (`filterKeywordsForLevel` from `@streamlingo/shared`),
persists the segment + cues, and upserts each lemma into the caller's `vocab_items`
(incrementing `times_encountered` and inserting a `vocab_encounters` row if the
lemma was already known — this is the cross-video "you've seen this word" signal).
Each returned `KeywordCue` carries `previouslyEncountered: boolean`, set from that
same upsert, so clients (extension overlay, web app) can badge it immediately
without a second round-trip.

### `POST /api/segments/:segmentId/quiz`
→ `{ questions: QuizQuestion[] }` (2-3 questions, difficulty calibrated to level).
Generates on first call, returns the cached set on subsequent calls for the same segment.

### `POST /api/quiz-questions/:questionId/attempt`
Body: `{ chosenIndex: number }` → `{ isCorrect: boolean, explanation: string }`.

### `POST /api/segments/:segmentId/cloze`
→ `ClozeItem`. B1+ only (caller's level checked server-side too, not just client UI).

### `GET /api/vocab?due=true`
→ `{ items: (VocabItem & { srs: SrsState })[] }`. `due=true` filters to items where
`srs.dueAt <= now`, for the flashcard review queue.

### `POST /api/vocab/:vocabItemId/review`
Body: `{ quality: ReviewQuality }` → updated `SrsState`. Runs `reviewSrsState` from
`@streamlingo/shared` server-side and persists it.

### `POST /api/segments/:segmentId/replay`
→ `{ transcript: string, translation: string }`. "Réécoute active" — word-for-word
transcript + full translation of one segment, generated on demand (not precomputed,
since most segments are never revisited this way).

### `POST /api/extension/pair`
Body: `{ code: string }` → `{ accessToken: string }`.

## LLM integration

`apps/web/src/lib/llm.ts` wraps `@anthropic-ai/sdk` with three functions:
`extractKeywords`, `generateQuiz`, `generateCloze` — each takes a transcript +
`CefrLevel` + language pair and returns strictly-typed JSON (validated with zod).
Keep prompts and zod schemas next to each function, not spread across route handlers.
