import { CEFR_LEVELS, type KeywordCue, type UserProfile } from "@streamlingo/shared";
import * as api from "../lib/api";
import { STORAGE_KEYS } from "../config";
import { Overlay, type OverlayPosition } from "./overlay";
import { fetchCaptionCues } from "./youtubeCaptions";
import { findSegmentIndexForTime, sliceIntoSegments } from "./segmenter";
import { cueKey, VideoSession } from "./session";
import { getVideoIdFromUrl, hideNativeCaptions, showNativeCaptions, waitForVideoElement } from "./youtubeDom";

let overlay: Overlay | null = null;
let session: VideoSession | null = null;
let currentVideoElement: HTMLVideoElement | null = null;
let profileCache: UserProfile | null = null;

// Bumped on every SPA navigation so a `setUpVideo` call left in flight from
// a video the user has already navigated away from (network calls take
// longer than a fast double-navigation) can detect it's stale and bail
// instead of overwriting the session for the video actually on screen.
let navigationGeneration = 0;

async function getOverlayPosition(): Promise<OverlayPosition> {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.overlayPosition);
  const value = stored[STORAGE_KEYS.overlayPosition];
  return value === "top-left" || value === "top-right" ? value : "top-right";
}

function ensureOverlay(position: OverlayPosition): Overlay {
  if (!overlay) {
    overlay = new Overlay(position);
  } else {
    overlay.setPosition(position);
  }
  return overlay;
}

async function loadProfile(): Promise<UserProfile | null> {
  if (profileCache) return profileCache;
  try {
    profileCache = await api.getProfile();
    return profileCache;
  } catch {
    return null;
  }
}

async function postSegment(currentSession: VideoSession, index: number): Promise<void> {
  if (currentSession.postedByIndex.has(index) || currentSession.postingIndexes.has(index)) return;
  const local = currentSession.localSegments[index];
  if (!local || !currentSession.source) return;

  currentSession.postingIndexes.add(index);
  try {
    const { segment, keywordCues } = await api.postSegment(currentSession.source.id, {
      index: local.index,
      startSeconds: local.startSeconds,
      endSeconds: local.endSeconds,
      transcript: local.transcript,
      cues: local.cues,
    });
    currentSession.postedByIndex.set(index, { local, backend: segment, keywordCues });
  } catch {
    // Left un-posted; the next timeupdate crossing this segment retries.
  } finally {
    currentSession.postingIndexes.delete(index);
  }
}

function onCueExpand(currentSession: VideoSession, segmentIndex: number, cue: KeywordCue): void {
  const posted = currentSession.postedByIndex.get(segmentIndex);
  if (!posted || !overlay) return;
  overlay.showCuePopover(cue, () => {
    void handleReplay(posted.backend.id);
  });
}

async function handleReplay(segmentId: string): Promise<void> {
  if (!overlay || !currentVideoElement) return;
  try {
    const { transcript, translation } = await api.getReplay(segmentId);
    const video = currentVideoElement;
    overlay.showReplayModal(transcript, translation, () => {
      const posted = [...(session?.postedByIndex.values() ?? [])].find((p) => p.backend.id === segmentId);
      if (posted) video.currentTime = posted.local.startSeconds;
    });
  } catch {
    overlay.showNotice("Réécoute indisponible pour le moment.");
  }
}

async function handleQuizRequested(currentSession: VideoSession, segmentIndex: number): Promise<void> {
  const posted = currentSession.postedByIndex.get(segmentIndex);
  if (!posted || !overlay) return;
  try {
    const { questions } = await api.getQuiz(posted.backend.id);
    overlay.showQuizModal(questions, (questionId, chosenIndex) => api.attemptQuizQuestion(questionId, chosenIndex));
  } catch {
    overlay.showNotice("Quiz indisponible pour le moment.");
  }
}

async function handleClozeRequested(currentSession: VideoSession, segmentIndex: number): Promise<void> {
  const posted = currentSession.postedByIndex.get(segmentIndex);
  if (!posted || !overlay) return;
  try {
    const item = await api.getCloze(posted.backend.id);
    hideNativeCaptions();
    currentSession.clozeActiveForIndex = segmentIndex;
    overlay.showClozePanel(item);
  } catch {
    overlay.showNotice("Sous-titres à trous indisponibles pour ce passage.");
  }
}

function deactivateClozeIfNeeded(currentSession: VideoSession, newSegmentIndex: number): void {
  if (currentSession.clozeActiveForIndex !== null && currentSession.clozeActiveForIndex !== newSegmentIndex) {
    showNativeCaptions();
    overlay?.hideClozePanel();
    currentSession.clozeActiveForIndex = null;
  }
}

function offersCloze(level: UserProfile["level"]): boolean {
  return CEFR_LEVELS.indexOf(level) >= CEFR_LEVELS.indexOf("B1");
}

function onTimeUpdate(currentSession: VideoSession, video: HTMLVideoElement): void {
  const currentTime = video.currentTime;
  const segmentIndex = findSegmentIndexForTime(currentSession.localSegments, currentTime);

  if (segmentIndex !== -1 && segmentIndex !== currentSession.lastKnownSegmentIndex) {
    const previousIndex = currentSession.lastKnownSegmentIndex;
    const movedForward = segmentIndex > previousIndex;
    currentSession.lastKnownSegmentIndex = segmentIndex;

    void postSegment(currentSession, segmentIndex);
    // Prefetch the next segment slightly ahead so its keyword cues are
    // likely to have arrived by the time playback reaches it.
    void postSegment(currentSession, segmentIndex + 1);

    deactivateClozeIfNeeded(currentSession, segmentIndex);

    if (
      movedForward &&
      previousIndex >= 0 &&
      !currentSession.promptedIndexes.has(previousIndex) &&
      currentSession.postedByIndex.has(previousIndex)
    ) {
      currentSession.promptedIndexes.add(previousIndex);
      overlay?.showSegmentPrompt({
        offerCloze: offersCloze(currentSession.profile.level),
        onQuiz: () => void handleQuizRequested(currentSession, previousIndex),
        onCloze: () => void handleClozeRequested(currentSession, previousIndex),
        onDismiss: () => {},
      });
    }
  }

  if (segmentIndex === -1) return;
  const posted = currentSession.postedByIndex.get(segmentIndex);
  if (!posted || !overlay) return;

  for (const cue of posted.keywordCues) {
    const key = cueKey(segmentIndex, cue);
    if (currentSession.shownCueKeys.has(key)) continue;
    if (currentTime >= cue.startSeconds) {
      currentSession.shownCueKeys.add(key);
      overlay.showCue(cue, (c) => onCueExpand(currentSession, segmentIndex, c));
    }
  }
}

async function setUpVideo(videoId: string, myGeneration: number): Promise<void> {
  const isStale = () => myGeneration !== navigationGeneration;

  const status = await api.authStatus().catch(() => ({ paired: false }));
  if (isStale()) return;
  const position = await getOverlayPosition();
  if (isStale()) return;
  const activeOverlay = ensureOverlay(position);

  if (!status.paired) {
    activeOverlay.showNotice("StreamLingo : connectez l'extension depuis les options pour activer l'overlay.");
    return;
  }

  const profile = await loadProfile();
  if (isStale()) return;
  if (!profile) {
    activeOverlay.showNotice("StreamLingo : terminez l'inscription sur l'application web pour activer l'overlay.");
    return;
  }

  const video = await waitForVideoElement();
  if (isStale() || !video) return;
  currentVideoElement = video;

  const cues = await fetchCaptionCues(videoId, profile.targetLanguage).catch(() => null);
  if (isStale()) return;
  if (!cues) {
    activeOverlay.showNotice("Pas de sous-titres disponibles pour cette vidéo.");
    return;
  }

  const localSegments = sliceIntoSegments(cues);
  if (localSegments.length === 0) {
    activeOverlay.showNotice("Pas de sous-titres exploitables pour cette vidéo.");
    return;
  }

  const source = await api.createSource({
    kind: "youtube",
    externalId: videoId,
    title: document.title.replace(/ - YouTube$/, ""),
    durationSeconds: Number.isFinite(video.duration) ? Math.round(video.duration) : undefined,
  });
  if (isStale()) return;

  const newSession = new VideoSession(videoId, profile);
  newSession.source = source;
  newSession.localSegments = localSegments;
  session = newSession;

  video.addEventListener("timeupdate", () => {
    if (session === newSession) onTimeUpdate(newSession, video);
  });

  void postSegment(newSession, 0);
}

async function handleVideoChange(): Promise<void> {
  const videoId = getVideoIdFromUrl();
  if (!videoId || videoId === session?.videoId) return;

  navigationGeneration += 1;
  const myGeneration = navigationGeneration;

  session = null;
  showNativeCaptions();
  overlay?.hideClozePanel();
  overlay?.hideSegmentPrompt();
  overlay?.closeModal();

  await setUpVideo(videoId, myGeneration);
}

function watchForSpaNavigation(): void {
  // yt-navigate-finish is an internal, undocumented YouTube SPA event —
  // used as the fast path, with a low-frequency URL poll as a safety net
  // in case YouTube renames/removes it in a future frontend revision.
  document.addEventListener("yt-navigate-finish", () => void handleVideoChange());

  let lastHref = window.location.href;
  window.setInterval(() => {
    if (window.location.href !== lastHref) {
      lastHref = window.location.href;
      void handleVideoChange();
    }
  }, 1000);
}

function watchForOverlayPositionChanges(): void {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    const change = changes[STORAGE_KEYS.overlayPosition];
    if (!change) return;
    const value = change.newValue;
    if (value === "top-left" || value === "top-right") {
      overlay?.setPosition(value);
    }
  });
}

function main(): void {
  watchForSpaNavigation();
  watchForOverlayPositionChanges();
  void handleVideoChange();
}

main();
