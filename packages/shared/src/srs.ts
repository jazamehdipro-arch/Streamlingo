import type { ReviewQuality, SrsState } from "./types";

const MIN_EASE_FACTOR = 1.3;

/**
 * Maximum words surfaced in the review queue per calendar day. Keeps the
 * session from becoming overwhelming after a break: overdue words ("revenants")
 * are served first, then newly encountered words fill the remaining slots.
 */
export const DAILY_REVIEW_CAP = 20;

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
  // Early intervals fan out by recall quality so the four choices are visibly
  // different from the very first review (Difficile sooner, Facile later).
  // Later reviews follow the classic SM-2 ease-scaled ladder.
  let intervalDays: number;
  if (repetitions === 1) intervalDays = quality === 3 ? 1 : quality === 4 ? 2 : 4;
  else if (repetitions === 2) intervalDays = quality === 3 ? 4 : quality === 4 ? 6 : 9;
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

/**
 * How well a word is anchored in memory, derived from its SM-2 state. Drives
 * the mastery badge and lets learners see progress at a glance rather than a
 * raw due-date. Thresholds mirror Anki's convention (a card is "mature" once
 * its interval passes ~21 days).
 *   new        never successfully reviewed
 *   learning   a few good reviews, still short intervals
 *   familiar   interval has grown past ~3 weeks
 *   mastered   interval past ~3 months, effectively long-term
 */
export type Mastery = "new" | "learning" | "familiar" | "mastered";

export function masteryOf(state: SrsState): Mastery {
  if (state.repetitions === 0) return "new";
  if (state.intervalDays >= 90) return "mastered";
  if (state.intervalDays >= 21) return "familiar";
  return "learning";
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}
