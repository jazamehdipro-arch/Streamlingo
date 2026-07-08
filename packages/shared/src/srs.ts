import type { ReviewQuality, SrsState } from "./types";

const MIN_EASE_FACTOR = 1.3;

export function createInitialSrsState(vocabItemId: string): SrsState {
  return {
    vocabItemId,
    easeFactor: 2.5,
    intervalDays: 0,
    repetitions: 0,
    dueAt: new Date().toISOString(),
    lastReviewedAt: null,
  };
}

/**
 * SM-2 spaced repetition (SuperMemo 2). Quality < 3 resets the repetition
 * streak and schedules a same-day retry; quality >= 3 advances the interval.
 */
export function reviewSrsState(
  state: SrsState,
  quality: ReviewQuality,
  now: Date = new Date()
): SrsState {
  const easeFactor = Math.max(
    MIN_EASE_FACTOR,
    state.easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
  );

  if (quality < 3) {
    return {
      ...state,
      easeFactor,
      repetitions: 0,
      intervalDays: 0,
      dueAt: addDays(now, 0).toISOString(),
      lastReviewedAt: now.toISOString(),
    };
  }

  const repetitions = state.repetitions + 1;
  let intervalDays: number;
  if (repetitions === 1) intervalDays = 1;
  else if (repetitions === 2) intervalDays = 6;
  else intervalDays = Math.round(state.intervalDays * easeFactor);

  return {
    ...state,
    easeFactor,
    repetitions,
    intervalDays,
    dueAt: addDays(now, intervalDays).toISOString(),
    lastReviewedAt: now.toISOString(),
  };
}

export function isDue(state: SrsState, now: Date = new Date()): boolean {
  return new Date(state.dueAt).getTime() <= now.getTime();
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}
