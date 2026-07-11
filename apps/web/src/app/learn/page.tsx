"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { levelIndex, type ClozeItem, type ContentSource, type KeywordCue, type QuizQuestion, type UserProfile } from "@streamlingo/shared";
import { estimateSegmentTimings, sliceTranscriptIntoSegments, type TimedDraftSegment } from "@/lib/segmentText";
import OverlayBox from "@/components/OverlayBox";
import QuizModal from "@/components/QuizModal";
import ReplayModal from "@/components/ReplayModal";

interface LearnSegment extends TimedDraftSegment {
  segmentId: string | null;
  analyzed: boolean;
  analyzing: boolean;
  keywordCues: KeywordCue[];
}

export default function LearnPage() {
  const router = useRouter();

  const [profile, setProfile] = useState<UserProfile | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Setup form
  const [title, setTitle] = useState("");
  const [transcriptInput, setTranscriptInput] = useState("");
  const [transcriptUrl, setTranscriptUrl] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [fetchingTranscript, setFetchingTranscript] = useState(false);
  const [starting, setStarting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Session state
  const [source, setSource] = useState<ContentSource | null>(null);
  const [segments, setSegments] = useState<LearnSegment[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [activeQuiz, setActiveQuiz] = useState<{ segmentIndex: number; questions: QuizQuestion[] } | null>(null);
  const [quizLoading, setQuizLoading] = useState(false);
  const [clozeBySegment, setClozeBySegment] = useState<Record<number, ClozeItem>>({});
  const [clozeVisible, setClozeVisible] = useState<number | null>(null);
  const [clozeLoading, setClozeLoading] = useState(false);
  const [replay, setReplay] = useState<{ transcript: string; translation: string } | null>(null);
  const [replayLoading, setReplayLoading] = useState(false);

  useEffect(() => {
    fetch("/api/profile")
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load profile (${res.status})`);
        return res.json();
      })
      .then((data: UserProfile | null) => {
        if (!data) {
          router.replace("/onboarding");
          return;
        }
        setProfile(data);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Impossible de charger le profil"));
  }, [router]);

  const audioSrc = source ? audioUrl.trim() : "";

  // Elapsed-time simulation when there's no real audio to drive playback.
  useEffect(() => {
    if (audioSrc || !playing) {
      if (tickRef.current) clearInterval(tickRef.current);
      return;
    }
    tickRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [playing, audioSrc]);

  const currentSegmentIndex = segments.findIndex(
    (s) => elapsed >= s.startSeconds && elapsed < s.endSeconds
  );
  const activeIndex = currentSegmentIndex >= 0 ? currentSegmentIndex : segments.length - 1;
  const currentSegment = activeIndex >= 0 ? segments[activeIndex] : null;

  async function analyzeSegment(index: number) {
    const segment = segments[index];
    if (!source || !segment) return;

    setSegments((prev) => prev.map((s, i) => (i === index ? { ...s, analyzing: true } : s)));

    try {
      const res = await fetch(`/api/sources/${source.id}/segments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          index: segment.index,
          startSeconds: segment.startSeconds,
          endSeconds: segment.endSeconds,
          transcript: segment.text,
        }),
      });
      if (!res.ok) throw new Error(`Segment analysis failed (${res.status})`);
      const body: { segment: { id: string }; keywordCues: KeywordCue[] } = await res.json();

      setSegments((prev) =>
        prev.map((s, i) =>
          i === index
            ? { ...s, segmentId: body.segment.id, keywordCues: body.keywordCues, analyzed: true, analyzing: false }
            : s
        )
      );
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Échec de l’analyse du passage");
      setSegments((prev) => prev.map((s, i) => (i === index ? { ...s, analyzing: false } : s)));
    }
  }

  useEffect(() => {
    if (!currentSegment || currentSegment.analyzed || currentSegment.analyzing || !source) return;
    // analyzeSegment's setState calls happen after its network round-trip,
    // not synchronously in this effect body — it's the standard
    // fetch-on-dependency-change pattern, not a cascading-render loop.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void analyzeSegment(activeIndex);
    // Deliberately re-runs only on activeIndex/source, not on every
    // `segments` mutation analyzeSegment itself triggers (that would loop).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, source]);

  async function loadTranscriptFromUrl() {
    if (!transcriptUrl) return;
    setFetchingTranscript(true);
    setFormError(null);
    try {
      const res = await fetch(transcriptUrl);
      if (!res.ok) throw new Error(`Could not fetch transcript (${res.status})`);
      const text = await res.text();
      setTranscriptInput(text);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Impossible de récupérer la transcription depuis l’URL");
    } finally {
      setFetchingTranscript(false);
    }
  }

  async function startSession(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const transcript = transcriptInput.trim();
    if (!transcript) {
      setFormError("Colle d’abord une transcription.");
      return;
    }

    setStarting(true);
    try {
      const res = await fetch("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "podcast", title: title || "Podcast sans titre" }),
      });
      if (!res.ok) throw new Error(`Could not create source (${res.status})`);
      const createdSource: ContentSource = await res.json();

      const draft = sliceTranscriptIntoSegments(transcript);
      const timed = estimateSegmentTimings(draft);
      const learnSegments: LearnSegment[] = timed.map((s) => ({
        ...s,
        segmentId: null,
        analyzed: false,
        analyzing: false,
        keywordCues: [],
      }));

      setSource(createdSource);
      setSegments(learnSegments);
      setElapsed(0);
      setPlaying(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Une erreur est survenue");
    } finally {
      setStarting(false);
    }
  }

  async function openQuiz(index: number) {
    const segment = segments[index];
    if (!segment?.segmentId) return;
    setQuizLoading(true);
    try {
      const res = await fetch(`/api/segments/${segment.segmentId}/quiz`, { method: "POST" });
      if (!res.ok) throw new Error(`Could not load quiz (${res.status})`);
      const body: { questions: QuizQuestion[] } = await res.json();
      setActiveQuiz({ segmentIndex: index, questions: body.questions });
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Impossible de charger le quiz");
    } finally {
      setQuizLoading(false);
    }
  }

  async function toggleCloze(index: number) {
    if (clozeVisible === index) {
      setClozeVisible(null);
      return;
    }
    const segment = segments[index];
    if (!segment?.segmentId) return;

    if (clozeBySegment[index]) {
      setClozeVisible(index);
      return;
    }

    setClozeLoading(true);
    try {
      const res = await fetch(`/api/segments/${segment.segmentId}/cloze`, { method: "POST" });
      if (!res.ok) throw new Error(`Could not load cloze exercise (${res.status})`);
      const body: ClozeItem = await res.json();
      setClozeBySegment((prev) => ({ ...prev, [index]: body }));
      setClozeVisible(index);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Impossible de charger l’exercice à trous");
    } finally {
      setClozeLoading(false);
    }
  }

  async function openReplay(index: number) {
    const segment = segments[index];
    if (!segment?.segmentId) return;
    setReplayLoading(true);
    try {
      const res = await fetch(`/api/segments/${segment.segmentId}/replay`, { method: "POST" });
      if (!res.ok) throw new Error(`Could not load replay (${res.status})`);
      const body: { transcript: string; translation: string } = await res.json();
      setReplay(body);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Impossible de charger la réécoute");
    } finally {
      setReplayLoading(false);
    }
  }

  if (loadError && !profile) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6 text-center">
        <p className="text-sm text-red-600">{loadError}</p>
      </main>
    );
  }

  if (profile === undefined) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-neutral-500">Chargement…</p>
      </main>
    );
  }

  const overlayPosition = profile?.overlayPosition ?? "top-right";
  const canUseCloze = profile ? levelIndex(profile.level) >= levelIndex("B1") : false;

  const visibleCues = currentSegment
    ? currentSegment.keywordCues.filter((c) => c.startSeconds <= elapsed)
    : [];

  if (!source) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 px-6 py-12">
        <div>
          <h1 className="text-xl font-semibold">Nouvelle session podcast</h1>
          <p className="text-sm text-neutral-500">
            Colle une transcription (ou un lien vers celle-ci) et, si tu l’as, l’URL de l’audio.
          </p>
        </div>

        {formError && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {formError}
          </p>
        )}

        <form onSubmit={startSession} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            Titre
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Titre de l’épisode"
              className="rounded-md border border-neutral-300 px-3 py-2"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            URL audio (optionnel — active la vraie lecture)
            <input
              value={audioUrl}
              onChange={(e) => setAudioUrl(e.target.value)}
              placeholder="https://…/episode.mp3"
              className="rounded-md border border-neutral-300 px-3 py-2"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            URL de la transcription (optionnel)
            <div className="flex gap-2">
              <input
                value={transcriptUrl}
                onChange={(e) => setTranscriptUrl(e.target.value)}
                placeholder="https://…/transcript.txt"
                className="flex-1 rounded-md border border-neutral-300 px-3 py-2"
              />
              <button
                type="button"
                onClick={loadTranscriptFromUrl}
                disabled={!transcriptUrl || fetchingTranscript}
                className="rounded-md border border-neutral-300 px-3 py-2 text-sm disabled:opacity-50"
              >
                {fetchingTranscript ? "…" : "Récupérer"}
              </button>
            </div>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Transcription
            <textarea
              value={transcriptInput}
              onChange={(e) => setTranscriptInput(e.target.value)}
              rows={10}
              placeholder="Colle la transcription complète ici…"
              className="rounded-md border border-neutral-300 px-3 py-2 font-mono text-xs"
            />
          </label>

          <button
            type="submit"
            disabled={starting}
            className="rounded-md bg-neutral-900 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {starting ? "Démarrage…" : "Démarrer la session"}
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-10">
      {loadError && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {loadError}
        </p>
      )}

      <OverlayBox cues={visibleCues} position={overlayPosition} />

      <div>
        <h1 className="text-lg font-semibold">{source.title}</h1>
        <p className="text-sm text-neutral-500">
          Segment {activeIndex + 1} / {segments.length} · {formatTime(elapsed)}
        </p>
      </div>

      {audioSrc ? (
        <audio
          ref={audioRef}
          src={audioSrc}
          controls
          className="w-full"
          onTimeUpdate={(e) => setElapsed(e.currentTarget.currentTime)}
        />
      ) : (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
          >
            {playing ? "Pause" : "Lecture"}
          </button>
          <p className="text-xs text-neutral-400">
            Pas d’URL audio — lecture simulée par le temps écoulé.
          </p>
        </div>
      )}

      <section className="rounded-lg border border-neutral-200 p-4">
        <p className="mb-2 text-xs uppercase tracking-wide text-neutral-400">Passage en cours</p>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-700">
          {currentSegment?.text}
        </p>
        {currentSegment?.analyzing && (
          <p className="mt-2 text-xs text-neutral-400">Analyse des mots-clés…</p>
        )}
      </section>

      {currentSegment && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!currentSegment.analyzed || quizLoading}
            onClick={() => openQuiz(activeIndex)}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm disabled:opacity-50"
          >
            Se tester sur ce passage
          </button>
          {canUseCloze && (
            <button
              type="button"
              disabled={!currentSegment.analyzed || clozeLoading}
              onClick={() => toggleCloze(activeIndex)}
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm disabled:opacity-50"
            >
              {clozeVisible === activeIndex ? "Masquer les sous-titres à trous" : "Sous-titres à trous"}
            </button>
          )}
          <button
            type="button"
            disabled={!currentSegment.analyzed || replayLoading}
            onClick={() => openReplay(activeIndex)}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm disabled:opacity-50"
          >
            Réécoute active
          </button>
        </div>
      )}

      {clozeVisible !== null && clozeBySegment[clozeVisible] && (
        <section className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
          <p className="mb-2 text-xs uppercase tracking-wide text-neutral-400">Sous-titres à trous</p>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">
            {clozeBySegment[clozeVisible].transcriptWithBlanks}
          </p>
        </section>
      )}

      {activeQuiz && (
        <QuizModal questions={activeQuiz.questions} onClose={() => setActiveQuiz(null)} />
      )}

      {replay && (
        <ReplayModal
          transcript={replay.transcript}
          translation={replay.translation}
          onClose={() => setReplay(null)}
        />
      )}
    </main>
  );
}

function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
