import type { KeywordCue, TranscriptCue } from "@streamlingo/shared";

/**
 * The LLM extracts keywords from plain transcript text and has no access to
 * real audio timestamps, so timing is reconstructed here. Two strategies,
 * best available wins:
 *
 * 1. Cue-anchored (preferred): when the client sends the original caption
 *    cues with real timestamps (YouTube timedtext, future STT), each keyword
 *    is located in the cue whose text contains it, and timed as that cue's
 *    start plus a linear offset within the cue. Worst-case error is one cue
 *    (~2-5s) instead of one segment (~30-60s).
 *
 * 2. Segment-linear (fallback): linear interpolation of the keyword's
 *    character offset across the segment's full time range — assumes
 *    constant speech rate, which is false in practice (pauses, emphasis).
 *
 * Word-exact timing still needs a forced aligner (e.g. word-level Whisper
 * timestamps) per docs/RISKS.md §2; cue anchoring is the practical 90%.
 */
export function estimateWordTimings(
  transcript: string,
  segmentStartSeconds: number,
  segmentEndSeconds: number,
  keywords: Array<Omit<KeywordCue, "startSeconds">>,
  cues?: TranscriptCue[]
): KeywordCue[] {
  if (cues && cues.length > 0) {
    return anchorToCues(transcript, segmentStartSeconds, segmentEndSeconds, keywords, cues);
  }
  return interpolateLinearly(transcript, segmentStartSeconds, segmentEndSeconds, keywords);
}

function anchorToCues(
  transcript: string,
  segmentStartSeconds: number,
  segmentEndSeconds: number,
  keywords: Array<Omit<KeywordCue, "startSeconds">>,
  cues: TranscriptCue[]
): KeywordCue[] {
  const sorted = [...cues].sort((a, b) => a.startSeconds - b.startSeconds);
  const lowered = sorted.map((cue) => cue.text.toLowerCase());
  // Track consumption per cue so a keyword repeated in the same cue, or the
  // same keyword appearing in two cues, advances instead of piling onto the
  // first occurrence.
  const searchFrom = new Array<number>(sorted.length).fill(0);
  let cueCursor = 0;

  const fallback = interpolateLinearly(transcript, segmentStartSeconds, segmentEndSeconds, keywords);

  return keywords.map((keyword, i) => {
    const lowerWord = keyword.word.toLowerCase();

    // Keywords arrive in rough transcript order, so scan forward from the
    // cursor first, then wrap to earlier cues for out-of-order LLM output.
    for (let pass = 0; pass < 2; pass++) {
      const start = pass === 0 ? cueCursor : 0;
      const end = pass === 0 ? sorted.length : cueCursor;
      for (let c = start; c < end; c++) {
        const cue = sorted[c];
        const at = lowered[c].indexOf(lowerWord, pass === 0 && c === cueCursor ? searchFrom[c] : 0);
        if (at === -1) continue;
        searchFrom[c] = at + lowerWord.length;
        cueCursor = c;
        const fractionInCue = cue.text.length > 0 ? at / cue.text.length : 0;
        return {
          ...keyword,
          startSeconds: cue.startSeconds + fractionInCue * cue.durSeconds,
        };
      }
    }

    return fallback[i];
  });
}

function interpolateLinearly(
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
