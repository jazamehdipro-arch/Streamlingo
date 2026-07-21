"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getBrowserSupabase } from "@/lib/supabase";
import { syncSessionCookie } from "@/lib/authClient";

type Status = "checking" | "ready" | "invalid";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // Supabase parses the recovery token from the URL hash and opens a session.
    // Wait for it (getSession or the PASSWORD_RECOVERY event) before allowing a
    // reset; if none appears, the link is invalid or expired.
    const supabase = getBrowserSupabase();

    supabase.auth.getSession().then(({ data }) => {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (data.session) setStatus("ready");
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) setStatus("ready");
    });

    const timeout = setTimeout(() => {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus((s) => (s === "checking" ? "invalid" : s));
    }, 4000);

    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("Le mot de passe doit faire au moins 6 caractères.");
      return;
    }
    if (password !== confirm) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }
    setLoading(true);
    try {
      const supabase = getBrowserSupabase();
      const { data, error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      if (data.user) {
        const { data: sessionData } = await supabase.auth.getSession();
        syncSessionCookie(sessionData.session);
      }
      setDone(true);
      setTimeout(() => router.push("/watch"), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de réinitialiser le mot de passe");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <div>
        <h1 className="text-xl font-semibold">Nouveau mot de passe</h1>
        <p className="text-sm text-neutral-500">Choisis un nouveau mot de passe pour ton compte.</p>
      </div>

      {status === "checking" && <p className="text-sm text-neutral-500">Vérification du lien…</p>}

      {status === "invalid" && (
        <div className="flex flex-col gap-3">
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            Ce lien de réinitialisation est invalide ou a expiré.
          </p>
          <Link
            href="/login"
            className="text-center text-sm text-neutral-500 underline-offset-2 hover:text-neutral-900 hover:underline"
          >
            ← Redemander un lien
          </Link>
        </div>
      )}

      {done && (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Mot de passe mis à jour ✓ — redirection…
        </p>
      )}

      {status === "ready" && !done && (
        <>
          {error && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}
          <form onSubmit={submit} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1 text-sm">
              Nouveau mot de passe
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                className="rounded-md border border-neutral-300 px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Confirme le mot de passe
              <input
                type="password"
                required
                minLength={6}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                className="rounded-md border border-neutral-300 px-3 py-2"
              />
            </label>
            <button
              type="submit"
              disabled={loading}
              className="rounded-md bg-neutral-900 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {loading ? "…" : "Enregistrer le nouveau mot de passe"}
            </button>
          </form>
        </>
      )}
    </main>
  );
}
