"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { StudioEmpty, StudioPageHeader, StudioPanel, StudioStatStrip, studioPrimaryAction, studioQuietAction } from "@/components/admin/studio/studio-page";
import { setCourseLaunchAction } from "@/app/admin/lessons/actions";
import type { CoverageExam, CoverageView } from "@/lib/learning/coverage";

/**
 * CA-7 coverage matrix + launch (design H). One primary per screen (R4): "Launch course" (or "Pause course" when LIVE),
 * always behind a confirmation that states what changes. "Build next" opens the lesson generator for a missing node.
 */
export function CoverageMatrix({ exams, view, loadError }: { exams: CoverageExam[]; view: CoverageView | null; loadError: string | null }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const live = view?.exam.launch?.status === "LIVE";
  const target = live ? "PAUSED" : "LIVE";

  const apply = () =>
    start(async () => {
      setMessage(null);
      if (!view) return;
      const r = await setCourseLaunchAction(view.exam.id, target);
      setConfirm(false);
      if (r.success) {
        setMessage({ kind: "ok", text: target === "LIVE" ? `${view.exam.title}: the course is live.` : `${view.exam.title}: the course is paused.` });
        router.refresh();
      } else setMessage({ kind: "error", text: r.error });
    });

  const c = view?.coverage;
  return (
    <div className="space-y-5">
      <StudioPageHeader
        title="Coverage and launch"
        description="Per exam: how much of its mapped syllabus has a published lesson. Launching shows the exam course and applies lesson access; pausing hides it again."
        primary={
          view && view.state === "OK" ? (
            <button type="button" className={studioPrimaryAction} disabled={pending} onClick={() => setConfirm(true)}>
              {live ? "Pause course" : "Launch course"}
            </button>
          ) : undefined
        }
      />
      {loadError && <p className="rounded-card border border-danger-200 bg-danger-50 px-4 py-3 text-[13px] text-danger-800">{loadError}</p>}
      {message && (
        <p role="status" className={`rounded-card border px-4 py-3 text-[13px] ${message.kind === "ok" ? "border-success-200 bg-success-50 text-success-800" : "border-danger-200 bg-danger-50 text-danger-800"}`}>
          {message.text}
        </p>
      )}

      <nav aria-label="Exams" className="flex flex-wrap gap-2">
        {exams.map((e) => (
          <Link
            key={e.id}
            href={`/admin/lessons/coverage?exam=${e.id}`}
            aria-current={view?.exam.id === e.id ? "page" : undefined}
            className={`inline-flex min-h-10 items-center gap-2 rounded-control border px-3 text-[13px] font-semibold ${view?.exam.id === e.id ? "border-primary-700 bg-primary-50 text-primary-800" : "border-line text-fg hover:bg-ink-50"}`}
          >
            {e.title}
            {e.launch && <span className={`rounded-full px-1.5 text-[11px] ${e.launch.status === "LIVE" ? "bg-success-100 text-success-800" : "bg-ink-100 text-fg-secondary"}`}>{e.launch.status === "LIVE" ? "Live" : "Paused"}</span>}
          </Link>
        ))}
      </nav>

      {confirm && view && (
        <StudioPanel role="alertdialog" aria-labelledby="launch-confirm-title" className="border-warning-200 bg-warning-50">
          <h2 id="launch-confirm-title" className="text-[15px] font-bold text-fg">
            {target === "LIVE" ? `Launch the ${view.exam.title} course?` : `Pause the ${view.exam.title} course?`}
          </h2>
          <p className="mt-1 text-[13px] text-fg">
            {target === "LIVE"
              ? `Students will see the exam course, its path and progress. Lessons after the free ones in each chapter become Pro. Coverage now: ${c?.en ?? 0} of ${c?.total ?? 0} nodes (${c?.enPercent ?? 0}%) in English.`
              : "The exam course disappears for students and its lessons become free standalone articles again. Progress is kept."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={studioQuietAction} onClick={() => setConfirm(false)} disabled={pending}>
              Cancel
            </button>
            <button type="button" className={`${studioQuietAction} border border-primary-700`} onClick={apply} disabled={pending} aria-busy={pending}>
              {pending ? "Saving…" : target === "LIVE" ? "Confirm launch" : "Confirm pause"}
            </button>
          </div>
        </StudioPanel>
      )}

      {!view ? (
        <StudioEmpty title="No exams yet" body="Add an exam and publish its syllabus first." />
      ) : view.state === "NO_SYLLABUS" ? (
        <StudioEmpty title="No published syllabus" body={`${view.exam.title} has no published syllabus, so there is nothing to cover yet.`} action="Syllabus intake" href="/admin/syllabus/intake" />
      ) : (
        <>
          <StudioStatStrip
            label="Coverage"
            stats={[
              { key: "total", label: "Mapped nodes", value: c?.total ?? 0, tone: "blue" },
              { key: "en", label: `EN ${c?.enPercent ?? 0}%`, value: c?.en ?? 0, tone: "green" },
              { key: "hi", label: `HI ${c?.hiPercent ?? 0}%`, value: c?.hi ?? 0, tone: "teal" },
              { key: "missing", label: "Missing", value: c?.missing.length ?? 0, tone: "orange" },
            ]}
          />
          <p className="text-[13px] text-fg-secondary">
            {view.cycleYear ? `Syllabus cycle ${view.cycleYear}.` : "Exam-wide syllabus."} {c && c.excludedInternal > 0 ? `${c.excludedInternal} internal node(s) are not counted.` : ""}
            {view.exam.launch ? ` Last change ${new Date(view.exam.launch.changedAt).toISOString().slice(0, 16).replace("T", " ")} UTC.` : " Not launched."}
          </p>
          <StudioPanel>
            <h2 className="text-[15px] font-bold text-fg">Build next</h2>
            {c && c.missing.length === 0 ? (
              <p className="mt-1 text-[13px] text-fg-secondary">Every mapped node has a published English lesson.</p>
            ) : (
              <ul className="mt-2 divide-y divide-line" aria-label="Nodes without a published English lesson">
                {c?.missing.slice(0, 50).map((r) => (
                  <li key={r.nodeId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="min-w-0 text-[14px] text-fg">
                      <span className="mr-2 text-[11px] font-semibold uppercase text-fg-secondary">{r.nodeType}</span>
                      {r.name}
                      {r.weightageTier && <span className="ml-2 text-[12px] text-fg-secondary">{r.weightageTier.replace("_", " ").toLowerCase()}</span>}
                    </span>
                    <Link href={`/admin/lessons/generate?node=${r.nodeId}`} className={studioQuietAction}>
                      Build lesson
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </StudioPanel>
          <StudioPanel>
            <h2 className="text-[15px] font-bold text-fg">All mapped nodes</h2>
            <table className="mt-2 w-full text-left text-[13px]">
              <caption className="sr-only">Lesson coverage per mapped node</caption>
              <thead>
                <tr className="border-b border-line text-fg-secondary">
                  <th scope="col" className="py-2 pr-3 font-semibold">Node</th>
                  <th scope="col" className="py-2 pr-3 font-semibold">Weightage</th>
                  <th scope="col" className="py-2 pr-3 font-semibold">EN</th>
                  <th scope="col" className="py-2 font-semibold">HI</th>
                </tr>
              </thead>
              <tbody>
                {c?.rows.map((r) => (
                  <tr key={r.nodeId} className="border-b border-line last:border-0">
                    <td className="py-2 pr-3 text-fg">{r.name}</td>
                    <td className="py-2 pr-3 text-fg-secondary">{r.weightageTier ? r.weightageTier.replace("_", " ").toLowerCase() : "—"}</td>
                    <td className="py-2 pr-3">{r.en ? <span className="text-success-700">Published</span> : <span className="text-warning-800">Missing</span>}</td>
                    <td className="py-2">{r.hi ? <span className="text-success-700">Published</span> : <span className="text-fg-secondary">Not yet</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </StudioPanel>
        </>
      )}
    </div>
  );
}
