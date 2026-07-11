"use client";

export default function ReplayModal({
  transcript,
  translation,
  onClose,
}: {
  transcript: string;
  translation: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-xs uppercase text-neutral-400">Réécoute active</p>
          <button onClick={onClose} className="text-sm text-neutral-400 hover:text-neutral-700">
            Fermer
          </button>
        </div>
        <p className="mb-3 whitespace-pre-wrap text-sm leading-relaxed">{transcript}</p>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-500">{translation}</p>
      </div>
    </div>
  );
}
