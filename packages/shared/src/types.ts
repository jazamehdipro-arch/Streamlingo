export type CefrLevel = "A1" | "A2" | "B1" | "B2" | "C1";

export const CEFR_LEVELS: CefrLevel[] = ["A1", "A2", "B1", "B2", "C1"];

/** 0 = most basic vocabulary, 4 = rarest/most advanced. Mirrors CEFR_LEVELS index. */
export type FrequencyRank = 0 | 1 | 2 | 3 | 4;

export interface UserProfile {
  id: string;
  targetLanguage: string; // BCP-47, e.g. "en", "es"
  nativeLanguage: string; // BCP-47, e.g. "fr"
  level: CefrLevel;
  overlayPosition: "top-left" | "top-right";
  createdAt: string;
}

/** A source of content: a YouTube video or an uploaded/linked podcast episode. */
export interface ContentSource {
  id: string;
  userId: string;
  kind: "youtube" | "podcast";
  externalId: string | null; // YouTube video id, or null for podcast
  title: string;
  durationSeconds: number | null;
  createdAt: string;
}

/**
 * One caption cue with its real timestamp, as extracted from the source
 * (YouTube timedtext track, or a future STT provider). Clients send these
 * alongside the segment transcript so the backend can anchor each keyword
 * to the cue it actually occurs in, instead of guessing by linear
 * interpolation over the whole segment (docs/RISKS.md §2).
 */
export interface TranscriptCue {
  text: string;
  startSeconds: number;
  durSeconds: number;
}

/** A time-bounded chunk of a source, used for quizzes / cloze / segment boundaries. */
export interface Segment {
  id: string;
  sourceId: string;
  index: number;
  startSeconds: number;
  endSeconds: number;
  transcript: string;
}

/** A keyword surfaced during a segment, synced to the moment it's spoken. */
export interface KeywordCue {
  word: string; // as it appears in the transcript
  lemma: string; // dictionary form
  translation: string;
  exampleSentence: string;
  exampleTranslation: string;
  phonetic: string | null;
  startSeconds: number; // when it's spoken, for overlay sync
  frequencyRank: FrequencyRank;
  /** True if this lemma was already in the user's vocab bank from a prior source. */
  previouslyEncountered?: boolean;
}

export interface QuizQuestion {
  id: string;
  segmentId: string;
  question: string;
  choices: string[];
  correctIndex: number;
  explanation: string;
}

export interface ClozeItem {
  segmentId: string;
  transcriptWithBlanks: string; // "___" placeholders
  answers: { position: number; word: string }[];
}

/** One vocabulary entry in a user's personal bank, deduplicated by lemma+language. */
export interface VocabItem {
  id: string;
  userId: string;
  lemma: string;
  translation: string;
  exampleSentence: string;
  exampleTranslation: string;
  phonetic: string | null;
  firstSeenSourceId: string;
  timesEncountered: number;
  /** Marked as already-known by the learner: kept for stats, excluded from reviews. */
  known: boolean;
  createdAt: string;
}

/** SM-2 spaced repetition state for one vocab item. */
export interface SrsState {
  vocabItemId: string;
  easeFactor: number; // >= 1.3
  intervalDays: number;
  repetitions: number;
  dueAt: string; // ISO date
  lastReviewedAt: string | null;
}

/** Quality of recall for an SM-2 review, 0-5 (SuperMemo scale). */
export type ReviewQuality = 0 | 1 | 2 | 3 | 4 | 5;
