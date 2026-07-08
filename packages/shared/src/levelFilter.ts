import { CEFR_LEVELS, type CefrLevel, type FrequencyRank, type KeywordCue } from "./types";

/**
 * Minimum word-rarity (frequencyRank) to surface for each level, and a cap on
 * how many keyword cues per segment to avoid cluttering the overlay.
 * A1 sees almost everything above basic function words; C1 sees only the
 * rarest, most idiomatic vocabulary.
 */
const LEVEL_CONFIG: Record<CefrLevel, { minFrequencyRank: FrequencyRank; maxPerSegment: number }> = {
  A1: { minFrequencyRank: 1, maxPerSegment: 14 },
  A2: { minFrequencyRank: 1, maxPerSegment: 10 },
  B1: { minFrequencyRank: 2, maxPerSegment: 7 },
  B2: { minFrequencyRank: 3, maxPerSegment: 5 },
  C1: { minFrequencyRank: 4, maxPerSegment: 3 },
};

export function levelIndex(level: CefrLevel): number {
  return CEFR_LEVELS.indexOf(level);
}

/**
 * Filters and caps keyword cues for a segment according to the user's level.
 * Keeps chronological order (by startSeconds) so overlay sync stays correct.
 */
export function filterKeywordsForLevel(cues: KeywordCue[], level: CefrLevel): KeywordCue[] {
  const { minFrequencyRank, maxPerSegment } = LEVEL_CONFIG[level];

  const eligible = cues
    .filter((cue) => cue.frequencyRank >= minFrequencyRank)
    .sort((a, b) => a.startSeconds - b.startSeconds);

  if (eligible.length <= maxPerSegment) return eligible;

  // Keep the rarest words first when we must cut, then restore chronological order.
  const byRarity = [...eligible].sort((a, b) => b.frequencyRank - a.frequencyRank);
  const kept = new Set(byRarity.slice(0, maxPerSegment));
  return eligible.filter((cue) => kept.has(cue));
}

export function levelConfigFor(level: CefrLevel) {
  return LEVEL_CONFIG[level];
}
