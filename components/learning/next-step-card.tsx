import React from "react";
import Link from "next/link";
import { ArrowRight, BookOpen, CheckCircle2, Circle } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import type { NextStep } from "@/lib/learning/next-step";

/**
 * CA-7 dashboard "next step" + STUDENT-DASH-1: the dashboard's ONE primary action (R4). Continue the lesson in progress,
 * or — for a new student — the first steps, each ticked from their own data (R12).
 */
export function NextStepCard({ step }: { step: NextStep }) {
  if (!step) return null;
  if (step.kind === "continue") {
    return (
      <section aria-labelledby="next-step-title" className="flex flex-col gap-4 rounded-card border border-line bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
            <BookOpen aria-hidden="true" className="size-5" />
          </span>
          <div>
            <h2 id="next-step-title" className="text-[13px] font-semibold uppercase tracking-wide text-fg-secondary">
              Continue where you left off
            </h2>
            <p className="mt-0.5 text-[16px] font-bold text-fg">{step.title}</p>
            {step.inLiveCourse && <p className="text-[13px] text-fg-secondary">Part of your exam course</p>}
          </div>
        </div>
        <Link href={step.href} className={buttonClasses({ variant: "primary" })}>
          Continue <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </section>
    );
  }
  return (
    <section aria-labelledby="next-step-title" className="rounded-card border border-line bg-white p-5">
      <h2 id="next-step-title" className="text-[18px] font-bold text-fg">
        Your first steps
      </h2>
      <ol className="mt-3 space-y-3">
        {step.steps.map((s, i) => (
          <li key={s.key} className="flex items-start gap-3">
            {s.done ? (
              <CheckCircle2 aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-success-600" />
            ) : (
              <Circle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-ink-400" />
            )}
            <div className="min-w-0">
              <p className={`text-[15px] font-semibold ${s.done ? "text-fg-secondary line-through" : "text-fg"}`}>
                {i + 1}. {s.label}
                <span className="sr-only">{s.done ? " (done)" : " (to do)"}</span>
              </p>
              <p className="text-[13px] text-fg-secondary">{s.detail}</p>
            </div>
          </li>
        ))}
      </ol>
      <Link href={step.primary.href} className={buttonClasses({ variant: "primary", className: "mt-4" })}>
        {step.primary.label} <ArrowRight aria-hidden="true" className="size-4" />
      </Link>
    </section>
  );
}
