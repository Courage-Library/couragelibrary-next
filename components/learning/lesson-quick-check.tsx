"use client";

import React, { useState, useTransition } from "react";
import { answerQuickCheckAction } from "@/app/(site)/learn/actions";

/**
 * CA-3 → COURSE-UX-1: a lesson's quick check. The browser receives the prompt and the options only — never which option
 * is correct and never the feedback — until the student answers: the SERVER checks the answer (and, for a signed-in
 * student, records the first attempt — a lesson is completed only when every quick check was attempted). The prompt and
 * options arrive as nodes already rendered by the server renderer, so math is KaTeX output; so is the feedback.
 */
export function LessonQuickCheck({
  id,
  documentId,
  language,
  answered,
  prompt,
  options,
}: {
  id: string;
  documentId: string;
  language: "en" | "hi";
  /** the signed-in student's recorded first answer (server) */
  answered: { optionId: string; correct: boolean } | null;
  prompt: React.ReactNode;
  options: { id: string; text: React.ReactNode }[];
}) {
  const [picked, setPicked] = useState<string | null>(answered?.optionId ?? null);
  const [result, setResult] = useState<{ correct: boolean; correctOptionId: string | null; feedback: React.ReactNode | null } | null>(
    answered ? { correct: answered.correct, correctOptionId: answered.correct ? answered.optionId : null, feedback: null } : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const choose = (optionId: string) => {
    setPicked(optionId);
    setError(null);
    start(async () => {
      const r = await answerQuickCheckAction({ documentId, language, blockId: id, optionId }).catch(() => null);
      if (!r || !r.ok) {
        setResult(null);
        setError("Could not check the answer. Try again.");
        return;
      }
      setResult({ correct: r.correct, correctOptionId: r.correctOptionId, feedback: r.feedback });
      document.dispatchEvent(new CustomEvent("cl:quick-check", { detail: { id } }));
    });
  };

  const tone = (optionId: string) => {
    if (!result || pending) return picked === optionId ? "border-primary-600" : "border-line";
    if (optionId === picked) return result.correct ? "border-success-600 bg-success-50" : "border-danger-600 bg-danger-50";
    if (optionId === result.correctOptionId) return "border-success-600";
    return "border-line";
  };

  return (
    <fieldset className="rounded-card border border-line bg-surface p-4" data-quick-check={id} aria-busy={pending || undefined}>
      <legend className="px-1 text-body font-semibold text-fg">Quick check: {prompt}</legend>
      <div className="mt-2 grid gap-2">
        {options.map((o) => (
          <label key={o.id} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-control border px-3 ${tone(o.id)}`}>
            <input type="radio" name={`qc-${id}`} value={o.id} checked={picked === o.id} onChange={() => choose(o.id)} disabled={pending} className="size-4" />
            <span className="text-body text-fg">{o.text}</span>
          </label>
        ))}
      </div>
      <div role="status" aria-live="polite" className="mt-2 min-h-6 text-body">
        {pending ? (
          <p className="text-fg-secondary">Checking…</p>
        ) : error ? (
          <p className="text-danger-700">{error}</p>
        ) : result ? (
          <p className={result.correct ? "text-success-700" : "text-danger-700"}>
            <strong>{result.correct ? "Correct." : "Not quite."}</strong> {result.feedback ?? (answered && !result.feedback ? "You answered this one. Pick an option to see the explanation." : null)}
          </p>
        ) : null}
      </div>
    </fieldset>
  );
}
