"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserSupabase } from "@/lib/supabase";
import { syncSessionCookie } from "@/lib/authClient";

type Mode = "login" | "register" | "forgot";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const supabase = getBrowserSupabase();

      if (mode === "forgot") {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (resetError) throw resetError;
        setInfo(
          "Si un compte existe pour cet email, un lien de réinitialisation vient d'être envoyé. Vérifie ta boîte mail (et les spams)."
        );
        return;
      }

      const { data, error: authError } =
        mode === "login"
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({ email, password });
      if (authError) throw authError;

      // Supabase's default "confirm email" setting returns no session on
      // sign-up: the account exists but is unusable until the emailed link
      // is clicked. Without this branch the user lands on /onboarding
      // unauthenticated and gets a bare "Unauthorized".
      if (!data.session) {
        setMode("login");
        setInfo(
          "Compte créé ! Vérifie ta boîte mail et clique sur le lien de confirmation, puis connecte-toi ici."
        );
        return;
      }

      syncSessionCookie(data.session);
      router.push("/onboarding");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <div>
        <h1 className="text-xl font-semibold">StreamLingo</h1>
        <p className="text-sm text-neutral-500">
          {mode === "forgot" ? "Réinitialise ton mot de passe." : "Connecte-toi pour continuer."}
        </p>
      </div>

      {mode !== "forgot" && (
        <div className="flex gap-2 rounded-lg bg-neutral-100 p-1 text-sm">
          {(["login", "register"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setError(null);
                setInfo(null);
              }}
              className={`flex-1 rounded-md py-2 transition ${
                mode === m ? "bg-white font-medium shadow-sm" : "text-neutral-500"
              }`}
            >
              {m === "login" ? "Connexion" : "Inscription"}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {info && (
        <p className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          {info}
        </p>
      )}

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
        </label>

        {mode !== "forgot" && (
          <label className="flex flex-col gap-1 text-sm">
            Mot de passe
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-md border border-neutral-300 px-3 py-2"
            />
          </label>
        )}

        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-neutral-900 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading
            ? "…"
            : mode === "login"
              ? "Se connecter"
              : mode === "register"
                ? "Créer un compte"
                : "Envoyer le lien de réinitialisation"}
        </button>
      </form>

      {mode === "login" && (
        <button
          type="button"
          onClick={() => {
            setMode("forgot");
            setError(null);
            setInfo(null);
          }}
          className="text-center text-sm text-neutral-500 underline-offset-2 hover:text-neutral-900 hover:underline"
        >
          Mot de passe oublié ?
        </button>
      )}

      {mode === "forgot" && (
        <button
          type="button"
          onClick={() => {
            setMode("login");
            setError(null);
            setInfo(null);
          }}
          className="text-center text-sm text-neutral-500 underline-offset-2 hover:text-neutral-900 hover:underline"
        >
          ← Retour à la connexion
        </button>
      )}
    </main>
  );
}
