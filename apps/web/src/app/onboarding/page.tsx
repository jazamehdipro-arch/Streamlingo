"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CEFR_LEVELS, LEVEL_PROFILES, type CefrLevel } from "@streamlingo/shared";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "it", label: "Italiano" },
  { code: "pt", label: "Português" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [targetLanguage, setTargetLanguage] = useState("en");
  const [nativeLanguage, setNativeLanguage] = useState("fr");
  const [level, setLevel] = useState<CefrLevel>("A2");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetLanguage, nativeLanguage, level }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Échec de la requête (${res.status})`);
      }
      router.push("/learn");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6">
      <div>
        <h1 className="text-xl font-semibold">Configure ton profil d’apprentissage</h1>
        <p className="text-sm text-neutral-500">
          Ton niveau détermine combien de mots sont traduits dans l’encart et la difficulté des quiz.
        </p>
      </div>

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Langue cible (celle que tu apprends)
          <select
            value={targetLanguage}
            onChange={(e) => setTargetLanguage(e.target.value)}
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
            onChange={(e) => setNativeLanguage(e.target.value)}
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
                onClick={() => setLevel(l)}
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
          disabled={loading}
          className="rounded-md bg-neutral-900 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? "Enregistrement…" : "Continuer"}
        </button>
      </form>
    </main>
  );
}
