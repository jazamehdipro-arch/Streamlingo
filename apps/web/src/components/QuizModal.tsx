"use client";

import { useState } from "react";
import type { QuizQuestion } from "@streamlingo/shared";

export default function QuizModal({
  questions,
  onClose,
}: {
  questions: QuizQuestion[];
  onClose: () => void;
}) {
  const [current, setCurrent] = useState(0);
  const [chosenIndex, setChosenIndex] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{ isCorrect: boolean; explanation: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const question = questions[current];

  async function submit() {
    if (chosenIndex === null) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/quiz-questions/${question.id}/attempt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chosenIndex }),
      });
      const body = await res.json();
      setFeedback(body);
    } finally {
      setSubmitting(false);
    }
  }

  function next() {
    setCurrent((c) => c + 1);
    setChosenIndex(null);
    setFeedback(null);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-xs uppercase text-neutral-400">
            Question {current + 1} / {questions.length}
          </p>
          <button onClick={onClose} className="text-sm text-neutral-400 hover:text-neutral-700">
            Fermer
          </button>
        </div>

        <p className="mb-4 font-medium">{question.question}</p>

        <div className="flex flex-col gap-2">
          {question.choices.map((choice, i) => (
            <button
              key={i}
              type="button"
              disabled={feedback !== null}
              onClick={() => setChosenIndex(i)}
              className={`rounded-md border px-3 py-2 text-left text-sm ${
                chosenIndex === i ? "border-neutral-900" : "border-neutral-200"
              } ${
                feedback && i === chosenIndex
                  ? feedback.isCorrect
                    ? "border-green-400 bg-green-50"
                    : "border-red-400 bg-red-50"
                  : ""
              }`}
            >
              {choice}
            </button>
          ))}
        </div>

        {feedback && <p className="mt-3 text-sm text-neutral-600">{feedback.explanation}</p>}

        <div className="mt-5 flex justify-end gap-2">
          {!feedback ? (
            <button
              type="button"
              disabled={chosenIndex === null || submitting}
              onClick={submit}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              Valider
            </button>
          ) : current < questions.length - 1 ? (
            <button
              type="button"
              onClick={next}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white"
            >
              Suivant
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white"
            >
              Terminer
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
