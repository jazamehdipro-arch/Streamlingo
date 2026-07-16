"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ReviewQuality, SrsState, UserProfile, VocabItem } from "@streamlingo/shared";
import { speak } from "@/lib/tts";

type VocabWithSrs = VocabItem & { srs: SrsState };

const QUALITY_BUTTONS: { label: string; quality: ReviewQuality; className: string }[] = [
  { label: "Encore", quality: 1, className: "border-red-300 text-red-700 hover:bg-red-50" },
  { label: "Difficile", quality: 3, className: "border-amber-300 text-amber-700 hover:bg-amber-50" },
  { label: "Bien", quality: 4, className: "border-green-300 text-green-700 hover:bg-green-50" },
  { label: "Facile", quality: 5, className: "border-emerald-400 text-emerald-800 hover:bg-emerald-50" },
];

export default function VocabReviewPage() {
  const [queue, setQueue] = useState<VocabWithSrs[] | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [position, setPosition] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

  async function ensureExample(item: VocabWithSrs) {
    if (item.exampleSentence) return;
    try {
      const res = await fetch("/api/vocab/example", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lemma: item.lemma, word: item.lemma, translation: item.translation }),
      });
      if (!res.ok) return;
      const example: { exampleSentence: string; exampleTranslation: string } = await res.json();
      setQueue((prev) =>
        prev ? prev.map((q) => (q.id === item.id ? { ...q, ...example } : q)) : prev
      );
    } catch {
      // Bonus uniquement.
    }
  }
  const done = queue !== null && queue.length > 0 && position >= queue.length;

  async function review(quality: ReviewQuality) {
    if (!current) return;
    setSubmitting(true);
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
  }

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
            <div
              className={`flip-card ${revealed ? "is-flipped" : ""}`}
              onClick={() => {
                setRevealed(true);
                if (current) void ensureExample(current);
              }}
            >
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
                <p className="text-xs text-neutral-400">Touche la carte pour révéler</p>
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
            <div className="grid grid-cols-4 gap-2">
              {QUALITY_BUTTONS.map((btn) => (
                <button
                  key={btn.label}
                  type="button"
                  disabled={submitting}
                  onClick={() => review(btn.quality)}
                  className={`rounded-xl border py-2.5 text-sm font-medium transition disabled:opacity-50 ${btn.className}`}
                >
                  {btn.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {done && (
        <div className="flex flex-col items-center gap-3">
          <span className="text-4xl">🏆</span>
          <p className="text-sm text-neutral-500">
            Session terminée — {queue?.length} mot{(queue?.length ?? 0) > 1 ? "s" : ""} révisé
            {(queue?.length ?? 0) > 1 ? "s" : ""}.
          </p>
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
