"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { completeLessonAction, type CompleteResult } from "@/app/(site)/learn/actions";

/**
 * COURSE-UX-1 / COURSE-POLISH-1 end of lesson. A checklist ABOVE the button, from server state (end reached, quick checks
 * answered, time since the server-recorded start) and updated live on this page (the end coming into view, each quick
 * check answered, the time counting down). The button is the screen's primary action only once all three are met;
 * before that it is disabled and the checklist says what is missing. The SERVER still decides on the click
 * (fn_lesson_complete) — a client estimate never completes anything. After completion: "+N coins" (only when lesson
 * coins are on and awarded), then Practice (real count) and Next lesson, rendered by the server as `after`.
 */
// buttonClasses(...) resolved to constants: this client island must not ship the class merger (tailwind-merge) — the
// lesson page keeps its First Load JS budget (scripts/perf/route-budgets.json)
const BTN =
  "focus-ring relative inline-flex min-h-12 shrink-0 select-none items-center justify-center gap-2 self-start whitespace-nowrap rounded-control font-medium transition-colors duration-120 ease-standard disabled:cursor-not-allowed h-13 px-6 text-body-lg ";
const PRIMARY = BTN + "bg-brand text-fg-inverse hover:bg-brand-hover active:bg-primary-900";
const WAITING = BTN + "border border-line-control bg-surface text-fg disabled:border-ink-300 disabled:text-ink-600";

export interface CompletionEvidence {
  endReached: boolean;
  answeredIds: string[];
  checksTotal: number;
  secondsLeft: number;
}

function timeLeft(s: number) {
  const m = Math.ceil(s / 60);
  return s < 60 ? "less than a minute left" : `about ${m} minute${m === 1 ? "" : "s"} left`;
}

function Item({ ok, children, testId }: { ok: boolean; children: ReactNode; testId: string }) {
  return (
    <li className="flex min-h-8 items-center gap-2" data-testid={testId} data-done={ok ? "true" : "false"}>
      <span aria-hidden="true" className={`inline-flex size-5 shrink-0 items-center justify-center rounded-full border text-caption font-bold ${ok ? "border-success-700 bg-success-700 text-fg-inverse" : "border-line-control text-transparent"}`}>
        ✓
      </span>
      <span className={ok ? "text-fg" : "text-fg-secondary"}>{children}</span>
      <span className="sr-only">{ok ? "(done)" : "(not yet)"}</span>
    </li>
  );
}

export function LessonComplete({
  documentId,
  language,
  pagePath,
  completed,
  evidence,
  after,
  doneIcon,
  coinIcon,
}: {
  documentId: string;
  language: "en" | "hi";
  pagePath: string;
  completed: boolean;
  evidence: CompletionEvidence | null;
  after: ReactNode;
  doneIcon: ReactNode;
  coinIcon: ReactNode;
}) {
  const [done, setDone] = useState(completed);
  const [atEnd, setAtEnd] = useState(Boolean(evidence?.endReached));
  const [answered, setAnswered] = useState(() => new Set(evidence?.answeredIds ?? []));
  const [secondsLeft, setSecondsLeft] = useState(evidence?.secondsLeft ?? 0);
  const [result, setResult] = useState<CompleteResult | null>(null);
  const [pending, start] = useTransition();
  const end = useRef<HTMLDivElement>(null);
  const total = evidence?.checksTotal ?? 0;

  useEffect(() => {
    if (done) return;
    const io = end.current ? new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && setAtEnd(true)) : null;
    if (io && end.current) io.observe(end.current);
    const onCheck = (e: Event) => {
      const id = (e as CustomEvent<{ id?: string }>).detail?.id;
      if (id) setAnswered((s) => (s.has(id) ? s : new Set(s).add(id)));
    };
    document.addEventListener("cl:quick-check", onCheck);
    const started = Date.now();
    const initial = evidence?.secondsLeft ?? 0;
    const tick = setInterval(() => setSecondsLeft(Math.max(0, initial - Math.floor((Date.now() - started) / 1000))), 5000);
    return () => {
      io?.disconnect();
      document.removeEventListener("cl:quick-check", onCheck);
      clearInterval(tick);
    };
  }, [done, evidence?.secondsLeft]);

  const complete = () =>
    start(async () => {
      const r = await completeLessonAction({ documentId, language, pagePath }).catch(() => null);
      setResult(r ?? { ok: false, code: "FAILED" });
      if (r?.ok && r.completed) setDone(true);
      else if (r?.ok) {
        // the server's own state wins over this page's estimate
        if (r.missing.includes("TIME")) setSecondsLeft(r.secondsLeft);
        if (r.missing.includes("END")) setAtEnd(false);
      }
    });

  const checksOk = answered.size >= total;
  const timeOk = secondsLeft <= 0;
  const ready = atEnd && checksOk && timeOk;
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
          <ul className="flex flex-col gap-1 text-body" aria-label="To complete this lesson" data-testid="complete-checklist">
            <Item ok={atEnd} testId="check-end">
              Read to the end
            </Item>
            {total > 0 && (
              <Item ok={checksOk} testId="check-quick">
                Quick checks {Math.min(answered.size, total)}/{total}
              </Item>
            )}
            <Item ok={timeOk} testId="check-time">
              {timeOk ? "Reading time" : `Reading time — ${timeLeft(secondsLeft)}`}
            </Item>
          </ul>
          <button type="button" onClick={complete} disabled={!ready || pending} className={ready ? PRIMARY : WAITING} data-testid="mark-complete" data-ready={ready ? "true" : "false"}>
            {pending ? "Checking…" : "Mark complete"}
          </button>
          <div role="status" aria-live="polite" className="text-body text-fg-secondary">
            {!ready && <p>Finish the steps above to mark this lesson complete.</p>}
            {result && !result.ok && <p className="text-danger-700">{result.code === "NOT_SIGNED_IN" ? "Sign in to save your progress." : "Could not save. Try again."}</p>}
            {result?.ok && !result.completed && <p data-testid="complete-missing">Not yet — the checklist above shows what is left.</p>}
          </div>
        </>
      )}
    </div>
  );
}
