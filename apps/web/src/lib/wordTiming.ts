import type { KeywordCue } from "@streamlingo/shared";

/**
 * The LLM extracts keywords from plain transcript text and has no access to
 * real audio timestamps. Per docs/RISKS.md §2, this scaffold approximates
 * per-word timing by linearly interpolating each keyword's character offset
 * within the segment transcript across the segment's startSeconds..
 * endSeconds range — i.e. it assumes a constant speech rate within the
 * segment, which is false in practice (pauses, emphasis, silence). This is
 * the first thing to replace with a real forced-aligner (e.g. word-level
 * Whisper timestamps) before relying on the overlay's sync for anything
 * beyond a rough "it's roughly here" cue.
 */
export function estimateWordTimings(
  transcript: string,
  segmentStartSeconds: number,
  segmentEndSeconds: number,
  keywords: Array<Omit<KeywordCue, "startSeconds">>
): KeywordCue[] {
  const length = Math.max(1, transcript.length);
  const duration = Math.max(0, segmentEndSeconds - segmentStartSeconds);
  const lowerTranscript = transcript.toLowerCase();
  let searchFrom = 0;

  return keywords.map((keyword) => {
    const position = findWordPosition(lowerTranscript, keyword.word, searchFrom);
    if (position >= 0) searchFrom = position + keyword.word.length;

    const offset = position >= 0 ? position : searchFrom;
    const fraction = Math.min(1, Math.max(0, offset / length));

    return {
      ...keyword,
      startSeconds: segmentStartSeconds + fraction * duration,
    };
  });
}

function findWordPosition(lowerTranscript: string, word: string, from: number): number {
  const lowerWord = word.toLowerCase();
  const fromMatch = lowerTranscript.indexOf(lowerWord, from);
  if (fromMatch >= 0) return fromMatch;
  // Fall back to searching from the start in case the LLM returned
  // keywords out of transcript order.
  return lowerTranscript.indexOf(lowerWord);
}
