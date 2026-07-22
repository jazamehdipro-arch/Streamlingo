"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  findSegmentIndexForTime,
  sliceIntoSegments,
  type KeywordCue,
  type LocalSegment,
  type QuizQuestion,
  type UserProfile,
} from "@streamlingo/shared";
import QuizModal from "@/components/QuizModal";
import { speak } from "@/lib/tts";
import { getBrowserSupabase } from "@/lib/supabase";
import { syncSessionCookie } from "@/lib/authClient";

/** Minimal typings for the official YouTube IFrame Player API. */
interface YTPlayer {
  getCurrentTime(): number;
  destroy(): void;
}
declare global {
  interface Window {
    YT?: { Player: new (el: string | HTMLElement, opts: object) => YTPlayer };
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface FeedWord extends KeywordCue {
  id: string;
}

// On-video subtitle overlay: keep the last few words for a few seconds each, so
// reading happens in place (no list reflow) instead of words flashing past.
const OVERLAY_SECONDS = 7;
const OVERLAY_MAX = 2;

// Remember the current video + position so leaving and returning to the tab
// resumes where you left off, instead of losing the video.
const WATCH_KEY = "wordhook-watch";

interface AnalyzedSegment {
  segmentId: string;
  keywordCues: KeywordCue[];
}

function extractVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.hostname === "youtu.be") return url.pathname.slice(1) || null;
    if (url.hostname.endsWith("youtube.com")) {
      const v = url.searchParams.get("v");
      if (v) return v;
      const shorts = url.pathname.match(/^\/shorts\/([A-Za-z0-9_-]{11})/);
      if (shorts) return shorts[1];
    }
  } catch {
    return null;
  }
  return null;
}

export default function WatchPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null | undefined>(undefined);
  const [urlInput, setUrlInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const [videoId, setVideoId] = useState<string | null>(null);
  const [feed, setFeed] = useState<FeedWord[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [quiz, setQuiz] = useState<QuizQuestion[] | null>(null);
  const [quizOffer, setQuizOffer] = useState<string | null>(null);
  const [knownLemmas, setKnownLemmas] = useState<Set<string>>(new Set());
  const [overlay, setOverlay] = useState<FeedWord[]>([]);
  const [cinema, setCinema] = useState(false);

  const playerRef = useRef<YTPlayer | null>(null);
  const playerBoxRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<{ cue: FeedWord; at: number }[]>([]);
  const lastOverlayIdsRef = useRef("");
  const lastTimeRef = useRef(-1);
  const videoIdRef = useRef<string | null>(null);
  const resumeAtRef = useRef(0);
  const lastSavedTimeRef = useRef(0);
  const stateRef = useRef<{
    sourceId: string | null;
    segments: LocalSegment[];
    analyzed: Map<number, AnalyzedSegment>;
    posting: Set<number>;
    shownKeys: Set<string>;
    lastSegment: number;
  }>({ sourceId: null, segments: [], analyzed: new Map(), posting: new Set(), shownKeys: new Set(), lastSegment: -1 });

  useEffect(() => {
    async function loadProfile() {
      try {
        let res = await fetch("/api/profile");
        // A 401 usually means the auth cookie went stale (token expired, or a
        // fresh storage container in the installed app). Refresh the session,
        // re-sync the cookie, and retry once before giving up to the login page.
        if (res.status === 401) {
          const { data } = await getBrowserSupabase().auth.getSession();
          syncSessionCookie(data.session);
          res = await fetch("/api/profile");
        }
        if (res.status === 401) {
          router.replace("/login");
          return;
        }
        if (!res.ok) throw new Error(`Impossible de charger le profil (${res.status})`);
        const data: UserProfile | null = await res.json();
        if (!data) {
          router.replace("/onboarding");
          return;
        }
        setProfile(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Impossible de charger le profil");
      }
    }
    void loadProfile();
  }, [router]);

  async function analyzeSegment(index: number) {
    const st = stateRef.current;
    const segment = st.segments[index];
    if (!segment || !segment.transcript || !st.sourceId || st.analyzed.has(index) || st.posting.has(index)) return;
    st.posting.add(index);
    try {
      const res = await fetch(`/api/sources/${st.sourceId}/segments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          index: segment.index,
          startSeconds: segment.startSeconds,
          endSeconds: segment.endSeconds,
          transcript: segment.transcript,
          cues: segment.cues,
        }),
      });
      if (res.status === 402) {
        setStatus("Quota gratuit du mois atteint 🎯 — les passages déjà analysés restent disponibles.");
        setError("Passe en Pro pour l'analyse illimitée → /pricing");
        st.analyzed.set(index, { segmentId: "", keywordCues: [] });
        return;
      }
      if (!res.ok) throw new Error(`analyse (${res.status})`);
      const body: { segment: { id: string }; keywordCues: KeywordCue[] } = await res.json();
      st.analyzed.set(index, { segmentId: body.segment.id, keywordCues: body.keywordCues });
      if (index === 0) setStatus(null);
    } catch {
      if (index === 0) setStatus("Le serveur n'a pas répondu — nouvel essai automatique…");
    } finally {
      st.posting.delete(index);
    }
  }

  function onTick() {
    const player = playerRef.current;
    if (!player) return;
    const st = stateRef.current;
    const t = player.getCurrentTime();

    // Detect a seek (jump forward or back) between 500 ms ticks and re-sync:
    // clear the overlay so no word stays frozen, drop the "already shown" memory
    // so words at/after the new position can appear again, and force the next
    // segment to re-trigger analysis. The freshness window below prevents a dump.
    const prevTime = lastTimeRef.current;
    lastTimeRef.current = t;
    if (prevTime >= 0 && Math.abs(t - prevTime) > 2) {
      overlayRef.current = [];
      st.shownKeys = new Set();
      st.lastSegment = -1;
    }

    const segmentIndex = findSegmentIndexForTime(st.segments, t);

    if (segmentIndex !== -1 && segmentIndex !== st.lastSegment) {
      const previous = st.lastSegment;
      st.lastSegment = segmentIndex;
      void analyzeSegment(segmentIndex);
      void analyzeSegment(segmentIndex + 1);
      void analyzeSegment(segmentIndex + 2);
      // Segment-end quiz offer, never auto-opened.
      if (previous >= 0 && segmentIndex === previous + 1) {
        const done = st.analyzed.get(previous);
        if (done) setQuizOffer(done.segmentId);
      }
    }

    const analyzed = segmentIndex !== -1 ? st.analyzed.get(segmentIndex) : undefined;
    if (analyzed) {
      const FRESHNESS_SECONDS = 5;
      for (const cue of analyzed.keywordCues) {
        const key = `${segmentIndex}:${cue.lemma}:${cue.startSeconds}`;
        if (st.shownKeys.has(key)) continue;
        if (t >= cue.startSeconds) {
          st.shownKeys.add(key);
          if (t - cue.startSeconds <= FRESHNESS_SECONDS) {
            const id = `${key}:${Date.now()}`;
            const fw = { ...cue, id };
            setFeed((prev) => [fw, ...prev].slice(0, 60));
            overlayRef.current.push({ cue: fw, at: cue.startSeconds });
          }
        }
      }
    }

    // Always refresh the on-video overlay — even in a silent gap or an
    // unanalyzed segment — so a word respects its lifetime (OVERLAY_SECONDS of
    // video time, so it persists while paused) and never stays stuck.
    overlayRef.current = overlayRef.current
      .filter((o) => t - o.at <= OVERLAY_SECONDS)
      .slice(-OVERLAY_MAX);
    const ids = overlayRef.current.map((o) => o.cue.id).join(",");
    if (ids !== lastOverlayIdsRef.current) {
      lastOverlayIdsRef.current = ids;
      setOverlay(overlayRef.current.map((o) => o.cue));
    }

    // Persist the position every few seconds so a return to the tab resumes here.
    if (videoIdRef.current && Math.abs(t - lastSavedTimeRef.current) >= 3) {
      lastSavedTimeRef.current = t;
      try {
        localStorage.setItem(WATCH_KEY, JSON.stringify({ id: videoIdRef.current, t }));
      } catch {
        // Storage unavailable (private mode) — resume is best-effort.
      }
    }
  }

  async function startSession(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const id = extractVideoId(urlInput);
    if (!id) {
      setError("Colle un lien YouTube valide (ou l'identifiant de la vidéo).");
      return;
    }
    await beginSession(id);
  }

  function rememberVideo(id: string, resumeAt: number) {
    videoIdRef.current = id;
    resumeAtRef.current = resumeAt;
    lastSavedTimeRef.current = resumeAt;
    try {
      localStorage.setItem(WATCH_KEY, JSON.stringify({ id, t: resumeAt }));
    } catch {
      // Best-effort persistence.
    }
  }

  async function beginSession(id: string, resumeAt = 0) {
    if (!profile) return;
    setError(null);
    setStarting(true);
    setStatus("Recherche d'une session existante…");
    try {
      // Plan C face au mur anti-robot de YouTube : une vidéo déjà analysée
      // (extension sur ordinateur, ou tentative réussie ici) se rejoue
      // entièrement depuis la base — ni YouTube ni LLM.
      const sessRes = await fetch("/api/youtube/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: id }),
      });
      if (sessRes.ok) {
        const sess: {
          found: boolean;
          sourceId?: string;
          segments?: { segment: { id: string; index: number; startSeconds: number; endSeconds: number }; keywordCues: KeywordCue[] }[];
        } = await sessRes.json();
        if (sess.found && sess.sourceId && sess.segments && sess.segments.length > 0) {
          const st = stateRef.current;
          st.sourceId = sess.sourceId;
          st.segments = sess.segments.map((s) => ({
            index: s.segment.index,
            startSeconds: s.segment.startSeconds,
            endSeconds: s.segment.endSeconds,
            transcript: "",
            cues: [],
          }));
          st.analyzed = new Map(sess.segments.map((s, i) => [i, { segmentId: s.segment.id, keywordCues: s.keywordCues }]));
          st.posting = new Set();
          st.shownKeys = new Set();
          st.lastSegment = -1;
          overlayRef.current = [];
          lastOverlayIdsRef.current = "";
          lastTimeRef.current = -1;
          rememberVideo(id, resumeAt);
          setOverlay([]);
          setFeed([]);
          setVideoId(id);
          setStatus(null);
          return;
        }
      }

      setStatus("Récupération des sous-titres…");
      const capRes = await fetch("/api/youtube/captions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: id, language: profile.targetLanguage }),
      });
      const capBody = await capRes.json();
      if (!capRes.ok) {
        const hint =
          capBody.reason === "gated"
            ? " Astuce : regarde cette vidéo une fois sur ordinateur avec l'extension Wordhook — elle deviendra ensuite disponible ici, mots et timings inclus."
            : "";
        throw new Error((capBody.error ?? `Sous-titres indisponibles (${capRes.status})`) + hint);
      }

      const srcRes = await fetch("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "youtube", externalId: id, title: `YouTube ${id}` }),
      });
      if (!srcRes.ok) throw new Error(`Création de la session impossible (${srcRes.status})`);
      const source: { id: string } = await srcRes.json();

      const st = stateRef.current;
      st.sourceId = source.id;
      st.segments = sliceIntoSegments(capBody.cues);
      st.analyzed = new Map();
      st.posting = new Set();
      st.shownKeys = new Set();
      st.lastSegment = -1;
      overlayRef.current = [];
      lastOverlayIdsRef.current = "";
      lastTimeRef.current = -1;
      rememberVideo(id, resumeAt);
      setOverlay([]);

      setFeed([]);
      setVideoId(id);
      setStatus("Analyse du premier passage…");
      void analyzeSegment(0);
      void analyzeSegment(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de démarrer");
      setStatus(null);
    } finally {
      setStarting(false);
    }
  }

  // Boot the official IFrame player once a video is chosen.
  useEffect(() => {
    if (!videoId || !playerBoxRef.current) return;

    let interval: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    function createPlayer() {
      if (cancelled || !window.YT || !playerBoxRef.current) return;
      playerRef.current = new window.YT.Player(playerBoxRef.current, {
        videoId,
        width: "100%",
        height: "100%",
        playerVars: {
          playsinline: 1,
          rel: 0,
          start: Math.floor(resumeAtRef.current) || undefined,
        },
        events: {
          onReady: () => {
            interval = setInterval(onTick, 500);
          },
        },
      });
    }

    if (window.YT?.Player) {
      createPlayer();
    } else {
      window.onYouTubeIframeAPIReady = createPlayer;
      if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
        const script = document.createElement("script");
        script.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(script);
      }
    }

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
      playerRef.current?.destroy();
      playerRef.current = null;
    };
    // onTick reads everything through refs; videoId is the real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  // Restore the last video (a few seconds before where you left off) when the
  // tab is reopened, so leaving and coming back doesn't lose it.
  useEffect(() => {
    if (!profile || videoId) return;
    try {
      const raw = localStorage.getItem(WATCH_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as { id?: string; t?: number };
      if (saved?.id) void beginSession(saved.id, Math.max(0, (saved.t ?? 0) - 2));
    } catch {
      // Ignore malformed/absent saved state.
    }
    // Restore once, as soon as the profile is available.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  function clearVideo() {
    videoIdRef.current = null;
    resumeAtRef.current = 0;
    lastSavedTimeRef.current = 0;
    try {
      localStorage.removeItem(WATCH_KEY);
    } catch {
      // ignore
    }
    const st = stateRef.current;
    st.sourceId = null;
    st.segments = [];
    st.analyzed = new Map();
    st.posting = new Set();
    st.shownKeys = new Set();
    st.lastSegment = -1;
    overlayRef.current = [];
    lastOverlayIdsRef.current = "";
    lastTimeRef.current = -1;
    setOverlay([]);
    setFeed([]);
    setQuizOffer(null);
    setStatus(null);
    setError(null);
    setUrlInput("");
    setCinema(false);
    setVideoId(null); // triggers the player effect cleanup (destroys the iframe)
  }

  async function openQuiz(segmentId: string) {
    setQuizOffer(null);
    try {
      const res = await fetch(`/api/segments/${segmentId}/quiz`, { method: "POST" });
      if (!res.ok) throw new Error();
      const body: { questions: QuizQuestion[] } = await res.json();
      setQuiz(body.questions);
    } catch {
      setStatus("Quiz indisponible pour le moment.");
    }
  }

  async function loadExample(word: FeedWord) {
    if (word.exampleSentence) return;
    try {
      const res = await fetch("/api/vocab/example", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lemma: word.lemma, word: word.word, translation: word.translation }),
      });
      if (!res.ok) return;
      const example: { exampleSentence: string; exampleTranslation: string } = await res.json();
      setFeed((prev) => prev.map((w) => (w.lemma === word.lemma ? { ...w, ...example } : w)));
    } catch {
      // L'exemple est un bonus — silence en cas d'échec.
    }
  }

  async function markKnown(cue: KeywordCue) {
    try {
      await fetch("/api/vocab/known", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lemma: cue.lemma,
          translation: cue.translation,
          exampleSentence: cue.exampleSentence,
          exampleTranslation: cue.exampleTranslation,
          phonetic: cue.phonetic,
        }),
      });
      setKnownLemmas((prev) => new Set(prev).add(cue.lemma));
      setFeed((prev) => prev.filter((w) => w.lemma !== cue.lemma));
    } catch {
      setStatus("Impossible d'enregistrer — réessaie.");
    }
  }

  if (profile === undefined && !error) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-neutral-500">Chargement…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-4 px-4 py-6 sm:px-6">
      {!videoId && (
        <>
          <div>
            <h1 className="text-xl font-semibold">Regarder une vidéo YouTube</h1>
            <p className="text-sm text-neutral-500">
              Colle un lien — les mots importants apparaîtront sous la vidéo, au moment où ils sont
              prononcés. Fonctionne sur téléphone, sans extension.
            </p>
          </div>

          {error && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <form onSubmit={startSession} className="flex flex-col gap-3 sm:flex-row">
            <input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=…"
              className="flex-1 rounded-full border border-neutral-300 px-4 py-2.5 text-sm outline-none focus:border-neutral-900"
              inputMode="url"
            />
            <button
              type="submit"
              disabled={starting}
              className="rounded-full bg-neutral-900 px-6 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {starting ? "Préparation…" : "Regarder"}
            </button>
          </form>
          {status && <p className="text-sm text-neutral-500">{status}</p>}
        </>
      )}

      {videoId && (
        <>
          <div
            className={
              cinema
                ? "fixed inset-0 z-50 flex items-center justify-center bg-black"
                : "sticky top-14 z-30 -mx-4 sm:mx-0"
            }
          >
            <div className="relative w-full">
              <div
                className={
                  cinema
                    ? "mx-auto aspect-video"
                    : "aspect-video w-full overflow-hidden bg-black sm:rounded-2xl"
                }
                // Largest 16:9 box that fits both screen width and height, so the
                // video never overflows the viewport (no "too zoomed" crop).
                style={cinema ? { width: "min(100vw, calc(100dvh * 16 / 9))" } : undefined}
              >
                <div ref={playerBoxRef} className="h-full w-full" />
              </div>

              {overlay.length > 0 && (
                <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-center gap-0.5 bg-gradient-to-b from-black/75 via-black/40 to-transparent px-3 pb-6 pt-2">
                  {overlay.map((w) => (
                    <p
                      key={w.id}
                      className="text-center text-sm font-medium text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
                    >
                      <span className="font-semibold">{w.word}</span>
                      <span className="text-indigo-200"> — {w.translation}</span>
                    </p>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={() => setCinema((c) => !c)}
                className="absolute right-2 top-2 z-10 flex h-9 items-center gap-1 rounded-full bg-black/60 px-3 text-xs font-medium text-white backdrop-blur"
                title={cinema ? "Quitter le grand écran" : "Grand écran"}
              >
                {cinema ? "✕ Quitter" : "⤢ Grand écran"}
              </button>

              {cinema && (
                <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-[11px] text-white/50 landscape:hidden">
                  Tourne ton téléphone · touche ✕ pour revenir
                </p>
              )}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={clearVideo}
              className="rounded-full border border-neutral-200 px-3 py-1.5 text-xs text-neutral-500 transition hover:border-neutral-900 hover:text-neutral-900"
            >
              ↺ Changer de vidéo
            </button>
          </div>

          {status && <p className="text-sm text-neutral-500">{status}</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}

          {quizOffer && (
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3">
              <p className="text-sm text-indigo-900">Se tester sur le passage précédent ?</p>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => void openQuiz(quizOffer)}
                  className="rounded-full bg-indigo-600 px-4 py-1.5 text-sm text-white"
                >
                  Quiz
                </button>
                <button
                  type="button"
                  onClick={() => setQuizOffer(null)}
                  className="rounded-full px-3 py-1.5 text-sm text-indigo-400"
                >
                  ✕
                </button>
              </div>
            </div>
          )}

          {feed.length === 0 && !status && (
            <p className="py-6 text-center text-sm text-neutral-400">
              Lance la lecture — les mots apparaîtront ici en direct.
            </p>
          )}

          <ul className="flex flex-col gap-2 pb-16">
            {feed.map((word) => {
              const expanded = expandedId === word.id;
              return (
                <li
                  key={word.id}
                  className="rounded-2xl border border-neutral-200 border-l-4 border-l-indigo-400 px-4 py-3 transition"
                  onClick={() => {
                    setExpandedId(expanded ? null : word.id);
                    if (!expanded) void loadExample(word);
                  }}
                >
                  <div className="flex items-center gap-2">
                    <p className="flex-1 text-[15px]">
                      <span className="font-semibold">{word.word}</span>
                      <span className="text-indigo-500"> — {word.translation}</span>
                      {word.previouslyEncountered && !knownLemmas.has(word.lemma) && (
                        <span className="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] text-indigo-700">
                          déjà vu
                        </span>
                      )}
                    </p>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        speak(word.word, profile?.targetLanguage ?? "en");
                      }}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-neutral-200"
                      title="Écouter"
                    >
                      🔊
                    </button>
                  </div>

                  {expanded && (
                    <div className="mt-3 flex flex-col gap-2 border-t border-neutral-100 pt-3 text-sm">
                      {word.phonetic && <p className="italic text-neutral-400">/{word.phonetic}/</p>}
                      {word.exampleSentence ? (
                        <>
                          <p className="text-neutral-700">{word.exampleSentence}</p>
                          <p className="text-neutral-400">{word.exampleTranslation}</p>
                        </>
                      ) : (
                        <p className="text-neutral-400">Génération de l&apos;exemple…</p>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void markKnown(word);
                        }}
                        className="mt-1 self-start rounded-full border border-neutral-300 px-4 py-1.5 text-sm text-neutral-600"
                      >
                        ✓ Je connais ce mot
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {quiz && <QuizModal questions={quiz} onClose={() => setQuiz(null)} />}
    </main>
  );
}
