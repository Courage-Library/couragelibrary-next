"use client";

import React, { useState } from "react";

/**
 * CA-3: a lesson's quick check — choose an option, see whether it is right and why. Nothing is recorded. The prompt,
 * options and feedback arrive as nodes already rendered by the (server) lesson renderer, so math is KaTeX output and
 * this client component never handles LaTeX.
 */
export function LessonQuickCheck({
  id,
  prompt,
  options,
}: {
  id: string;
  prompt: React.ReactNode;
  options: { id: string; correct: boolean; text: React.ReactNode; feedback: React.ReactNode | null }[];
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const choice = options.find((o) => o.id === picked) || null;
  return (
    <fieldset className="rounded-card border border-line bg-surface p-4">
      <legend className="px-1 text-body font-semibold text-fg">Quick check: {prompt}</legend>
      <div className="mt-2 grid gap-2">
        {options.map((o) => (
          <label key={o.id} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-control border px-3 ${picked === o.id ? (o.correct ? "border-success-600 bg-success-50" : "border-danger-600 bg-danger-50") : "border-line"}`}>
            <input type="radio" name={`qc-${id}`} value={o.id} checked={picked === o.id} onChange={() => setPicked(o.id)} className="size-4" />
            <span className="text-body text-fg">{o.text}</span>
          </label>
        ))}
      </div>
      <div role="status" aria-live="polite" className="mt-2 min-h-6 text-body">
        {choice && (
          <p className={choice.correct ? "text-success-700" : "text-danger-700"}>
            <strong>{choice.correct ? "Correct." : "Not quite."}</strong> {choice.feedback}
          </p>
        )}
      </div>
    </fieldset>
  );
}
