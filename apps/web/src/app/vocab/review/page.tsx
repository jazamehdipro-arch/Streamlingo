"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  reviewSrsState,
  type ReviewQuality,
  type SrsState,
  type UserProfile,
  type VocabItem,
} from "@streamlingo/shared";
import { speak } from "@/lib/tts";

type VocabWithSrs = VocabItem & { srs: SrsState };

const QUALITY_BUTTONS: { label: string; key: string; quality: ReviewQuality; className: string }[] = [
  { label: "Oublié", key: "1", quality: 1, className: "border-red-300 text-red-700 hover:bg-red-50" },
  { label: "Difficile", key: "2", quality: 3, className: "border-amber-300 text-amber-700 hover:bg-amber-50" },
  { label: "Bien", key: "3", quality: 4, className: "border-green-300 text-green-700 hover:bg-green-50" },
  { label: "Facile", key: "4", quality: 5, className: "border-emerald-400 text-emerald-800 hover:bg-emerald-50" },
];

/** Short human label for the next SM-2 interval, shown on each rating button. */
function formatInterval(days: number): string {
  if (days <= 0) return "< 1 j";
  if (days === 1) return "1 j";
  if (days < 30) return `${days} j`;
  if (days < 365) return `~${Math.round(days / 30)} mois`;
  return `~${Math.round(days / 365)} an`;
}

interface Summary {
  again: number;
  hard: number;
  good: number;
  easy: number;
  known: number;
}

const EMPTY_SUMMARY: Summary = { again: 0, hard: 0, good: 0, easy: 0, known: 0 };

export default function VocabReviewPage() {
  const [queue, setQueue] = useState<VocabWithSrs[] | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [position, setPosition] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [summary, setSummary] = useState<Summary>(EMPTY_SUMMARY);

  useEffect(() => {
    fetch("/api/vocab?due=true")
      .then(async (res) => {
        if (!res.ok) throw new Error(`Impossible de charger la file de révision (${res.status})`);
        return res.json();
      })
      .then((body: { items: VocabWithSrs[] }) => setQueue(body.items))
      .catch((err) => setError(err instanceof Error ? err.message : "Impossible de charger la file de révision"));
    fetch("/api/profile")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: UserProfile | null) => setProfile(data))
      .catch(() => {});
  }, []);

  const current = queue?.[position] ?? null;
  const done = queue !== null && queue.length > 0 && position >= queue.length;
  const reviewedCount = summary.again + summary.hard + summary.good + summary.easy + summary.known;

  const ensureExample = useCallback(async (item: VocabWithSrs) => {
    if (item.exampleSentence) return;
    try {
      const res = await fetch("/api/vocab/example", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lemma: item.lemma, word: item.lemma, translation: item.translation }),
      });
      if (!res.ok) return;
      const example: { exampleSentence: string; exampleTranslation: string } = await res.json();
      setQueue((prev) => (prev ? prev.map((q) => (q.id === item.id ? { ...q, ...example } : q)) : prev));
    } catch {
      // Bonus uniquement.
    }
  }, []);

  const reveal = useCallback(() => {
    setRevealed(true);
    if (current) void ensureExample(current);
  }, [current, ensureExample]);

  const review = useCallback(
    async (quality: ReviewQuality) => {
      if (!current) return;
      setSubmitting(true);
      setSummary((s) => ({
        ...s,
        again: s.again + (quality === 1 ? 1 : 0),
        hard: s.hard + (quality === 3 ? 1 : 0),
        good: s.good + (quality === 4 ? 1 : 0),
        easy: s.easy + (quality === 5 ? 1 : 0),
      }));
      try {
        await fetch(`/api/vocab/${current.id}/review`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quality }),
        });
        setRevealed(false);
        setPosition((p) => p + 1);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Impossible d’enregistrer la révision");
      } finally {
        setSubmitting(false);
      }
    },
    [current]
  );

  const markKnown = useCallback(async () => {
    if (!current) return;
    setSubmitting(true);
    setSummary((s) => ({ ...s, known: s.known + 1 }));
    try {
      await fetch(`/api/vocab/${current.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ known: true }),
      });
      setRevealed(false);
      setPosition((p) => p + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible d’enregistrer");
    } finally {
      setSubmitting(false);
    }
  }, [current]);

  // Keyboard: Space/Enter reveals; 1-4 rate; K marks known.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!current || submitting) return;
      if (!revealed) {
        if (e.code === "Space" || e.code === "Enter") {
          e.preventDefault();
          reveal();
        }
        return;
      }
      const btn = QUALITY_BUTTONS.find((b) => b.key === e.key);
      if (btn) {
        e.preventDefault();
        void review(btn.quality);
      } else if (e.key.toLowerCase() === "k") {
        e.preventDefault();
        void markKnown();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, revealed, submitting, reveal, review, markKnown]);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-6 py-10 text-center">
      <div className="w-full">
        <Link href="/vocab" className="text-sm text-neutral-400 hover:text-neutral-700">
          ← Banque de vocabulaire
        </Link>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {queue === null && !error && <p className="text-sm text-neutral-500">Chargement…</p>}

      {queue && queue.length === 0 && (
        <div className="flex flex-col items-center gap-2">
          <span className="text-4xl">🎉</span>
          <p className="text-sm text-neutral-500">Rien à réviser pour le moment — beau travail.</p>
          <Link
            href="/vocab"
            className="mt-2 rounded-full bg-neutral-900 px-5 py-2.5 text-sm text-white transition hover:bg-neutral-700"
          >
            Retour au vocabulaire
          </Link>
        </div>
      )}

      {queue && current && (
        <div className="flex w-full flex-col gap-5">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
            <div
              className="h-full rounded-full bg-neutral-900 transition-all duration-300"
              style={{ width: `${(position / queue.length) * 100}%` }}
            />
          </div>
          <p className="text-xs uppercase tracking-wide text-neutral-400">
            {position + 1} / {queue.length}
          </p>

          <div className="flip-scene">
            <div className={`flip-card ${revealed ? "is-flipped" : ""}`} onClick={reveal}>
              <div className="flip-face flex min-h-56 cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border border-neutral-200 p-8 shadow-sm">
                <p className="text-3xl font-semibold">{current.lemma}</p>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    speak(current.lemma, profile?.targetLanguage ?? "en");
                  }}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-neutral-200 transition hover:border-neutral-900"
                  title="Écouter"
                >
                  🔊
                </button>
                <p className="text-xs text-neutral-400">Touche la carte ou Espace pour révéler</p>
              </div>
              <div className="flip-face flip-back flex min-h-56 flex-col items-center justify-center gap-3 rounded-2xl border border-neutral-900 bg-neutral-900 p-8 text-white shadow-md">
                <p className="text-2xl font-semibold">{current.translation}</p>
                {current.phonetic && <p className="text-sm italic text-neutral-400">/{current.phonetic}/</p>}
                {current.exampleSentence ? (
                  <>
                    <p className="text-sm text-neutral-300">{current.exampleSentence}</p>
                    <p className="text-xs text-neutral-500">{current.exampleTranslation}</p>
                  </>
                ) : (
                  <p className="text-xs text-neutral-500">Exemple en cours de génération…</p>
                )}
              </div>
            </div>
          </div>

          {revealed && (
            <>
              <p className="text-sm font-medium text-neutral-700">Tu t’en souvenais&nbsp;?</p>
              <div className="grid grid-cols-4 gap-2">
                {QUALITY_BUTTONS.map((btn) => {
                  const projected = reviewSrsState(current.srs, btn.quality, new Date());
                  return (
                    <button
                      key={btn.label}
                      type="button"
                      disabled={submitting}
                      onClick={() => review(btn.quality)}
                      className={`flex flex-col items-center gap-0.5 rounded-xl border py-2 text-sm font-medium transition disabled:opacity-50 ${btn.className}`}
                    >
                      <span>{btn.label}</span>
                      <span className="text-[10px] font-normal opacity-70">
                        {formatInterval(projected.intervalDays)}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] leading-snug text-neutral-400">
                Le délai sous chaque bouton indique quand le mot te sera reproposé. Plus c’était
                facile, plus il revient tard — c’est la répétition espacée.
              </p>
              <button
                type="button"
                disabled={submitting}
                onClick={markKnown}
                className="text-xs text-neutral-400 underline-offset-2 transition hover:text-emerald-700 hover:underline disabled:opacity-50"
              >
                Je connais déjà ce mot — ne plus le réviser
              </button>
              <p className="text-[10px] text-neutral-300">Raccourcis : 1 · 2 · 3 · 4 pour noter, K pour « connu »</p>
            </>
          )}
        </div>
      )}

      {done && (
        <div className="flex w-full flex-col items-center gap-4">
          <span className="text-4xl">🏆</span>
          <p className="text-sm text-neutral-500">
            Session terminée — {reviewedCount} mot{reviewedCount > 1 ? "s" : ""} passé
            {reviewedCount > 1 ? "s" : ""} en revue.
          </p>
          <div className="grid w-full grid-cols-2 gap-2 text-sm">
            <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-red-700">
              À revoir <span className="float-right font-semibold">{summary.again}</span>
            </div>
            <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-amber-700">
              Difficiles <span className="float-right font-semibold">{summary.hard}</span>
            </div>
            <div className="rounded-xl border border-green-100 bg-green-50 px-3 py-2 text-green-700">
              Bien <span className="float-right font-semibold">{summary.good}</span>
            </div>
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-emerald-800">
              Faciles <span className="float-right font-semibold">{summary.easy}</span>
            </div>
            {summary.known > 0 && (
              <div className="col-span-2 rounded-xl border border-neutral-200 px-3 py-2 text-neutral-600">
                Marqués connus <span className="float-right font-semibold">{summary.known}</span>
              </div>
            )}
          </div>
          <Link
            href="/vocab"
            className="rounded-full bg-neutral-900 px-5 py-2.5 text-sm text-white transition hover:bg-neutral-700"
          >
            Retour au vocabulaire
          </Link>
        </div>
      )}
    </main>
  );
}
