"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserSupabase } from "@/lib/supabase";
import { syncSessionCookie } from "@/lib/authClient";

type Mode = "login" | "register";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = getBrowserSupabase();
      const { data, error: authError } =
        mode === "login"
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({ email, password });
      if (authError) throw authError;

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
        <p className="text-sm text-neutral-500">Connecte-toi pour continuer.</p>
      </div>

      <div className="flex gap-2 rounded-lg bg-neutral-100 p-1 text-sm">
        {(["login", "register"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`flex-1 rounded-md py-2 transition ${
              mode === m ? "bg-white font-medium shadow-sm" : "text-neutral-500"
            }`}
          >
            {m === "login" ? "Connexion" : "Inscription"}
          </button>
        ))}
      </div>

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
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
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-neutral-900 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? "…" : mode === "login" ? "Se connecter" : "Créer un compte"}
        </button>
      </form>
    </main>
  );
}
