"use client";

import { useEffect, useState } from "react";

interface PlanStatus {
  plan: "free" | "pro";
  analyzedSeconds: number;
  limitSeconds: number;
  remainingSeconds: number;
}

const FREE_FEATURES = [
  "30 min de vidéo analysée / mois",
  "Flashcards illimitées",
  "Banque de vocabulaire",
  "Quiz de compréhension",
];

const PRO_FEATURES = [
  "Vidéo analysée illimitée",
  "Tout le plan gratuit",
  "Explications « 💡 je suis perdu »",
  "Réécoute active (transcription + traduction)",
  "Soutien d'un produit indépendant 💛",
];

export default function PricingPage() {
  const [status, setStatus] = useState<PlanStatus | null>(null);
  const [billing, setBilling] = useState<"annual" | "monthly">("annual");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/billing/status")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: PlanStatus | null) => setStatus(data))
      .catch(() => {});
  }, []);

  async function checkout() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: billing }),
      });
      const body = await res.json();
      if (!res.ok || !body.url) throw new Error(body.error ?? "Paiement indisponible");
      window.location.href = body.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Paiement indisponible");
      setBusy(false);
    }
  }

  async function openPortal() {
    setBusy(true);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const body = await res.json();
      if (res.ok && body.url) window.location.href = body.url;
      else setBusy(false);
    } catch {
      setBusy(false);
    }
  }

  const usagePct =
    status && status.limitSeconds > 0
      ? Math.min(100, Math.round((status.analyzedSeconds / status.limitSeconds) * 100))
      : 0;

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-6 py-12">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">Tarifs simples</h1>
        <p className="mt-2 text-neutral-500">
          Commence gratuitement. Passe en Pro quand tu regardes plus que tu ne l’imaginais.
        </p>
      </div>

      {status && status.plan === "free" && (
        <div className="mx-auto w-full max-w-md rounded-2xl border border-neutral-200 p-4">
          <div className="mb-1 flex justify-between text-sm">
            <span className="text-neutral-500">Ton quota ce mois-ci</span>
            <span className="font-medium">
              {Math.round(status.analyzedSeconds / 60)} / {Math.round(status.limitSeconds / 60)} min
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
            <div
              className={`h-full rounded-full ${usagePct >= 90 ? "bg-amber-500" : "bg-neutral-900"}`}
              style={{ width: `${usagePct}%` }}
            />
          </div>
        </div>
      )}

      <div className="mx-auto flex items-center gap-2 rounded-full bg-neutral-100 p-1 text-sm">
        <button
          type="button"
          onClick={() => setBilling("annual")}
          className={`rounded-full px-4 py-1.5 transition ${
            billing === "annual" ? "bg-white font-medium shadow-sm" : "text-neutral-500"
          }`}
        >
          Annuel <span className="text-emerald-600">−44 %</span>
        </button>
        <button
          type="button"
          onClick={() => setBilling("monthly")}
          className={`rounded-full px-4 py-1.5 transition ${
            billing === "monthly" ? "bg-white font-medium shadow-sm" : "text-neutral-500"
          }`}
        >
          Mensuel
        </button>
      </div>

      {error && <p className="text-center text-sm text-red-600">{error}</p>}

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="flex flex-col gap-4 rounded-2xl border border-neutral-200 p-6">
          <div>
            <h2 className="font-semibold">Gratuit</h2>
            <p className="mt-1 text-3xl font-bold">0 €</p>
            <p className="text-xs text-neutral-400">pour toujours</p>
          </div>
          <ul className="flex flex-col gap-2 text-sm text-neutral-600">
            {FREE_FEATURES.map((f) => (
              <li key={f}>✓ {f}</li>
            ))}
          </ul>
          <p className="mt-auto rounded-full border border-neutral-200 py-2 text-center text-sm text-neutral-400">
            {status?.plan === "free" ? "Ton plan actuel" : "Inclus dans Pro"}
          </p>
        </div>

        <div className="relative flex flex-col gap-4 rounded-2xl border-2 border-neutral-900 p-6">
          <span className="absolute -top-3 left-6 rounded-full bg-neutral-900 px-3 py-0.5 text-xs font-medium text-white">
            Recommandé
          </span>
          <div>
            <h2 className="font-semibold">Pro</h2>
            {billing === "annual" ? (
              <>
                <p className="mt-1 text-3xl font-bold">
                  3,33 €<span className="text-base font-normal text-neutral-400">/mois</span>
                </p>
                <p className="text-xs text-neutral-400">facturé 39,99 €/an</p>
              </>
            ) : (
              <>
                <p className="mt-1 text-3xl font-bold">
                  5,99 €<span className="text-base font-normal text-neutral-400">/mois</span>
                </p>
                <p className="text-xs text-neutral-400">sans engagement</p>
              </>
            )}
          </div>
          <ul className="flex flex-col gap-2 text-sm text-neutral-600">
            {PRO_FEATURES.map((f) => (
              <li key={f}>✓ {f}</li>
            ))}
          </ul>
          {status?.plan === "pro" ? (
            <button
              type="button"
              onClick={openPortal}
              disabled={busy}
              className="mt-auto rounded-full border border-neutral-900 py-2.5 text-sm font-medium transition hover:bg-neutral-100 disabled:opacity-50"
            >
              Gérer mon abonnement
            </button>
          ) : (
            <button
              type="button"
              onClick={checkout}
              disabled={busy}
              className="mt-auto rounded-full bg-neutral-900 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-50"
            >
              {busy ? "Redirection…" : "Passer en Pro"}
            </button>
          )}
        </div>
      </div>

      <p className="text-center text-xs text-neutral-400">
        Paiement sécurisé par Stripe · Annulable à tout moment ·{" "}
        <a href="/terms" className="underline">
          CGU
        </a>{" "}
        ·{" "}
        <a href="/privacy" className="underline">
          Confidentialité
        </a>
      </p>
    </main>
  );
}
