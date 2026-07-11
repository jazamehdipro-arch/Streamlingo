"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { SrsState, VocabItem } from "@streamlingo/shared";

type VocabWithSrs = VocabItem & { srs: SrsState };

export default function VocabPage() {
  const [items, setItems] = useState<VocabWithSrs[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Lazy initializer (not an effect) so this reads once on mount without
  // tripping react-hooks/set-state-in-effect; "due" status is a point-in-time
  // read anyway, refreshed by reloading the page.
  const [now] = useState(() => Date.now());

  useEffect(() => {
    fetch("/api/vocab")
      .then(async (res) => {
        if (!res.ok) throw new Error(`Impossible de charger le vocabulaire (${res.status})`);
        return res.json();
      })
      .then((body: { items: VocabWithSrs[] }) => setItems(body.items))
      .catch((err) => setError(err instanceof Error ? err.message : "Impossible de charger le vocabulaire"));
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Banque de vocabulaire</h1>
        <Link href="/vocab/review" className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white">
          Réviser les flashcards
        </Link>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {items === null && !error && <p className="text-sm text-neutral-500">Chargement…</p>}

      {items && items.length === 0 && (
        <p className="text-sm text-neutral-500">
          Aucun mot pour l’instant — les mots rencontrés pendant tes sessions apparaîtront ici automatiquement.
        </p>
      )}

      <ul className="flex flex-col divide-y divide-neutral-200">
        {items?.map((item) => {
          const due = new Date(item.srs.dueAt).getTime() <= now;
          return (
            <li key={item.id} className="flex items-center justify-between py-3">
              <div>
                <p className="font-medium">
                  {item.lemma} <span className="text-neutral-400">— {item.translation}</span>
                </p>
                <p className="text-xs text-neutral-500">{item.exampleSentence}</p>
              </div>
              <div className="flex flex-col items-end text-xs text-neutral-400">
                <span>Vu {item.timesEncountered}×</span>
                <span className={due ? "font-medium text-neutral-900" : ""}>
                  {due ? "À réviser" : `À réviser le ${new Date(item.srs.dueAt).toLocaleDateString("fr-FR")}`}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
