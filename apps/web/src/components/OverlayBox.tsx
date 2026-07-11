"use client";

import { useState } from "react";
import type { KeywordCue } from "@streamlingo/shared";

export default function OverlayBox({
  cues,
  position,
}: {
  cues: KeywordCue[];
  position: "top-left" | "top-right";
}) {
  const [expanded, setExpanded] = useState<number | null>(null);

  if (cues.length === 0) return null;

  const visible = cues.slice(-6);

  return (
    <div
      className={`fixed z-40 w-64 rounded-lg border border-neutral-200 bg-white/95 p-3 text-sm shadow-lg backdrop-blur ${
        position === "top-left" ? "left-4 top-4" : "right-4 top-4"
      }`}
    >
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">Keywords</p>
      <ul className="flex flex-col gap-1">
        {visible.map((cue, i) => {
          const isExpanded = expanded === i;
          return (
            <li key={`${cue.word}-${cue.startSeconds}-${i}`}>
              <button
                type="button"
                onClick={() => setExpanded(isExpanded ? null : i)}
                className="w-full rounded px-2 py-1 text-left hover:bg-neutral-100"
              >
                <span className="font-medium">{cue.word}</span>{" "}
                <span className="text-neutral-500">— {cue.translation}</span>
              </button>
              {isExpanded && (
                <div className="mt-1 rounded bg-neutral-50 px-2 py-2 text-xs text-neutral-600">
                  {cue.phonetic && <p className="italic">/{cue.phonetic}/</p>}
                  <p className="mt-1">{cue.exampleSentence}</p>
                  <p className="text-neutral-400">{cue.exampleTranslation}</p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
