"use client";

import { useState } from "react";

export default function ConnectExtensionPage() {
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generateCode() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/extension/pairing-code", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Could not generate a code (${res.status})`);
      }
      const body: { code: string; expiresAt: string } = await res.json();
      setCode(body.code);
      setExpiresAt(body.expiresAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 text-center">
      <div>
        <h1 className="text-xl font-semibold">Associer l’extension navigateur</h1>
        <p className="text-sm text-neutral-500">
          Génère un code ci-dessous, puis colle-le dans la page d’options de l’extension.
        </p>
      </div>

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {code ? (
        <div className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-6">
          <p className="font-mono text-3xl font-semibold tracking-widest">{code}</p>
          {expiresAt && (
            <p className="text-xs text-neutral-400">
              Expire à {new Date(expiresAt).toLocaleTimeString("fr-FR")}
            </p>
          )}
          <button
            type="button"
            onClick={generateCode}
            disabled={loading}
            className="mt-2 text-sm text-neutral-500 underline disabled:opacity-50"
          >
            Générer un nouveau code
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={generateCode}
          disabled={loading}
          className="rounded-md bg-neutral-900 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? "Génération…" : "Générer un code d’association"}
        </button>
      )}
    </main>
  );
}
