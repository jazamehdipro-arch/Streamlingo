import type {
  CefrLevel,
  ClozeItem,
  ContentSource,
  FrequencyRank,
  KeywordCue,
  QuizQuestion,
  Segment,
  SrsState,
  UserProfile,
  VocabItem,
} from "@streamlingo/shared";

export interface ProfileRow {
  id: string;
  target_language: string;
  native_language: string;
  level: CefrLevel;
  overlay_position: "top-left" | "top-right";
  created_at: string;
}

export interface ContentSourceRow {
  id: string;
  user_id: string;
  kind: "youtube" | "podcast";
  external_id: string | null;
  title: string;
  duration_seconds: number | null;
  created_at: string;
}

export interface SegmentRow {
  id: string;
  source_id: string;
  index: number;
  start_seconds: number | string;
  end_seconds: number | string;
  transcript: string;
}

export interface KeywordCueRow {
  id: string;
  segment_id: string;
  word: string;
  lemma: string;
  translation: string;
  example_sentence: string;
  example_translation: string;
  phonetic: string | null;
  start_seconds: number | string;
  frequency_rank: FrequencyRank;
}

export interface QuizQuestionRow {
  id: string;
  segment_id: string;
  question: string;
  choices: string[];
  correct_index: number;
  explanation: string;
}

export interface ClozeItemRow {
  id: string;
  segment_id: string;
  transcript_with_blanks: string;
  answers: { position: number; word: string }[];
}

export interface VocabItemRow {
  id: string;
  user_id: string;
  lemma: string;
  translation: string;
  example_sentence: string;
  example_translation: string;
  phonetic: string | null;
  first_seen_source_id: string | null;
  times_encountered: number;
  known?: boolean | null;
  created_at: string;
}

export interface SrsStateRow {
  vocab_item_id: string;
  ease_factor: number | string;
  interval_days: number;
  repetitions: number;
  due_at: string;
  last_reviewed_at: string | null;
}

export function mapProfile(row: ProfileRow): UserProfile {
  return {
    id: row.id,
    targetLanguage: row.target_language,
    nativeLanguage: row.native_language,
    level: row.level,
    overlayPosition: row.overlay_position,
    createdAt: row.created_at,
  };
}

export function mapSource(row: ContentSourceRow): ContentSource {
  return {
    id: row.id,
    userId: row.user_id,
    kind: row.kind,
    externalId: row.external_id,
    title: row.title,
    durationSeconds: row.duration_seconds,
    createdAt: row.created_at,
  };
}

export function mapSegment(row: SegmentRow): Segment {
  return {
    id: row.id,
    sourceId: row.source_id,
    index: row.index,
    startSeconds: Number(row.start_seconds),
    endSeconds: Number(row.end_seconds),
    transcript: row.transcript,
  };
}

export function mapKeywordCue(row: KeywordCueRow): KeywordCue {
  return {
    word: row.word,
    lemma: row.lemma,
    translation: row.translation,
    exampleSentence: row.example_sentence,
    exampleTranslation: row.example_translation,
    phonetic: row.phonetic,
    startSeconds: Number(row.start_seconds),
    frequencyRank: row.frequency_rank,
  };
}

export function mapQuizQuestion(row: QuizQuestionRow): QuizQuestion {
  return {
    id: row.id,
    segmentId: row.segment_id,
    question: row.question,
    choices: row.choices,
    correctIndex: row.correct_index,
    explanation: row.explanation,
  };
}

export function mapClozeItem(row: ClozeItemRow): ClozeItem {
  return {
    segmentId: row.segment_id,
    transcriptWithBlanks: row.transcript_with_blanks,
    answers: row.answers,
  };
}

export function mapVocabItem(row: VocabItemRow): VocabItem {
  return {
    id: row.id,
    userId: row.user_id,
    lemma: row.lemma,
    translation: row.translation,
    exampleSentence: row.example_sentence,
    exampleTranslation: row.example_translation,
    phonetic: row.phonetic,
    firstSeenSourceId: row.first_seen_source_id ?? "",
    timesEncountered: row.times_encountered,
    known: row.known === true,
    createdAt: row.created_at,
  };
}

export function mapSrsState(row: SrsStateRow): SrsState {
  return {
    vocabItemId: row.vocab_item_id,
    easeFactor: Number(row.ease_factor),
    intervalDays: row.interval_days,
    repetitions: row.repetitions,
    dueAt: row.due_at,
    lastReviewedAt: row.last_reviewed_at,
  };
}
