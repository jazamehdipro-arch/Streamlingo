"use client";

import { useEffect, useState } from "react";

const DISMISS_KEY = "sl-install-dismissed";

type Platform = "ios" | "android" | "other";
type Step = { text: string; img?: string };

const STEPS: Record<Platform, Step[]> = {
  ios: [
    { text: "Ouvre le menu ••• de Safari, puis appuie sur « Partager ».", img: "/install/step1.webp" },
    { text: "Fais défiler et choisis « Sur l’écran d’accueil ».", img: "/install/step2.webp" },
    { text: "Appuie sur « Ajouter » en haut à droite.", img: "/install/step3.webp" },
    { text: "Ouvre StreamLingo depuis la nouvelle icône — plein écran, sans barre." },
  ],
  android: [
    { text: "Ouvre le menu (⋮) en haut à droite de Chrome." },
    { text: "Choisis « Ajouter à l’écran d’accueil » (ou « Installer l’application »)." },
    { text: "Confirme avec « Ajouter » / « Installer »." },
    { text: "Ouvre StreamLingo depuis la nouvelle icône — plein écran, sans barre." },
  ],
  other: [
    { text: "Ouvre le menu de ton navigateur." },
    { text: "Cherche « Ajouter à l’écran d’accueil » ou « Installer l’application »." },
    { text: "Confirme." },
    { text: "Ouvre StreamLingo depuis la nouvelle icône." },
  ],
};

export default function InstallBanner() {
  const [show, setShow] = useState(false);
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<Platform>("other");

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Already installed (launched from the home screen)?
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return;

    // Previously dismissed, or not a phone → don't nag.
    if (localStorage.getItem(DISMISS_KEY) === "1") return;
    if (!window.matchMedia("(max-width: 640px)").matches) return;

    const ua = window.navigator.userAgent;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlatform(/iphone|ipad|ipod/i.test(ua) ? "ios" : /android/i.test(ua) ? "android" : "other");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShow(true);
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Storage may be unavailable (private mode) — closing for the session is fine.
    }
    setShow(false);
    setOpen(false);
  }

  if (!show) return null;

  return (
    <>
      <div className="bg-neutral-900 text-white">
        <div className="mx-auto flex max-w-4xl items-center gap-2 px-4 py-2 text-sm sm:px-6">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex flex-1 items-center gap-2 text-left"
          >
            <span className="text-base">📲</span>
            <span className="font-medium">Installer l’application</span>
            <span className="text-white/60">— plein écran, comme une vraie app</span>
          </button>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Fermer"
            className="shrink-0 rounded-full px-2 py-1 text-white/60 transition hover:text-white"
          >
            ✕
          </button>
        </div>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 sm:items-center"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[88vh] w-full max-w-sm overflow-y-auto rounded-t-3xl bg-white p-6 sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Installer StreamLingo</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fermer"
                className="rounded-full px-2 py-1 text-neutral-400 hover:text-neutral-900"
              >
                ✕
              </button>
            </div>

            <p className="mb-4 text-sm text-neutral-500">
              Ajoute StreamLingo à ton écran d’accueil pour l’ouvrir en plein écran, sans barre de
              navigateur.
            </p>

            <ol className="flex flex-col gap-4">
              {STEPS[platform].map((step, i) => (
                <li key={i} className="flex flex-col gap-2 text-sm">
                  <div className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-xs font-medium text-white">
                      {i + 1}
                    </span>
                    <span className="pt-0.5 text-neutral-700">{step.text}</span>
                  </div>
                  {step.img && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={step.img}
                      alt={`Étape ${i + 1}`}
                      className="ml-9 w-full max-w-[240px] rounded-xl border border-neutral-200"
                    />
                  )}
                </li>
              ))}
            </ol>

            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-6 w-full rounded-full bg-neutral-900 py-2.5 text-sm font-medium text-white"
            >
              Compris
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="mt-2 w-full text-center text-xs text-neutral-400 hover:text-neutral-700"
            >
              Ne plus afficher
            </button>
          </div>
        </div>
      )}
    </>
  );
}
