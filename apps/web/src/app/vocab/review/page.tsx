"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ReviewQuality, SrsState, VocabItem } from "@streamlingo/shared";

type VocabWithSrs = VocabItem & { srs: SrsState };

const QUALITY_BUTTONS: { label: string; quality: ReviewQuality; className: string }[] = [
  { label: "Encore", quality: 1, className: "border-red-300 text-red-700 hover:bg-red-50" },
  { label: "Difficile", quality: 3, className: "border-amber-300 text-amber-700 hover:bg-amber-50" },
  { label: "Bien", quality: 4, className: "border-green-300 text-green-700 hover:bg-green-50" },
  { label: "Facile", quality: 5, className: "border-emerald-400 text-emerald-800 hover:bg-emerald-50" },
];

export default function VocabReviewPage() {
  const [queue, setQueue] = useState<VocabWithSrs[] | null>(null);
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
  }, []);

  const current = queue?.[position] ?? null;

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
        <p className="text-sm text-neutral-500">Rien à réviser pour le moment — beau travail.</p>
      )}

      {queue && current && (
        <div className="flex w-full flex-col gap-6">
          <p className="text-xs uppercase tracking-wide text-neutral-400">
            {position + 1} / {queue.length}
          </p>

          <div
            className="flex min-h-48 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-neutral-200 p-8 shadow-sm"
            onClick={() => setRevealed(true)}
          >
            <p className="text-2xl font-semibold">{current.lemma}</p>
            {revealed && (
              <div className="flex flex-col gap-2">
                <p className="text-neutral-600">{current.translation}</p>
                {current.phonetic && <p className="text-sm italic text-neutral-400">/{current.phonetic}/</p>}
                <p className="text-sm text-neutral-500">{current.exampleSentence}</p>
                <p className="text-xs text-neutral-400">{current.exampleTranslation}</p>
              </div>
            )}
            {!revealed && <p className="text-xs text-neutral-400">Touche pour révéler</p>}
          </div>

          {revealed && (
            <div className="grid grid-cols-4 gap-2">
              {QUALITY_BUTTONS.map((btn) => (
                <button
                  key={btn.label}
                  type="button"
                  disabled={submitting}
                  onClick={() => review(btn.quality)}
                  className={`rounded-md border py-2 text-sm font-medium disabled:opacity-50 ${btn.className}`}
                >
                  {btn.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {queue && !current && queue.length > 0 && (
        <p className="text-sm text-neutral-500">Révision terminée pour aujourd’hui.</p>
      )}
    </main>
  );
}
