"use client";

import React, { useCallback, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { StudioEmpty, StudioField, StudioPageHeader, StudioPanel, studioControl, studioPrimaryAction, studioQuietAction } from "@/components/admin/studio/studio-page";
import { CheckButton, CheckProblems, CheckRegion, usePasteCheck } from "@/components/admin/studio/paste-check";
import { EXAM_NOTE_CONTRACT, examNoteExample, parseExamNotePaste } from "@/lib/lessons/exam-note";
import { publishExamNoteAction, saveExamNoteDraftAction } from "@/app/admin/lessons/actions";

interface NoteRow {
  id: string;
  nodeId: string;
  language: "en" | "hi";
  version: number;
  status: "DRAFT" | "PUBLISHED" | "RETIRED";
  title: string;
  publishedAt: string | null;
  updatedAt: string;
}

type Checked = { ok: boolean; errors: { path: string; message: string }[]; notice: string | null; blocks: number } | null;

/**
 * CA-7 exam notes: pick an exam and one of its mapped nodes; paste the English note (EXAM_NOTE v1 = lesson blocks), Check
 * (the shared GEN-CHECK-1 check), save the draft (the page's one primary), then publish it. The HI translation is a
 * separate marked content field (#85: no language switch), open once the English note is published.
 */
export function ExamNotesEditor({
  exams,
  examId,
  nodes,
  notes,
  loadError,
}: {
  exams: { id: string; title: string }[];
  examId: string | null;
  nodes: { id: string; name: string; nodeType: string }[];
  notes: NoteRow[];
  loadError: string | null;
}) {
  const router = useRouter();
  const [nodeId, setNodeId] = useState(nodes[0]?.id ?? "");
  const [pasteEn, setPasteEn] = useState("");
  const [pasteHi, setPasteHi] = useState("");
  const [checkedEn, setCheckedEn] = useState<Checked>(null);
  const [checkedHi, setCheckedHi] = useState<Checked>(null);
  // the field the header's "Save draft" saves: the last one checked successfully
  const [target, setTarget] = useState<"en" | "hi" | null>(null);
  const [exception, setException] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const onException = useCallback((m: string) => setException(m), []);
  const en = usePasteCheck(onException);
  const hi = usePasteCheck(onException);
  const exam = exams.find((e) => e.id === examId) ?? null;
  const node = nodes.find((n) => n.id === nodeId) ?? null;
  const forNode = useMemo(() => notes.filter((n) => n.nodeId === nodeId), [notes, nodeId]);
  const pick = (lang: "en" | "hi", status: NoteRow["status"]) => forNode.find((n) => n.language === lang && n.status === status) ?? null;
  const enPublished = pick("en", "PUBLISHED");
  const example = useMemo(() => JSON.stringify(examNoteExample(exam?.title ?? "the exam", node?.name ?? "this topic"), null, 2), [exam, node]);

  const runCheck = (lang: "en" | "hi") =>
    (lang === "en" ? en : hi).run(() => {
      setException(null);
      setMessage(null);
      const r = parseExamNotePaste(lang === "en" ? pasteEn : pasteHi);
      const result: Checked = r.ok ? { ok: true, errors: [], notice: r.notice, blocks: r.blocks.length } : { ok: false, errors: r.errors, notice: null, blocks: 0 };
      if (lang === "en") setCheckedEn(result);
      else setCheckedHi(result);
      setTarget(r.ok ? lang : null);
    });

  const save = () =>
    start(async () => {
      if (!examId || !nodeId || !target) return;
      const r = await saveExamNoteDraftAction(examId, nodeId, target, target === "en" ? pasteEn : pasteHi);
      if (r.success) {
        setMessage({ kind: "ok", text: `${target === "en" ? "EN" : "HI"} draft saved (version ${r.data.version}).` });
        if (target === "en") (setPasteEn(""), setCheckedEn(null));
        else (setPasteHi(""), setCheckedHi(null));
        setTarget(null);
        router.refresh();
      } else setMessage({ kind: "error", text: "errors" in r && Array.isArray(r.errors) && r.errors.length ? `${r.error} ${r.errors[0].path} — ${r.errors[0].message}` : r.error });
    });

  const publish = (row: NoteRow) =>
    start(async () => {
      const r = await publishExamNoteAction(row.id);
      if (r.success) {
        setMessage({ kind: "ok", text: `${row.language === "en" ? "EN" : "HI"} version ${row.version} published.` });
        router.refresh();
      } else setMessage({ kind: "error", text: r.error });
    });

  const status = (lang: "en" | "hi") => {
    const p = pick(lang, "PUBLISHED");
    const d = pick(lang, "DRAFT");
    return (
      <p className="text-[13px] text-fg-secondary">
        {lang === "en" ? "EN" : "HI"}: {p ? `published version ${p.version} — “${p.title}”.` : "not published."} {d ? `Draft version ${d.version}.` : ""}{" "}
        {d && (
          <button type="button" onClick={() => publish(d)} disabled={pending} className={`${studioQuietAction} border border-primary-700`}>
            Publish draft version {d.version}
          </button>
        )}
      </p>
    );
  };

  const result = (checked: Checked) => (
    <>
      {checked?.ok && (
        <p className="mt-3 rounded-card border border-success-200 bg-success-50 px-4 py-3 text-[13px] text-success-800">
          {checked.notice && <span className="block text-fg">{checked.notice}</span>}
          The note is valid: {checked.blocks} block(s). Save it as a draft with the button at the top.
        </p>
      )}
      {checked && !checked.ok && <CheckProblems errors={checked.errors} title="Problems in the pasted note" />}
    </>
  );

  return (
    <div className="space-y-5">
      <StudioPageHeader
        title="Exam notes"
        description="A short note per exam and node: how the exam asks it, its weightage and previous-year pattern. It appears on the exam-topic page with a link to the master lesson."
        primary={
          <button type="button" onClick={save} disabled={pending || !target || !nodeId} className={studioPrimaryAction}>
            {pending ? "Saving…" : "Save draft"}
          </button>
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
          <Link key={e.id} href={`/admin/exams/notes?exam=${e.id}`} aria-current={e.id === examId ? "page" : undefined} className={`inline-flex min-h-10 items-center rounded-control border px-3 text-[13px] font-semibold ${e.id === examId ? "border-primary-700 bg-primary-50 text-primary-800" : "border-line text-fg hover:bg-ink-50"}`}>
            {e.title}
          </Link>
        ))}
      </nav>
      {!nodes.length ? (
        <StudioEmpty title="No mapped nodes" body="This exam has no published syllabus mapped to the master tree yet." action="Coverage and launch" href="/admin/coverage" />
      ) : (
        <>
          <StudioPanel>
            <StudioField label="Node" htmlFor="note-node">
              <select id="note-node" value={nodeId} onChange={(e) => (setNodeId(e.target.value), setCheckedEn(null), setCheckedHi(null), setTarget(null))} className={studioControl}>
                {nodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name} ({n.nodeType.toLowerCase()})
                  </option>
                ))}
              </select>
            </StudioField>
            <div className="mt-3 space-y-1">
              {status("en")}
              {status("hi")}
            </div>
            {exception && <p className="mt-3 rounded-card border border-danger-200 bg-danger-50 px-4 py-3 text-[13px] font-semibold text-danger-800">{exception}</p>}
          </StudioPanel>

          <StudioPanel>
            <label htmlFor="note-paste" className="block text-[13px] font-semibold text-fg">
              English note JSON (contract {EXAM_NOTE_CONTRACT})
            </label>
            <textarea id="note-paste" value={pasteEn} onChange={(e) => (setPasteEn(e.target.value), setCheckedEn(null), setTarget(null))} rows={10} className={`${studioControl} mt-1 min-h-48 py-2 font-mono text-[12px]`} />
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <CheckButton busy={en.busy} disabled={!pasteEn.trim()} onClick={() => runCheck("en")} />
            </div>
            <CheckRegion regionRef={en.regionRef}>{result(checkedEn)}</CheckRegion>
            <details className="mt-4">
              <summary className="cursor-pointer text-[13px] font-semibold text-link">Example of the shape</summary>
              <pre className="mt-2 overflow-x-auto rounded-card bg-ink-50 p-3 text-[12px]">{example}</pre>
            </details>
          </StudioPanel>

          <StudioPanel>
            {enPublished ? (
              <>
                <label htmlFor="note-paste-hi" className="block text-[13px] font-semibold text-fg">
                  Hindi note JSON (the same blocks, translated; contract {EXAM_NOTE_CONTRACT})
                </label>
                <textarea
                  id="note-paste-hi"
                  lang="hi"
                  data-content-field="exam-note-json"
                  value={pasteHi}
                  onChange={(e) => (setPasteHi(e.target.value), setCheckedHi(null), setTarget(null))}
                  rows={8}
                  className={`${studioControl} mt-1 min-h-40 py-2 font-mono text-[12px]`}
                />
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <CheckButton busy={hi.busy} disabled={!pasteHi.trim()} onClick={() => runCheck("hi")} />
                </div>
                <CheckRegion regionRef={hi.regionRef}>{result(checkedHi)}</CheckRegion>
              </>
            ) : (
              <p className="text-[13px] text-fg-secondary">The HI translation opens once the English note is published.</p>
            )}
          </StudioPanel>
        </>
      )}
    </div>
  );
}
