import { CEFR_LEVELS, type KeywordCue, type UserProfile } from "@streamlingo/shared";
import * as api from "../lib/api";
import { STORAGE_KEYS } from "../config";
import { Overlay, type OverlayPosition } from "./overlay";
import { fetchCaptionCues } from "./youtubeCaptions";
import { findSegmentIndexForTime, sliceIntoSegments } from "@streamlingo/shared";
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

const OVERLAY_POSITIONS: OverlayPosition[] = ["top-left", "top-right", "bottom-left", "bottom-right"];

async function getOverlayPosition(): Promise<OverlayPosition> {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.overlayPosition);
  const value = stored[STORAGE_KEYS.overlayPosition] as OverlayPosition;
  return OVERLAY_POSITIONS.includes(value) ? value : "top-right";
}

async function shouldPauseOnPopover(): Promise<boolean> {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.pauseOnPopover);
  return stored[STORAGE_KEYS.pauseOnPopover] === true;
}

function ensureOverlay(position: OverlayPosition): Overlay {
  const player = document.querySelector<HTMLElement>("#movie_player");
  if (overlay && !overlay.isMounted()) {
    // YouTube re-rendered the player subtree and dropped our host.
    overlay.destroy();
    overlay = null;
  }
  if (!overlay) {
    overlay = new Overlay(position, player ?? undefined);
  } else {
    overlay.setPosition(position);
  }
  return overlay;
}

function log(...args: unknown[]): void {
  console.warn("[Wordhook]", ...args);
}

async function loadProfile(): Promise<UserProfile | null> {
  if (profileCache) return profileCache;
  try {
    profileCache = await api.getProfile();
    return profileCache;
  } catch (err) {
    log("profile fetch failed", err);
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
    log(`segment ${index} analysé : ${keywordCues.length} mot(s)-clé(s)`);
    if (index === 0 && keywordCues.length === 0) {
      overlay?.showNotice(
        "Wordhook : passage analysé mais aucun mot-clé au-dessus de ton niveau dans ce passage."
      );
    }
  } catch (err) {
    // Left un-posted; the next timeupdate crossing this segment retries —
    // but silently swallowing this made real failures (server unreachable,
    // token expired) indistinguishable from "working, just slow" in the field.
    log(`segment ${index} : échec de l'analyse`, err);
    const status = err instanceof api.ApiError ? err.status : undefined;
    if (status === 401) {
      overlay?.showNotice(
        "Wordhook : session expirée — génère un nouveau code sur le site et ré-associe l'extension (Options).",
        12000
      );
    } else if (status === 402) {
      overlay?.showNotice(
        "Wordhook : quota gratuit du mois atteint 🎯 — passe en Pro sur le site pour l'illimité (les vidéos déjà analysées restent dispo).",
        15000
      );
    } else if (index === 0) {
      overlay?.showNotice(
        `Wordhook : le serveur n'a pas répondu (${status ?? "réseau"}) — nouvel essai automatique pendant la lecture.`,
        10000
      );
    }
  } finally {
    currentSession.postingIndexes.delete(index);
  }
}

function onCueExpand(currentSession: VideoSession, segmentIndex: number, cue: KeywordCue): void {
  const posted = currentSession.postedByIndex.get(segmentIndex);
  if (!posted || !overlay) return;
  openCuePopover(cue, () => void handleReplay(posted.backend.id));
}

/**
 * Opens the word popover, optionally auto-pausing the video while it's open
 * (opt-in setting — the default never touches playback, per the product's
 * "immersion never force-broken" principle).
 */
function openCuePopover(cue: KeywordCue, onReplay?: () => void): void {
  if (!overlay) return;
  void shouldPauseOnPopover().then((pause) => {
    if (!overlay) return;
    const video = currentVideoElement;
    if (pause && video && !video.paused) {
      video.pause();
      overlay.setModalCloseListener(() => void video.play().catch(() => {}));
    }
    overlay.showCuePopover(cue, onReplay);
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
    overlay.showClozePanel(item, undefined, () => {
      showNativeCaptions();
      currentSession.clozeActiveForIndex = null;
    });
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
    // Prefetch two segments ahead: analysis takes seconds, and cues that
    // arrive after their moment has passed are dropped by the freshness
    // window below — lead time is what makes sync feel instant.
    void postSegment(currentSession, segmentIndex + 1);
    void postSegment(currentSession, segmentIndex + 2);

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

  // One minute before the end (nobody watches to the last second), offer the
  // recap without blocking playback. Skipped for videos under two minutes,
  // where "one minute before the end" is just the middle of the video.
  if (
    !currentSession.recapPromptShown &&
    Number.isFinite(video.duration) &&
    video.duration > 120 &&
    video.duration - currentTime <= 60
  ) {
    currentSession.recapPromptShown = true;
    overlay.showRecapPrompt(() => {
      currentSession.recapDismissed = true;
    });
  }

  // Freshness window: a cue whose moment passed more than a few seconds ago
  // (analysis returned late, or the user seeked) is consumed WITHOUT being
  // displayed — dumping a backlog of stale words all at once reads as
  // "broken sync", the exact opposite of the product's core promise. The
  // word is still in the vocab bank and the session panel regardless.
  const FRESHNESS_SECONDS = 5;
  for (const cue of posted.keywordCues) {
    if (currentSession.knownLemmas.has(cue.lemma)) continue;
    const key = cueKey(segmentIndex, cue);
    if (currentSession.shownCueKeys.has(key)) continue;
    if (currentTime >= cue.startSeconds) {
      currentSession.shownCueKeys.add(key);
      if (currentTime - cue.startSeconds <= FRESHNESS_SECONDS) {
        overlay.showCue(cue, (c) => onCueExpand(currentSession, segmentIndex, c));
      }
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
    activeOverlay.showNotice("Wordhook : connectez l'extension depuis les options pour activer l'overlay.");
    return;
  }

  const profile = await loadProfile();
  if (isStale()) return;
  if (!profile) {
    activeOverlay.showNotice("Wordhook : terminez l'inscription sur l'application web pour activer l'overlay.");
    return;
  }
  activeOverlay.setLanguage(profile.targetLanguage);
  activeOverlay.setWordExpandHandler((cue) => openCuePopover(cue));
  activeOverlay.setExampleGenerator((cue) =>
    api.generateExample({ lemma: cue.lemma, word: cue.word, translation: cue.translation })
  );
  activeOverlay.setExplainHandler(() => {
    const active = session;
    const video = currentVideoElement;
    if (!active || !video || !overlay) return;
    // Last ~15s of caption text around the point of confusion. 10s of ASR is
    // often just a clause fragment; a little extra context makes the
    // explanation coherent without drifting from "what was JUST said".
    const from = Math.max(0, video.currentTime - 15);
    const recent = active.localSegments
      .flatMap((seg) => seg.cues)
      .filter((c) => c.startSeconds >= from && c.startSeconds <= video.currentTime)
      .map((c) => c.text)
      .join(" ")
      .trim();
    if (!recent) {
      overlay.showNotice("Rien à expliquer pour l'instant — laisse la vid\u00e9o parler un peu.");
      return;
    }
    void shouldPauseOnPopover().then((pause) => {
      if (!overlay) return;
      if (pause && !video.paused) {
        video.pause();
        overlay.setModalCloseListener(() => void video.play().catch(() => {}));
      }
      overlay.showExplainModal(api.explainRecent(recent));
    });
  });
  activeOverlay.setMarkKnownHandler(async (cue) => {
    await api.markKnown({
      lemma: cue.lemma,
      translation: cue.translation,
      exampleSentence: cue.exampleSentence,
      exampleTranslation: cue.exampleTranslation,
      phonetic: cue.phonetic,
    });
    session?.knownLemmas.add(cue.lemma);
    activeOverlay.forgetLemma(cue.lemma);
  });

  const video = await waitForVideoElement();
  if (isStale() || !video) return;
  currentVideoElement = video;

  const cues = await fetchCaptionCues(videoId, profile.targetLanguage).catch(() => null);
  if (isStale()) return;
  if (!cues) {
    activeOverlay.showNotice(
      "Pas de sous-titres accessibles pour cette vidéo (détails techniques dans la console : F12 → Console, filtre Wordhook)."
    );
    return;
  }

  const localSegments = sliceIntoSegments(cues);
  if (localSegments.length === 0) {
    activeOverlay.showNotice("Pas de sous-titres exploitables pour cette vidéo.");
    return;
  }

  let source;
  try {
    source = await api.createSource({
      kind: "youtube",
      externalId: videoId,
      title: document.title.replace(/ - YouTube$/, ""),
      durationSeconds: Number.isFinite(video.duration) ? Math.round(video.duration) : undefined,
    });
  } catch (err) {
    log("createSource failed", err);
    const status = err instanceof api.ApiError ? err.status : undefined;
    activeOverlay.showNotice(
      status === 401
        ? "Wordhook : session expirée — génère un nouveau code sur le site et ré-associe l'extension (Options)."
        : `Wordhook : impossible de joindre le serveur (${status ?? "réseau"}). Recharge la page pour réessayer.`,
      12000
    );
    return;
  }
  if (isStale()) return;
  log(`session démarrée : ${localSegments.length} segment(s), analyse IA du premier passage…`);
  activeOverlay.showNotice("Wordhook actif ✓ — analyse du premier passage en cours…");

  const newSession = new VideoSession(videoId, profile);
  newSession.source = source;
  newSession.localSegments = localSegments;
  session = newSession;

  video.addEventListener("timeupdate", () => {
    if (session === newSession) onTimeUpdate(newSession, video);
  });

  video.addEventListener("ended", () => {
    if (session === newSession && !newSession.recapDismissed) overlay?.showRecap();
  });

  void postSegment(newSession, 0);
  void postSegment(newSession, 1);
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
