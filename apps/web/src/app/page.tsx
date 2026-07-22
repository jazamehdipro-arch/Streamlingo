"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getBrowserSupabase } from "@/lib/supabase";

const STEPS = [
  {
    title: "Regarde ce que tu aimes",
    text: "Installe l’extension et lance n’importe quelle vidéo YouTube sous-titrée dans ta langue cible. Pas de matériel scolaire — tes vraies vidéos.",
    icon: "▶",
  },
  {
    title: "Les mots viennent à toi",
    text: "Les mots au-dessus de ton niveau apparaissent traduits au moment où ils sont prononcés, dans un coin de l’écran. Un clic : exemple + prononciation. Jamais de pause forcée.",
    icon: "✨",
  },
  {
    title: "Révise et retiens",
    text: "Chaque mot rencontré rejoint ta banque de vocabulaire. Les flashcards à répétition espacée te les représentent au bon moment pour les ancrer.",
    icon: "🎯",
  },
];

export default function HomePage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = getBrowserSupabase();
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        if (data.session) {
          router.replace("/learn");
          return;
        }
      } catch {
        // Missing config: still show the landing page.
      }
      if (!cancelled) setChecking(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-neutral-400">Chargement…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-6">
      <section className="flex flex-col items-center gap-6 pb-16 pt-24 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-900 text-xl text-white shadow-lg">
          ▶
        </span>
        <h1 className="max-w-2xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
          Apprends une langue avec les vidéos que tu regardes déjà
        </h1>
        <p className="max-w-xl text-lg text-neutral-500">
          Wordhook traduit les mots importants pendant que tu regardes YouTube ou écoutes un
          podcast — sans jamais casser l’immersion. L’apprentissage est proposé, jamais imposé.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/login"
            className="rounded-full bg-neutral-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-neutral-700"
          >
            Commencer gratuitement
          </Link>
          <Link
            href="/login"
            className="rounded-full border border-neutral-300 px-6 py-3 text-sm font-medium text-neutral-700 transition hover:border-neutral-900"
          >
            Se connecter
          </Link>
        </div>
      </section>

      <section className="grid gap-6 pb-24 sm:grid-cols-3">
        {STEPS.map((step) => (
          <div
            key={step.title}
            className="flex flex-col gap-3 rounded-2xl border border-neutral-200 p-6 transition hover:shadow-md"
          >
            <span className="text-2xl">{step.icon}</span>
            <h2 className="font-semibold">{step.title}</h2>
            <p className="text-sm leading-relaxed text-neutral-500">{step.text}</p>
          </div>
        ))}
      </section>

      <footer className="border-t border-neutral-200 py-8 text-center text-xs text-neutral-400">
        Wordhook — extension navigateur pour YouTube + web app pour podcasts. Ton niveau (A1–C1)
        pilote tout : quantité de mots traduits et difficulté des quiz.
      </footer>
    </main>
  );
}
