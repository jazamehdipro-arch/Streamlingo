export interface DraftSegment {
  index: number;
  text: string;
  wordCount: number;
}

export interface TimedDraftSegment extends DraftSegment {
  startSeconds: number;
  endSeconds: number;
}

/**
 * TODO(MVP): naive fixed-word-count chunking. Fine-grained thematic
 * segmentation (topic/pause boundaries) is out of scope for this scaffold —
 * see docs/ARCHITECTURE.md — this just slices every ~250 words.
 */
export function sliceTranscriptIntoSegments(transcript: string, wordsPerSegment = 250): DraftSegment[] {
  const words = transcript.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const segments: DraftSegment[] = [];
  let index = 0;
  for (let i = 0; i < words.length; i += wordsPerSegment, index++) {
    const chunk = words.slice(i, i + wordsPerSegment);
    segments.push({ index, text: chunk.join(" "), wordCount: chunk.length });
  }
  return segments;
}

const ASSUMED_WORDS_PER_MINUTE = 150;

/**
 * When there's no real audio duration to anchor to, approximate segment
 * boundaries with an assumed speaking rate. If a real `<audio>` duration is
 * available, pass it in and boundaries are proportional to that instead.
 */
export function estimateSegmentTimings(
  segments: DraftSegment[],
  totalDurationSeconds?: number
): TimedDraftSegment[] {
  const totalWords = segments.reduce((sum, s) => sum + s.wordCount, 0) || 1;
  const totalSeconds = totalDurationSeconds ?? (totalWords / ASSUMED_WORDS_PER_MINUTE) * 60;

  let cumulativeWords = 0;
  return segments.map((segment) => {
    const startSeconds = (cumulativeWords / totalWords) * totalSeconds;
    cumulativeWords += segment.wordCount;
    const endSeconds = (cumulativeWords / totalWords) * totalSeconds;
    return { ...segment, startSeconds, endSeconds };
  });
}
