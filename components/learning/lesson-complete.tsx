"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { completeLessonAction, type CompleteResult } from "@/app/(site)/learn/actions";

/**
 * COURSE-UX-1 end of lesson: "Mark complete" is enabled once the end of the lesson is on screen; the SERVER decides
 * (end reached + every quick check attempted + enough time since its own recorded start) and says what is missing.
 * On completion: "+N coins" (only when lesson coins are switched on and the server awarded them), then the next steps
 * (Practice with the real count, next lesson) that the server rendered as `after`.
 */
// buttonClasses({ variant: "secondary", size: "lg" }) resolved to a constant: this client island must not ship the class
// merger (tailwind-merge) — the lesson page keeps its First Load JS budget (scripts/perf/route-budgets.json)
const SECONDARY_LG =
  "focus-ring relative inline-flex min-h-12 shrink-0 select-none items-center justify-center gap-2 self-start whitespace-nowrap rounded-control font-medium transition-colors duration-120 ease-standard disabled:cursor-not-allowed border border-line-control bg-surface text-fg hover:bg-ink-50 active:bg-ink-100 disabled:border-ink-300 disabled:text-ink-600 h-13 px-6 text-body-lg";

const MISSING: Record<string, string> = {
  START: "Open the lesson again to start the reading timer.",
  END: "Read to the end of the lesson.",
};

function minutesText(s: number) {
  const m = Math.ceil(s / 60);
  return s < 60 ? "less than a minute" : `about ${m} minute${m === 1 ? "" : "s"}`;
}

export function LessonComplete({ documentId, language, pagePath, completed, after, doneIcon, coinIcon }: { documentId: string; language: "en" | "hi"; pagePath: string; completed: boolean; after: ReactNode; doneIcon: ReactNode; coinIcon: ReactNode }) {
  const [done, setDone] = useState(completed);
  const [atEnd, setAtEnd] = useState(false);
  const [result, setResult] = useState<CompleteResult | null>(null);
  const [pending, start] = useTransition();
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (done || !end.current) return;
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && setAtEnd(true));
    io.observe(end.current);
    return () => io.disconnect();
  }, [done]);

  const complete = () =>
    start(async () => {
      const r = await completeLessonAction({ documentId, language, pagePath }).catch(() => null);
      setResult(r ?? { ok: false, code: "FAILED" });
      if (r?.ok && r.completed) setDone(true);
    });

  const missing = result?.ok && !result.completed ? result.missing : [];
  return (
    <div ref={end} className="flex flex-col gap-4 border-t border-line pt-6" data-testid="lesson-complete">
      {done ? (
        <>
          <p className="inline-flex items-center gap-2 text-body font-semibold text-success-700" role="status">
            {doneIcon} Lesson completed
          </p>
          {result?.ok && result.coins !== null && result.coins > 0 && (
            <p className="inline-flex items-center gap-2 self-start rounded-control border border-success-200 bg-success-50 px-3 py-2 text-body font-semibold text-success-800" role="status" data-testid="coins-toast">
              {coinIcon} +{result.coins} coins
            </p>
          )}
          {after}
        </>
      ) : (
        <>
          <button type="button" onClick={complete} disabled={!atEnd || pending} className={SECONDARY_LG} data-testid="mark-complete">
            {pending ? "Checking…" : "Mark complete"}
          </button>
          <div role="status" aria-live="polite" className="text-body text-fg-secondary">
            {!atEnd && <p>Read to the end of the lesson to mark it complete.</p>}
            {result && !result.ok && <p className="text-danger-700">{result.code === "NOT_SIGNED_IN" ? "Sign in to save your progress." : "Could not save. Try again."}</p>}
            {missing.length > 0 && (
              <ul className="list-disc pl-6" data-testid="complete-missing">
                {missing.map((m) => (
                  <li key={m}>
                    {m === "QUICK_CHECKS" && result?.ok && result.quickChecks
                      ? `Answer every quick check (${result.quickChecks.attempted} of ${result.quickChecks.total} done).`
                      : m === "TIME" && result?.ok
                        ? `Keep reading — ${minutesText(result.secondsLeft)} more.`
                        : MISSING[m]}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
