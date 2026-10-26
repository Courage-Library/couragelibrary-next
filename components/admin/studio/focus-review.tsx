"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Pencil, XCircle, X, AlertTriangle, Sun, Moon } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { DraftEditor } from "@/components/admin/question-factory/review-queue-tab";
import { qfApproveAction, qfEditDraftAction, qfGetFocusItemAction, qfRejectAction, qfRequestChangesAction, qfSubmitForReviewAction } from "@/actions/question-factory.actions";
import { QF_REVIEW_CHECKLIST_ITEMS, type QuestionAuthoringItem, type QuestionReviewChecklist, type QuestionVersionDetail } from "@/types/question-factory";
import type { AutoCheck } from "@/lib/question-factory/auto-checks";

/**
 * Courage Studio — FOCUS REVIEW client (decision #84). Dark surround (the focus-surround token) with a WHITE question card (a light
 * surround toggle is remembered per browser). Keys: A approve · R reject (reason required) · E edit (drawer) ·
 * J next / skip · K previous · Esc closes a dialog, then exits. The auto checks come from the server; a failed blocking
 * check disables Approve with its reason (the server enforces it again). Q3: ONE confirmation "I checked all 6" with
 * the 6 reviewer items visible. Every write goes through the existing guarded QF server actions.
 */
type Item = { detail: QuestionVersionDetail; otherLanguageStem: string | null; checks: AutoCheck[] };
type Res = { success?: boolean; ok?: boolean; error?: unknown; message?: unknown; data?: unknown };
const SURROUND_KEY = "cl-studio-focus-surround";
const ALL_CHECKED = Object.fromEntries(QF_REVIEW_CHECKLIST_ITEMS.map((i) => [i.id, true])) as QuestionReviewChecklist;

function failed(res: Res): string | null {
  if (res.success === true) return null;
  const m = typeof res.message === "string" ? res.message : typeof res.error === "string" ? res.error : null;
  return m || "The action did not complete. Nothing was changed.";
}

export function FocusReview({ queue: initialQueue, goal, doneBefore }: { queue: string[] | null; goal: number; doneBefore: number | null }) {
  const [queue, setQueue] = useState<string[]>(initialQueue ?? []);
  const [idx, setIdx] = useState(0);
  const [item, setItem] = useState<Item | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [dialog, setDialog] = useState<null | "reject" | "edit">(null);
  const [light, setLight] = useState(false);
  const [session, setSession] = useState({ approved: 0, rejected: 0, changed: 0, ms: [] as number[] });
  const [announce, setAnnounce] = useState("");
  const [isPending, startTransition] = useTransition();
  const shownAt = useRef<number>(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const rejectRef = useRef<HTMLDialogElement>(null);
  const editRef = useRef<HTMLDialogElement>(null);

  const currentId = queue[idx] ?? null;
  const blocking = item ? item.checks.filter((c) => c.blocking && !c.ok) : [];
  const decided = session.approved + session.rejected + session.changed;
  const done = (doneBefore ?? 0) + decided;
  const canApprove = !!item && confirmed && blocking.length === 0 && !isPending;

  useEffect(() => {
    try {
      setLight(window.localStorage.getItem(SURROUND_KEY) === "light");
    } catch {
      /* storage unavailable: dark surround */
    }
  }, []);
  const toggleSurround = () => {
    setLight((v) => {
      try {
        window.localStorage.setItem(SURROUND_KEY, v ? "dark" : "light");
      } catch {
        /* not remembered */
      }
      return !v;
    });
  };

  // load the current item (server auto checks included)
  useEffect(() => {
    if (!currentId) {
      setItem(null);
      return;
    }
    let live = true;
    setItem(null);
    setLoadError(null);
    setActionError(null);
    setConfirmed(false);
    qfGetFocusItemAction(currentId).then((res) => {
      if (!live) return;
      const err = failed(res as Res);
      if (err) setLoadError(err);
      else {
        setItem((res as { data: Item }).data);
        shownAt.current = Date.now();
        headingRef.current?.focus();
      }
    });
    return () => {
      live = false;
    };
  }, [currentId]);

  useEffect(() => {
    const map = { reject: rejectRef, edit: editRef } as const;
    for (const k of ["reject", "edit"] as const) {
      const d = map[k].current;
      if (!d) continue;
      if (dialog === k && !d.open) d.showModal();
      if (dialog !== k && d.open) d.close();
    }
  }, [dialog]);

  /** the decision is done: drop it from the queue; the next item auto-opens at the same position */
  const finish = useCallback(
    (kind: "approved" | "rejected" | "changed", id: string) => {
      const ms = shownAt.current ? Date.now() - shownAt.current : 0;
      setSession((s) => ({ ...s, [kind]: s[kind] + 1, ms: ms > 0 ? [...s.ms, ms] : s.ms }));
      setQueue((q) => {
        const next = q.filter((x) => x !== id);
        setIdx((i) => Math.min(i, Math.max(0, next.length - 1)));
        return next;
      });
      setAnnounce(kind === "approved" ? "Approved. Next question." : kind === "rejected" ? "Rejected. Next question." : "Edited and sent back to review.");
      setDialog(null);
      setRejectReason("");
      setEditNotes("");
    },
    [],
  );

  const approve = () => {
    if (!item || !currentId || !canApprove) return;
    const id = currentId;
    startTransition(async () => {
      const err = failed((await qfApproveAction(id, ALL_CHECKED)) as Res);
      if (err) setActionError(err);
      else finish("approved", id);
    });
  };
  const reject = () => {
    if (!currentId || !rejectReason.trim()) return;
    const id = currentId;
    startTransition(async () => {
      const err = failed((await qfRejectAction(id, rejectReason.trim())) as Res);
      if (err) setActionError(err);
      else finish("rejected", id);
    });
  };
  /** edit = request changes (notes) → save the edit → submit for review again (existing actions, existing rules) */
  const saveEdit = (edited: QuestionAuthoringItem) => {
    if (!currentId || !editNotes.trim()) return;
    const id = currentId;
    startTransition(async () => {
      let err = failed((await qfRequestChangesAction(id, editNotes.trim())) as Res);
      if (!err) err = failed((await qfEditDraftAction(id, edited)) as Res);
      if (!err) err = failed((await qfSubmitForReviewAction(id, "Edited in focus review")) as Res);
      if (err) {
        setActionError(`${err} The question may now be in “changes requested” — open it in Question drafts.`);
        setDialog(null);
      } else finish("changed", id);
    });
  };

  const next = () => setIdx((i) => (queue.length ? Math.min(i + 1, queue.length - 1) : 0));
  const prev = () => setIdx((i) => Math.max(0, i - 1));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
      if (e.key === "Escape") {
        if (dialog) return; // the native dialog closes itself (onClose resets state)
        e.preventDefault();
        window.location.assign("/admin");
        return;
      }
      if (typing || dialog) return;
      const k = e.key.toLowerCase();
      if (k === "a") {
        e.preventDefault();
        approve();
      } else if (k === "r" && item) {
        e.preventDefault();
        setDialog("reject");
      } else if (k === "e" && item) {
        e.preventDefault();
        setDialog("edit");
      } else if (k === "j") {
        e.preventDefault();
        next();
      } else if (k === "k") {
        e.preventDefault();
        prev();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const avg = session.ms.length ? Math.round(session.ms.reduce((a, b) => a + b, 0) / session.ms.length / 1000) : null;
  const onDark = !light;

  return (
    <div className={cn("fixed inset-0 z-80 overflow-y-auto", onDark ? "bg-focus-surround text-fg-inverse" : "bg-ink-100 text-fg")} data-focus-review="" data-surround={onDark ? "dark" : "light"}>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-4 sm:py-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/admin" className={cn("inline-flex min-h-11 items-center gap-2 rounded-control px-3 text-body-sm font-semibold", onDark ? "focus-ring-on-dark hover:bg-white/10" : "focus-ring hover:bg-surface")}>
              <X aria-hidden="true" className="size-4" /> Exit <kbd className="rounded border border-current px-1 text-caption">Esc</kbd>
            </Link>
            <p className="text-body-sm font-semibold" aria-live="polite">
              {doneBefore === null ? `${decided} reviewed this session` : `${done} of ${goal}`} · {queue.length} in the queue
            </p>
          </div>
          <button type="button" onClick={toggleSurround} aria-pressed={light} className={cn("inline-flex min-h-11 items-center gap-2 rounded-control px-3 text-body-sm font-semibold", onDark ? "focus-ring-on-dark hover:bg-white/10" : "focus-ring hover:bg-surface")}>
            {light ? <Moon aria-hidden="true" className="size-4" /> : <Sun aria-hidden="true" className="size-4" />}
            Light surround
          </button>
        </header>
        <div className={cn("h-1.5 w-full overflow-hidden rounded-full", onDark ? "bg-white/20" : "bg-ink-200")} aria-hidden="true">
          <div className="h-full rounded-full bg-accent-400 motion-safe:transition-[width]" style={{ width: `${Math.min(100, (done / Math.max(1, goal)) * 100)}%` }} />
        </div>
        <p className="sr-only" aria-live="polite">
          {announce}
        </p>

        {initialQueue === null ? (
          <Empty onDark={onDark} title="The review queue is not available" body="It could not be read. Nothing was changed — try again in a moment." />
        ) : queue.length === 0 ? (
          <Empty onDark={onDark} title="The queue is clear" body={decided ? `You reviewed ${decided} question${decided === 1 ? "" : "s"} this session.` : "No question is waiting for review."} />
        ) : loadError ? (
          <Empty onDark={onDark} title="This question could not be opened" body={loadError} />
        ) : !item ? (
          <div className="rounded-panel bg-surface p-6 text-fg" role="status">
            Loading the question…
          </div>
        ) : (
          <article aria-labelledby="focus-q" className="flex flex-col gap-5 rounded-panel bg-surface p-5 text-fg shadow-e2 sm:p-7" data-focus-card="">
            <div className="flex flex-wrap items-center gap-2 text-caption font-semibold text-fg-secondary">
              <span>Question {idx + 1} of {queue.length}</span>
              <span aria-hidden="true">·</span>
              <span>{item.detail.topicName ?? "No topic"}</span>
              <span aria-hidden="true">·</span>
              <span className="capitalize">{item.detail.difficulty}</span>
            </div>

            <section className="flex flex-col gap-3">
              <h1 id="focus-q" ref={headingRef} tabIndex={-1} className="text-caption font-semibold uppercase tracking-wide text-fg-secondary outline-none">
                {item.detail.language === "hi" ? "Hindi (हिन्दी)" : "English"}
              </h1>
              <p className="whitespace-pre-wrap text-body-lg text-fg">{item.detail.stem}</p>
              <div>
                <p className="text-caption font-semibold uppercase tracking-wide text-fg-secondary">{item.detail.language === "hi" ? "English" : "Hindi (हिन्दी)"}</p>
                {item.otherLanguageStem ? (
                  <p lang={item.detail.language === "hi" ? "en" : "hi"} className="mt-1 whitespace-pre-wrap text-body text-fg">
                    {item.otherLanguageStem}
                  </p>
                ) : (
                  <p className="mt-1 text-body-sm text-fg-secondary">No {item.detail.language === "hi" ? "English" : "Hindi"} version linked yet.</p>
                )}
              </div>
            </section>

            <ul className="flex flex-col gap-2" aria-label="Options">
              {item.detail.options.map((o) => {
                const key = o.key === item.detail.correctKey;
                return (
                  <li key={o.key} className={cn("flex items-start gap-3 rounded-control border px-3 py-2", key ? "border-success-600 bg-success-50" : "border-line")}>
                    <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full text-body-sm font-bold", key ? "bg-success-600 text-white" : "bg-ink-100 text-fg")}>{o.key}</span>
                    <span className="flex-1 text-body">{o.text}</span>
                    {key && <span className="text-caption font-semibold text-success-700">Answer key</span>}
                  </li>
                );
              })}
            </ul>

            <section aria-labelledby="focus-expl">
              <h2 id="focus-expl" className="text-caption font-semibold uppercase tracking-wide text-fg-secondary">
                Explanation
              </h2>
              <p className="mt-1 whitespace-pre-wrap text-body text-fg">{item.detail.explanationMd || "No explanation stored."}</p>
            </section>

            <section aria-labelledby="focus-checks" className="rounded-card border border-line p-4">
              <h2 id="focus-checks" className="text-caption font-semibold uppercase tracking-wide text-fg-secondary">
                Auto checks
              </h2>
              <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                {item.checks.map((c) => (
                  <li key={c.id} className="flex items-start gap-2 text-body-sm" data-check={c.id} data-ok={c.ok ? "1" : "0"}>
                    {c.ok ? (
                      <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success-600" />
                    ) : c.blocking ? (
                      <XCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-danger-600" />
                    ) : (
                      <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning-600" />
                    )}
                    <span>
                      <span className="font-semibold">{c.label}</span>
                      <span className="sr-only">{c.ok ? ": passed" : c.blocking ? ": failed" : ": warning"}</span>
                      {!c.ok && <span className="block text-fg-secondary">{c.reason}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section aria-labelledby="focus-confirm" className="rounded-card bg-ink-50 p-4">
              <h2 id="focus-confirm" className="sr-only">
                Reviewer confirmation
              </h2>
              <label className="flex min-h-11 items-center gap-3 text-body font-semibold">
                <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="size-5 accent-primary-700" />I checked all 6
              </label>
              <ol className="mt-1 list-decimal pl-11 text-body-sm text-fg-secondary">
                {QF_REVIEW_CHECKLIST_ITEMS.map((i) => (
                  <li key={i.id}>{i.label}</li>
                ))}
              </ol>
            </section>

            {blocking.length > 0 && (
              <p role="alert" className="rounded-control border border-danger-600 bg-danger-50 px-3 py-2 text-body-sm text-danger-700">
                Approve is blocked: {blocking.map((b) => b.reason).join(" ")}
              </p>
            )}
            {actionError && (
              <p role="alert" className="rounded-control border border-danger-600 bg-danger-50 px-3 py-2 text-body-sm text-danger-700">
                {actionError}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={approve} disabled={!canApprove} aria-describedby={!confirmed ? "approve-why" : undefined}
                className="focus-ring inline-flex min-h-12 items-center gap-2 rounded-control bg-primary-700 px-5 text-body font-semibold text-white hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-50">
                <CheckCircle2 aria-hidden="true" className="size-5" /> Approve <kbd className="rounded border border-white/60 px-1 text-caption">A</kbd>
              </button>
              <button type="button" onClick={() => setDialog("reject")} className="focus-ring inline-flex min-h-12 items-center gap-2 rounded-control border border-line px-4 text-body font-semibold text-danger-700 hover:bg-danger-50">
                <XCircle aria-hidden="true" className="size-5" /> Reject <kbd className="rounded border border-current px-1 text-caption">R</kbd>
              </button>
              <button type="button" onClick={() => setDialog("edit")} className="focus-ring inline-flex min-h-12 items-center gap-2 rounded-control border border-line px-4 text-body font-semibold text-fg hover:bg-ink-50">
                <Pencil aria-hidden="true" className="size-5" /> Edit <kbd className="rounded border border-current px-1 text-caption">E</kbd>
              </button>
              <span className="ml-auto flex gap-2">
                <button type="button" onClick={prev} disabled={idx === 0} className="focus-ring inline-flex min-h-12 items-center gap-1 rounded-control px-3 text-body-sm font-semibold text-link hover:bg-ink-50 disabled:opacity-50">
                  <ChevronLeft aria-hidden="true" className="size-4" /> Previous <kbd className="rounded border border-current px-1 text-caption">K</kbd>
                </button>
                <button type="button" onClick={next} disabled={idx >= queue.length - 1} className="focus-ring inline-flex min-h-12 items-center gap-1 rounded-control px-3 text-body-sm font-semibold text-link hover:bg-ink-50 disabled:opacity-50">
                  Skip <kbd className="rounded border border-current px-1 text-caption">J</kbd> <ChevronRight aria-hidden="true" className="size-4" />
                </button>
              </span>
            </div>
            {!confirmed && (
              <p id="approve-why" className="text-caption text-fg-secondary">
                Tick “I checked all 6” to approve.
              </p>
            )}
          </article>
        )}

        <dl className={cn("grid grid-cols-3 gap-2 rounded-card p-3 text-center", onDark ? "bg-white/10" : "bg-surface")} aria-label="This session">
          <div>
            <dt className="text-caption">Approved</dt>
            <dd className="text-h3 font-bold tabular-nums">{session.approved}</dd>
          </div>
          <div>
            <dt className="text-caption">Rejected</dt>
            <dd className="text-h3 font-bold tabular-nums">{session.rejected}</dd>
          </div>
          <div>
            <dt className="text-caption">Avg time</dt>
            <dd className="text-h3 font-bold tabular-nums">{avg === null ? "–" : `${avg} s`}</dd>
          </div>
        </dl>
      </div>

      <dialog ref={rejectRef} aria-labelledby="reject-title" onClose={() => setDialog(null)} className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-panel bg-surface p-5 text-fg backdrop:bg-ink-950/60">
        <h2 id="reject-title" className="text-h3 font-bold">
          Reject this question
        </h2>
        <label htmlFor="reject-reason" className="mt-3 block text-body-sm font-semibold">
          Reason (required)
        </label>
        <textarea id="reject-reason" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={4} className="focus-ring mt-1 w-full rounded-control border border-line p-2 text-body" />
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={() => setDialog(null)} className="focus-ring min-h-11 rounded-control px-4 text-body-sm font-semibold text-link hover:bg-ink-50">
            Cancel
          </button>
          <button type="button" onClick={reject} disabled={!rejectReason.trim() || isPending} className="focus-ring min-h-11 rounded-control bg-danger-600 px-4 text-body-sm font-semibold text-white hover:bg-danger-700 disabled:opacity-50">
            Reject
          </button>
        </div>
      </dialog>

      <dialog ref={editRef} aria-labelledby="edit-title" onClose={() => setDialog(null)} className="m-0 ml-auto h-dvh max-h-none w-[min(40rem,100vw)] overflow-y-auto bg-surface p-5 text-fg backdrop:bg-ink-950/60">
        <div className="flex items-center justify-between gap-2">
          <h2 id="edit-title" className="text-h3 font-bold">
            Edit this question
          </h2>
          <button type="button" onClick={() => setDialog(null)} aria-label="Close the editor" className="focus-ring inline-flex size-11 items-center justify-center rounded-control hover:bg-ink-50">
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>
        <p className="mt-1 text-body-sm text-fg-secondary">Saving records your note as “changes requested”, re-runs the quality gates and sends the question back to the review queue.</p>
        <label htmlFor="edit-notes" className="mt-3 block text-body-sm font-semibold">
          What did you change? (required)
        </label>
        <textarea id="edit-notes" value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={2} className="focus-ring mt-1 w-full rounded-control border border-line p-2 text-body" />
        {item && dialog === "edit" && (
          <div className="mt-3">
            {editNotes.trim() ? (
              <DraftEditor detail={item.detail} onCancel={() => setDialog(null)} onSave={saveEdit} isPending={isPending} />
            ) : (
              <p className="text-body-sm text-fg-secondary">Write the note first; the editor opens below it.</p>
            )}
          </div>
        )}
      </dialog>
    </div>
  );
}

function Empty({ onDark, title, body }: { onDark: boolean; title: string; body: string }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-panel bg-surface p-6 text-fg">
      <h1 className="text-h2 font-bold">{title}</h1>
      <p className="text-body text-fg-secondary">{body}</p>
      <Link href="/admin" className={cn("inline-flex min-h-11 items-center rounded-control bg-primary-700 px-4 text-body-sm font-semibold text-white hover:bg-primary-800", onDark ? "focus-ring" : "focus-ring")}>
        Back to Today
      </Link>
    </div>
  );
}
