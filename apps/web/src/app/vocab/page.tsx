"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { masteryOf, type Mastery, type SrsState, type UserProfile, type VocabItem } from "@streamlingo/shared";
import { speak } from "@/lib/tts";

type VocabWithSrs = VocabItem & { srs: SrsState };

type Filter = "all" | "due" | "mastered" | "known";
type Sort = "recent" | "alpha" | "seen" | "mastery";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Tous" },
  { key: "due", label: "À réviser" },
  { key: "mastered", label: "Maîtrisés" },
  { key: "known", label: "Connus" },
];

const SORTS: { key: Sort; label: string }[] = [
  { key: "recent", label: "Récents" },
  { key: "alpha", label: "A → Z" },
  { key: "seen", label: "Plus vus" },
  { key: "mastery", label: "Maîtrise" },
];

const MASTERY_ORDER: Record<Mastery, number> = { new: 0, learning: 1, familiar: 2, mastered: 3 };

function badgeFor(item: VocabWithSrs): { label: string; className: string } {
  if (item.known) return { label: "Connu", className: "bg-emerald-50 text-emerald-700" };
  switch (masteryOf(item.srs)) {
    case "mastered":
      return { label: "Maîtrisé", className: "bg-violet-50 text-violet-700" };
    case "familiar":
      return { label: "Acquis", className: "bg-blue-50 text-blue-700" };
    case "learning":
      return { label: "En cours", className: "bg-amber-50 text-amber-700" };
    default:
      return { label: "Nouveau", className: "bg-neutral-100 text-neutral-600" };
  }
}

export default function VocabPage() {
  const [items, setItems] = useState<VocabWithSrs[] | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("recent");
  const [busyId, setBusyId] = useState<string | null>(null);
  // Lazy initializer (not an effect) so this reads once on mount; "due" status
  // is a point-in-time read, refreshed by reloading the page.
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

  const stats = useMemo(() => {
    const all = items ?? [];
    return {
      total: all.length,
      due: all.filter((i) => !i.known && new Date(i.srs.dueAt).getTime() <= now).length,
      mastered: all.filter((i) => !i.known && masteryOf(i.srs) === "mastered").length,
      known: all.filter((i) => i.known).length,
    };
  }, [items, now]);

  const visible = useMemo(() => {
    let list = items ?? [];

    if (filter === "due") list = list.filter((i) => !i.known && new Date(i.srs.dueAt).getTime() <= now);
    else if (filter === "mastered") list = list.filter((i) => !i.known && masteryOf(i.srs) === "mastered");
    else if (filter === "known") list = list.filter((i) => i.known);

    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (i) => i.lemma.toLowerCase().includes(q) || i.translation.toLowerCase().includes(q)
      );
    }

    const sorted = [...list];
    if (sort === "alpha") sorted.sort((a, b) => a.lemma.localeCompare(b.lemma));
    else if (sort === "seen") sorted.sort((a, b) => b.timesEncountered - a.timesEncountered);
    else if (sort === "mastery")
      sorted.sort((a, b) => MASTERY_ORDER[masteryOf(b.srs)] - MASTERY_ORDER[masteryOf(a.srs)]);
    else sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return sorted;
  }, [items, filter, query, sort, now]);

  async function setKnown(item: VocabWithSrs, known: boolean) {
    setBusyId(item.id);
    const prev = items;
    setItems((list) => (list ? list.map((i) => (i.id === item.id ? { ...i, known } : i)) : list));
    try {
      const res = await fetch(`/api/vocab/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ known }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setItems(prev ?? null);
      setError("La mise à jour n’a pas pu être enregistrée.");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(item: VocabWithSrs) {
    if (!window.confirm(`Supprimer « ${item.lemma} » de ta banque ?`)) return;
    setBusyId(item.id);
    const prev = items;
    setItems((list) => (list ? list.filter((i) => i.id !== item.id) : list));
    try {
      const res = await fetch(`/api/vocab/${item.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      setItems(prev ?? null);
      setError("La suppression n’a pas pu être enregistrée.");
    } finally {
      setBusyId(null);
    }
  }

  function exportCsv() {
    const rows = [
      ["mot", "traduction", "exemple", "traduction_exemple", "vu", "connu", "prochaine_revision"],
      ...(items ?? []).map((i) => [
        i.lemma,
        i.translation,
        i.exampleSentence,
        i.exampleTranslation,
        String(i.timesEncountered),
        i.known ? "oui" : "non",
        new Date(i.srs.dueAt).toISOString().slice(0, 10),
      ]),
    ];
    const csv = rows
      .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "streamlingo-vocabulaire.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Banque de vocabulaire</h1>
        <Link
          href="/vocab/review"
          className="rounded-full bg-neutral-900 px-4 py-2 text-sm text-white transition hover:bg-neutral-700"
        >
          Réviser {stats.due > 0 ? `(${stats.due})` : ""}
        </Link>
      </div>

      {items && (
        <div className="grid grid-cols-4 gap-3 text-center">
          <div className="rounded-2xl border border-neutral-200 p-3">
            <p className="text-xl font-bold">{stats.total}</p>
            <p className="text-[11px] text-neutral-500">mots</p>
          </div>
          <div className="rounded-2xl border border-neutral-200 p-3">
            <p className="text-xl font-bold text-amber-600">{stats.due}</p>
            <p className="text-[11px] text-neutral-500">à réviser</p>
          </div>
          <div className="rounded-2xl border border-neutral-200 p-3">
            <p className="text-xl font-bold text-violet-600">{stats.mastered}</p>
            <p className="text-[11px] text-neutral-500">maîtrisés</p>
          </div>
          <div className="rounded-2xl border border-neutral-200 p-3">
            <p className="text-xl font-bold text-emerald-600">{stats.known}</p>
            <p className="text-[11px] text-neutral-500">connus</p>
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
        <>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un mot ou une traduction…"
            className="rounded-full border border-neutral-300 px-4 py-2 text-sm outline-none focus:border-neutral-900"
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                    filter === f.key
                      ? "bg-neutral-900 text-white"
                      : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as Sort)}
                className="rounded-full border border-neutral-200 px-3 py-1.5 text-xs text-neutral-600 outline-none"
              >
                {SORTS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={exportCsv}
                className="rounded-full border border-neutral-200 px-3 py-1.5 text-xs text-neutral-600 transition hover:border-neutral-900"
                title="Exporter en CSV"
              >
                Export CSV
              </button>
            </div>
          </div>
        </>
      )}

      {items && items.length > 0 && visible.length === 0 && (
        <p className="text-sm text-neutral-400">Aucun mot dans cette vue.</p>
      )}

      <ul className="flex flex-col divide-y divide-neutral-100">
        {visible.map((item) => {
          const due = !item.known && new Date(item.srs.dueAt).getTime() <= now;
          const badge = badgeFor(item);
          const busy = busyId === item.id;
          return (
            <li key={item.id} className="flex items-center gap-3 py-3">
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
                  {item.lemma}{" "}
                  <span className="font-normal text-neutral-400">— {item.translation}</span>
                </p>
                <p className="truncate text-xs text-neutral-500">{item.exampleSentence}</p>
                <div className="mt-1 flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${badge.className}`}>
                    {badge.label}
                  </span>
                  <span className="text-[11px] text-neutral-400">Vu {item.timesEncountered}×</span>
                  {!item.known && (
                    <span className={`text-[11px] ${due ? "font-medium text-amber-600" : "text-neutral-400"}`}>
                      {due ? "À réviser" : new Date(item.srs.dueAt).toLocaleDateString("fr-FR")}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setKnown(item, !item.known)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition disabled:opacity-40 ${
                    item.known
                      ? "border-neutral-200 text-neutral-500 hover:border-neutral-900"
                      : "border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                  }`}
                  title={item.known ? "Remettre dans les révisions" : "Je connais ce mot"}
                >
                  {item.known ? "Revoir" : "Connaître ✓"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => remove(item)}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-300 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                  title="Supprimer ce mot"
                >
                  🗑
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
