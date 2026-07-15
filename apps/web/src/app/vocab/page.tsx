"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { SrsState, UserProfile, VocabItem } from "@streamlingo/shared";
import { speak } from "@/lib/tts";

type VocabWithSrs = VocabItem & { srs: SrsState };

export default function VocabPage() {
  const [items, setItems] = useState<VocabWithSrs[] | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
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
    fetch("/api/profile")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: UserProfile | null) => setProfile(data))
      .catch(() => {});
  }, []);

  const dueCount = useMemo(
    () => (items ?? []).filter((item) => new Date(item.srs.dueAt).getTime() <= now).length,
    [items, now]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items ?? [];
    return (items ?? []).filter(
      (item) =>
        item.lemma.toLowerCase().includes(q) || item.translation.toLowerCase().includes(q)
    );
  }, [items, query]);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Banque de vocabulaire</h1>
        <Link
          href="/vocab/review"
          className="rounded-full bg-neutral-900 px-4 py-2 text-sm text-white transition hover:bg-neutral-700"
        >
          Réviser {dueCount > 0 ? `(${dueCount})` : ""}
        </Link>
      </div>

      {items && (
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-2xl border border-neutral-200 p-4">
            <p className="text-2xl font-bold">{items.length}</p>
            <p className="text-xs text-neutral-500">mots rencontrés</p>
          </div>
          <div className="rounded-2xl border border-neutral-200 p-4">
            <p className="text-2xl font-bold">{dueCount}</p>
            <p className="text-xs text-neutral-500">à réviser maintenant</p>
          </div>
          <div className="rounded-2xl border border-neutral-200 p-4">
            <p className="text-2xl font-bold">
              {items.filter((i) => i.timesEncountered > 1).length}
            </p>
            <p className="text-xs text-neutral-500">revus plusieurs fois</p>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {items === null && !error && <p className="text-sm text-neutral-500">Chargement…</p>}

      {items && items.length === 0 && (
        <p className="text-sm text-neutral-500">
          Aucun mot pour l’instant — les mots rencontrés pendant tes sessions apparaîtront ici
          automatiquement.
        </p>
      )}

      {items && items.length > 0 && (
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un mot ou une traduction…"
          className="rounded-full border border-neutral-300 px-4 py-2 text-sm outline-none focus:border-neutral-900"
        />
      )}

      <ul className="flex flex-col divide-y divide-neutral-100">
        {filtered.map((item) => {
          const due = new Date(item.srs.dueAt).getTime() <= now;
          return (
            <li key={item.id} className="flex items-center justify-between gap-3 py-3">
              <button
                type="button"
                onClick={() => speak(item.lemma, profile?.targetLanguage ?? "en")}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-neutral-200 text-sm transition hover:border-neutral-900"
                title="Écouter la prononciation"
              >
                🔊
              </button>
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {item.lemma} <span className="font-normal text-neutral-400">— {item.translation}</span>
                </p>
                <p className="truncate text-xs text-neutral-500">{item.exampleSentence}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end text-xs text-neutral-400">
                <span>Vu {item.timesEncountered}×</span>
                <span className={due ? "font-medium text-amber-600" : ""}>
                  {due ? "À réviser" : new Date(item.srs.dueAt).toLocaleDateString("fr-FR")}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
