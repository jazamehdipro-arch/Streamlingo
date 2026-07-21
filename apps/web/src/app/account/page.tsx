"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CEFR_LEVELS, LEVEL_PROFILES, type CefrLevel, type UserProfile } from "@streamlingo/shared";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "it", label: "Italiano" },
  { code: "pt", label: "Português" },
];

export default function AccountPage() {
  const [targetLanguage, setTargetLanguage] = useState("en");
  const [nativeLanguage, setNativeLanguage] = useState("fr");
  const [level, setLevel] = useState<CefrLevel>("A2");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/profile")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: UserProfile | null) => {
        if (data) {
          setTargetLanguage(data.targetLanguage);
          setNativeLanguage(data.nativeLanguage);
          setLevel(data.level);
        }
      })
      .catch(() => setError("Impossible de charger ton profil"))
      .finally(() => setLoading(false));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetLanguage, nativeLanguage, level }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Échec de l’enregistrement (${res.status})`);
      }
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-neutral-500">Chargement…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-6 py-10">
      <div>
        <h1 className="text-xl font-semibold">Mon compte</h1>
        <p className="text-sm text-neutral-500">
          Change la langue que tu apprends ou ton niveau à tout moment.
        </p>
      </div>

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <form onSubmit={save} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Langue cible (celle que tu apprends)
          <select
            value={targetLanguage}
            onChange={(e) => {
              setTargetLanguage(e.target.value);
              setSaved(false);
            }}
            className="rounded-md border border-neutral-300 px-3 py-2"
          >
            {LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Langue maternelle
          <select
            value={nativeLanguage}
            onChange={(e) => {
              setNativeLanguage(e.target.value);
              setSaved(false);
            }}
            className="rounded-md border border-neutral-300 px-3 py-2"
          >
            {LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.label}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="flex flex-col gap-2 text-sm">
          <legend className="mb-1">Niveau CECR</legend>
          <div className="flex gap-2">
            {CEFR_LEVELS.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => {
                  setLevel(l);
                  setSaved(false);
                }}
                className={`flex-1 rounded-md border py-2 text-sm ${
                  level === l
                    ? "border-neutral-900 bg-neutral-900 text-white"
                    : "border-neutral-300 text-neutral-700"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
          <div className="mt-1 rounded-lg bg-neutral-50 px-3 py-2">
            <p className="font-medium text-neutral-900">{LEVEL_PROFILES[level].persona}</p>
            <p className="mt-0.5 text-xs text-neutral-500">{LEVEL_PROFILES[level].contentTip}</p>
            <p className="mt-1 text-xs text-neutral-400">
              À ce niveau : {level === "A1" || level === "A2" ? "beaucoup" : level === "B1" ? "un bon nombre" : "peu"} de
              mots traduits{LEVEL_PROFILES[level].cloze === "none" ? "" : ", sous-titres à trous"}, quiz{" "}
              {LEVEL_PROFILES[level].quizLanguage === "native" ? "en français" : "en langue cible"}.
            </p>
          </div>
        </fieldset>

        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-neutral-900 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? "Enregistrement…" : saved ? "Enregistré ✓" : "Enregistrer"}
        </button>
      </form>

      <div className="mt-2 flex flex-col gap-2 border-t border-neutral-100 pt-4 text-sm">
        <Link href="/pricing" className="flex items-center justify-between text-neutral-700 hover:text-neutral-900">
          <span>Abonnement & facturation</span>
          <span className="text-neutral-400">→</span>
        </Link>
        <Link
          href="/connect-extension"
          className="flex items-center justify-between text-neutral-700 hover:text-neutral-900"
        >
          <span>Connecter l’extension</span>
          <span className="text-neutral-400">→</span>
        </Link>
      </div>
    </main>
  );
}
