import { CEFR_LEVELS, type CefrLevel, type KeywordCue } from "./types";
import { LEVEL_PROFILES } from "./levelProfiles";

export function levelIndex(level: CefrLevel): number {
  return CEFR_LEVELS.indexOf(level);
}

/**
 * Filters and caps keyword cues for a segment according to the user's level
 * profile (rarity threshold + density cap). Keeps chronological order (by
 * startSeconds) so overlay sync stays correct.
 */
export function filterKeywordsForLevel(cues: KeywordCue[], level: CefrLevel): KeywordCue[] {
  const { minFrequencyRank, maxPerSegment } = LEVEL_PROFILES[level];

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
  const { minFrequencyRank, maxPerSegment } = LEVEL_PROFILES[level];
  return { minFrequencyRank, maxPerSegment };
}
