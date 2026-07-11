import type { CaptionCue } from "./youtubeCaptions";

const TARGET_SEGMENT_SECONDS = 45;
const MIN_SEGMENT_SECONDS = 30;
const MAX_SEGMENT_SECONDS = 60;

export interface LocalSegment {
  index: number;
  startSeconds: number;
  endSeconds: number;
  transcript: string;
  /** Original cues with real timestamps, forwarded to the backend so keyword
   * timing can be anchored to actual caption times (docs/RISKS.md §2). */
  cues: CaptionCue[];
}

/**
 * Slices cues into ~30-60s segments by cumulative cue span rather than a
 * fixed wall-clock window, so a boundary always falls between cues (never
 * mid-cue): splitting a caption line in half would hand the backend a
 * transcript fragment with no coherent sentence to extract keywords from.
 */
export function sliceIntoSegments(cues: CaptionCue[]): LocalSegment[] {
  if (cues.length === 0) return [];

  const sorted = [...cues].sort((a, b) => a.startSeconds - b.startSeconds);
  const segments: LocalSegment[] = [];

  let bucket: CaptionCue[] = [];
  let bucketStart = sorted[0]?.startSeconds ?? 0;

  const flush = () => {
    if (bucket.length === 0) return;
    const last = bucket[bucket.length - 1];
    if (!last) return;
    segments.push({
      index: segments.length,
      startSeconds: bucketStart,
      endSeconds: last.startSeconds + last.durSeconds,
      transcript: bucket.map((c) => c.text).join(" "),
      cues: bucket,
    });
    bucket = [];
  };

  for (const cue of sorted) {
    if (bucket.length === 0) {
      bucketStart = cue.startSeconds;
    }
    const spanIfAdded = cue.startSeconds + cue.durSeconds - bucketStart;

    if (spanIfAdded > MAX_SEGMENT_SECONDS && bucket.length > 0) {
      flush();
      bucketStart = cue.startSeconds;
    }

    bucket.push(cue);

    const currentSpan = cue.startSeconds + cue.durSeconds - bucketStart;
    if (currentSpan >= TARGET_SEGMENT_SECONDS) {
      flush();
    }
  }

  flush();

  // A trailing sliver shorter than the minimum reads oddly as its own quiz
  // unit; folding it into the previous segment keeps quiz/cloze boundaries
  // meaningful without discarding transcript.
  if (segments.length >= 2) {
    const lastSeg = segments[segments.length - 1];
    const prevSeg = segments[segments.length - 2];
    if (lastSeg && prevSeg && lastSeg.endSeconds - lastSeg.startSeconds < MIN_SEGMENT_SECONDS) {
      prevSeg.endSeconds = lastSeg.endSeconds;
      prevSeg.transcript = `${prevSeg.transcript} ${lastSeg.transcript}`;
      prevSeg.cues = [...prevSeg.cues, ...lastSeg.cues];
      segments.pop();
    }
  }

  return segments;
}

export function findSegmentIndexForTime(segments: LocalSegment[], currentTime: number): number {
  return segments.findIndex((seg) => currentTime >= seg.startSeconds && currentTime < seg.endSeconds);
}
