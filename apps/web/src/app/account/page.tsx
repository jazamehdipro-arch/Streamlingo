"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CEFR_LEVELS, LEVEL_PROFILES, type CefrLevel, type UserProfile } from "@streamlingo/shared";
import BillingPanel from "@/components/BillingPanel";
import { getBrowserSupabase } from "@/lib/supabase";
import { syncSessionCookie } from "@/lib/authClient";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "it", label: "Italiano" },
  { code: "pt", label: "Português" },
];

export default function AccountPage() {
  const router = useRouter();

  const [email, setEmail] = useState<string | null>(null);
  const [memberSince, setMemberSince] = useState<string | null>(null);

  const [targetLanguage, setTargetLanguage] = useState("en");
  const [nativeLanguage, setNativeLanguage] = useState("fr");
  const [level, setLevel] = useState<CefrLevel>("A2");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Change password
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMessage, setPwMessage] = useState<string | null>(null);
  const [pwError, setPwError] = useState<string | null>(null);

  // Danger zone
  const [deleting, setDeleting] = useState(false);

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

    getBrowserSupabase()
      .auth.getUser()
      .then(({ data }) => {
        setEmail(data.user?.email ?? null);
        setMemberSince(data.user?.created_at ?? null);
      })
      .catch(() => {});
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

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwMessage(null);
    setPwError(null);
    if (newPassword.length < 6) {
      setPwError("Le mot de passe doit faire au moins 6 caractères.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError("Les deux mots de passe ne correspondent pas.");
      return;
    }
    setPwSaving(true);
    try {
      const { error: updateError } = await getBrowserSupabase().auth.updateUser({
        password: newPassword,
      });
      if (updateError) throw new Error(updateError.message);
      setNewPassword("");
      setConfirmPassword("");
      setPwMessage("Mot de passe mis à jour ✓");
    } catch (err) {
      setPwError(err instanceof Error ? err.message : "Impossible de changer le mot de passe");
    } finally {
      setPwSaving(false);
    }
  }

  async function signOut() {
    try {
      await getBrowserSupabase().auth.signOut();
      syncSessionCookie(null);
    } finally {
      router.push("/");
    }
  }

  async function deleteAccount() {
    const sure = window.confirm(
      "Supprimer définitivement ton compte ? Ton vocabulaire, tes révisions et ton abonnement seront effacés. Cette action est irréversible."
    );
    if (!sure) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/account", { method: "DELETE" });
      if (!res.ok) throw new Error();
      await getBrowserSupabase().auth.signOut();
      syncSessionCookie(null);
      router.push("/");
    } catch {
      setDeleting(false);
      setError("La suppression a échoué — réessaie ou contacte le support.");
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
    <main className="min-h-screen px-6 py-10">
      <div className="mx-auto flex max-w-md flex-col gap-8">
        {/* Identity */}
        <div>
          <h1 className="text-xl font-semibold">Mon compte</h1>
          {email && <p className="mt-1 text-sm text-neutral-500">{email}</p>}
          {memberSince && (
            <p className="text-xs text-neutral-400">
              Membre depuis le {new Date(memberSince).toLocaleDateString("fr-FR")}
            </p>
          )}
        </div>

        {/* Learning settings */}
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-medium text-neutral-900">Apprentissage</h2>

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
                  À ce niveau :{" "}
                  {level === "A1" || level === "A2" ? "beaucoup" : level === "B1" ? "un bon nombre" : "peu"} de
                  mots traduits{LEVEL_PROFILES[level].cloze === "none" ? "" : ", sous-titres à trous"}, quiz{" "}
                  {LEVEL_PROFILES[level].quizLanguage === "native" ? "en français" : "en langue cible"}.
                </p>
              </div>
            </fieldset>

            <button
              type="submit"
              disabled={saving}
              className="self-start rounded-md bg-neutral-900 px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? "Enregistrement…" : saved ? "Enregistré ✓" : "Enregistrer"}
            </button>
          </form>
        </section>

        {/* Security */}
        <section className="flex flex-col gap-3 border-t border-neutral-100 pt-6">
          <div>
            <h2 className="text-sm font-medium text-neutral-900">Changer de mot de passe</h2>
            <p className="text-xs text-neutral-500">Au moins 6 caractères.</p>
          </div>

          {pwError && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{pwError}</p>
          )}
          {pwMessage && (
            <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {pwMessage}
            </p>
          )}

          <form onSubmit={changePassword} className="flex flex-col gap-3">
            <input
              type="password"
              value={newPassword}
              onChange={(e) => {
                setNewPassword(e.target.value);
                setPwMessage(null);
              }}
              placeholder="Nouveau mot de passe"
              autoComplete="new-password"
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setPwMessage(null);
              }}
              placeholder="Confirme le nouveau mot de passe"
              autoComplete="new-password"
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
            />
            <button
              type="submit"
              disabled={pwSaving || newPassword.length === 0}
              className="self-start rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition hover:border-neutral-900 disabled:opacity-50"
            >
              {pwSaving ? "Mise à jour…" : "Mettre à jour le mot de passe"}
            </button>
          </form>
        </section>

        {/* Links */}
        <section className="flex flex-col gap-2 border-t border-neutral-100 pt-6 text-sm">
          <Link
            href="/connect-extension"
            className="flex items-center justify-between text-neutral-700 hover:text-neutral-900"
          >
            <span>Connecter l’extension</span>
            <span className="text-neutral-400">→</span>
          </Link>
          <button
            type="button"
            onClick={signOut}
            className="flex items-center justify-between text-left text-neutral-700 hover:text-neutral-900"
          >
            <span>Se déconnecter</span>
            <span className="text-neutral-400">→</span>
          </button>
        </section>
      </div>

      {/* Subscription */}
      <section className="mx-auto mt-10 max-w-3xl border-t border-neutral-100 pt-10">
        <Suspense fallback={<div />}>
          <BillingPanel />
        </Suspense>
      </section>

      {/* Danger zone */}
      <section className="mx-auto mt-10 flex max-w-md flex-col gap-3 rounded-2xl border border-red-100 bg-red-50/40 p-5">
        <div>
          <h2 className="text-sm font-medium text-red-700">Supprimer mon compte</h2>
          <p className="text-xs text-neutral-500">
            Efface définitivement ton compte, ton vocabulaire, tes révisions et ton abonnement. Irréversible.
          </p>
        </div>
        <button
          type="button"
          onClick={deleteAccount}
          disabled={deleting}
          className="self-start rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-100 disabled:opacity-50"
        >
          {deleting ? "Suppression…" : "Supprimer définitivement mon compte"}
        </button>
      </section>

      {/* Footer */}
      <footer className="mx-auto mt-10 max-w-md text-center text-xs text-neutral-400">
        <div className="flex justify-center gap-3">
          <Link href="/terms" className="underline">
            CGU
          </Link>
          <Link href="/privacy" className="underline">
            Confidentialité
          </Link>
          <a href="mailto:jazamehdi.pro@gmail.com" className="underline">
            Contact
          </a>
        </div>
        <p className="mt-2">StreamLingo</p>
      </footer>
    </main>
  );
}
