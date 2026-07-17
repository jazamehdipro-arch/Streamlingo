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

  const playerRef = useRef<YTPlayer | null>(null);
  const playerBoxRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef<{
    sourceId: string | null;
    segments: LocalSegment[];
    analyzed: Map<number, AnalyzedSegment>;
    posting: Set<number>;
    shownKeys: Set<string>;
    lastSegment: number;
  }>({ sourceId: null, segments: [], analyzed: new Map(), posting: new Set(), shownKeys: new Set(), lastSegment: -1 });

  useEffect(() => {
    fetch("/api/profile")
      .then(async (res) => {
        if (!res.ok) throw new Error(`Impossible de charger le profil (${res.status})`);
        return res.json();
      })
      .then((data: UserProfile | null) => {
        if (!data) {
          router.replace("/onboarding");
          return;
        }
        setProfile(data);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Impossible de charger le profil"));
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

    if (segmentIndex === -1) return;
    const analyzed = st.analyzed.get(segmentIndex);
    if (!analyzed) return;

    const FRESHNESS_SECONDS = 5;
    for (const cue of analyzed.keywordCues) {
      const key = `${segmentIndex}:${cue.lemma}:${cue.startSeconds}`;
      if (st.shownKeys.has(key)) continue;
      if (t >= cue.startSeconds) {
        st.shownKeys.add(key);
        if (t - cue.startSeconds <= FRESHNESS_SECONDS) {
          const id = `${key}:${Date.now()}`;
          setFeed((prev) => [{ ...cue, id }, ...prev].slice(0, 60));
        }
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
    if (!profile) return;

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
            ? " Astuce : regarde cette vidéo une fois sur ordinateur avec l'extension StreamLingo — elle deviendra ensuite disponible ici, mots et timings inclus."
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
        playerVars: { playsinline: 1, rel: 0 },
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
          <div className="sticky top-14 z-30 -mx-4 sm:mx-0">
            <div className="aspect-video w-full overflow-hidden bg-black sm:rounded-2xl">
              <div ref={playerBoxRef} className="h-full w-full" />
            </div>
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
