import type { ContentSource, KeywordCue, Segment, UserProfile } from "@streamlingo/shared";
import type { LocalSegment } from "./segmenter";

export interface PostedSegment {
  local: LocalSegment;
  backend: Segment;
  keywordCues: KeywordCue[];
}

/**
 * All per-video state lives here so a SPA navigation to a new video id can
 * throw the whole thing away and start clean, instead of trying to
 * reconcile stale segment/cue state against a different video's timeline.
 */
export class VideoSession {
  readonly videoId: string;
  readonly profile: UserProfile;
  source: ContentSource | null = null;
  localSegments: LocalSegment[] = [];
  postedByIndex = new Map<number, PostedSegment>();
  postingIndexes = new Set<number>();
  shownCueKeys = new Set<string>();
  promptedIndexes = new Set<number>();
  clozeActiveForIndex: number | null = null;
  lastKnownSegmentIndex = -1;
  /** Lemmas marked "known" during this session — filtered client-side immediately. */
  knownLemmas = new Set<string>();

  constructor(videoId: string, profile: UserProfile) {
    this.videoId = videoId;
    this.profile = profile;
  }
}

export function cueKey(segmentIndex: number, cue: KeywordCue): string {
  return `${segmentIndex}:${cue.lemma}:${cue.startSeconds}`;
}
