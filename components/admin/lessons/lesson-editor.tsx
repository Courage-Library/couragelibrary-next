"use client";

import React, { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { StatusChip } from "@/components/admin/status-chip";
import { StudioPageHeader, StudioPanel, studioControl, studioPrimaryAction, studioQuietAction } from "@/components/admin/studio/studio-page";
import { LessonBlocksRenderer, PlainMath } from "@/components/learning/lesson-blocks-renderer";
import { validateLesson, type BlockError, type LessonBlock, type LessonMeta } from "@/lib/lessons/blocks";
import type { LessonEditorData } from "@/lib/lessons/admin-types";
import { publishLessonAction, saveLessonDraftAction } from "@/app/admin/lessons/actions";

/**
 * CA-3 lesson editor (Studio template): the lesson as JSON { meta, blocks } (LessonBlocksSpec v2) → Check (the same
 * validator as the database) → Save draft → Preview (the student renderer) → Publish. CA-4 adds the prompt flow.
 */

const STARTER = {
  meta: { title: "Lesson title", estimated_minutes: 10 },
  blocks: [
    { id: "intro", type: "heading", level: 2, text: "Introduction" },
    { id: "p1", type: "paragraph", text: "Write the explanation here. **Bold**, *italic*, `code` and $x^2$ are allowed." },
  ],
};

const NO_LINKS = { nodes: {}, images: {} };

export function LessonEditor({ data, loadError }: { data: LessonEditorData | null; loadError: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const initial = useMemo(() => JSON.stringify(data?.meta && data?.blocks ? { meta: data.meta, blocks: data.blocks } : STARTER, null, 2), [data]);
  const [json, setJson] = useState(initial);
  const [errors, setErrors] = useState<BlockError[]>([]);
  const [preview, setPreview] = useState<{ meta: LessonMeta; blocks: LessonBlock[] } | null>(data?.meta && data?.blocks ? { meta: data.meta, blocks: data.blocks } : null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [confirmPublish, setConfirmPublish] = useState(false);

  if (!data) {
    return (
      <div className="space-y-5">
        <StudioPageHeader title="Edit lesson" />
        <p role="alert" className="rounded-card border border-danger-200 bg-danger-50 px-4 py-3 text-[13px] font-semibold text-danger-800">
          {loadError || "Could not load the lesson."}
        </p>
      </div>
    );
  }

  const check = (): boolean => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      setErrors([{ path: "$", code: "JSON", message: "This is not valid JSON." }]);
      setPreview(null);
      return false;
    }
    const o = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as { meta?: unknown; blocks?: unknown }) : {};
    const v = validateLesson(o.meta, o.blocks);
    if (!v.ok) {
      setErrors(v.errors);
      setPreview(null);
      return false;
    }
    setErrors([]);
    setPreview({ meta: v.meta, blocks: v.blocks });
    return true;
  };

  const save = () => {
    if (!check()) return;
    start(async () => {
      const r = await saveLessonDraftAction(data.document.id, data.language, json);
      if (r.success) {
        setMessage({ kind: "ok", text: `Draft saved (version ${r.data.versionNumber}).` });
        router.refresh();
      } else {
        setMessage({ kind: "error", text: r.error });
        if ("errors" in r && r.errors) setErrors(r.errors);
      }
    });
  };

  const publish = () =>
    start(async () => {
      if (!data.versionId) return;
      const r = await publishLessonAction(data.document.id, data.versionId);
      setConfirmPublish(false);
      if (r.success) {
        setMessage({ kind: "ok", text: "Published. Students now see this version." });
        router.refresh();
      } else setMessage({ kind: "error", text: r.error });
    });

  const canPublish = data.source === "DRAFT" && Boolean(data.versionId) && json === initial;

  return (
    <div className="space-y-5">
      <StudioPageHeader
        title={`Edit lesson: ${data.document.title}`}
        description={`${data.document.slug} · ${data.source === "DRAFT" ? `draft v${data.versionNumber}` : data.source === "PUBLISHED" ? `published v${data.versionNumber} (saving makes a new draft)` : data.document.currentFormat === "LEGACY_MDX" ? "legacy lesson (retired format): start the blocks version here" : "no lesson yet"}`}
        meta={<StatusChip status={data.document.status} />}
        primary={
          <button type="button" className={studioPrimaryAction} disabled={pending} onClick={save}>
            {pending ? "Saving…" : "Save draft"}
          </button>
        }
        actions={
          <>
            <button type="button" className={studioQuietAction} onClick={check} disabled={pending}>
              Check
            </button>
            <Link href="/admin/lessons" className={studioQuietAction}>
              All lessons
            </Link>
          </>
        }
      />
      <div role="status" aria-live="polite">
        {message && (
          <p className={`rounded-card border px-4 py-3 text-[13px] font-semibold ${message.kind === "ok" ? "border-success-200 bg-success-50 text-success-800" : "border-danger-200 bg-danger-50 text-danger-800"}`}>{message.text}</p>
        )}
      </div>

      {data.source === "DRAFT" && (
        <StudioPanel>
          {confirmPublish ? (
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              <span>Publish draft v{data.versionNumber}? Students see it at once; it can no longer change.</span>
              <button type="button" disabled={pending} onClick={publish} className={studioQuietAction}>
                Confirm publish
              </button>
              <button type="button" onClick={() => setConfirmPublish(false)} className={studioQuietAction}>
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3 text-[13px] text-fg-secondary">
              <button type="button" disabled={!canPublish || pending} onClick={() => setConfirmPublish(true)} className={studioQuietAction}>
                Publish draft v{data.versionNumber}…
              </button>
              {!canPublish && <span>Save your changes first; the saved draft is what gets published.</span>}
            </div>
          )}
        </StudioPanel>
      )}

      <div className="grid gap-5 xl:grid-cols-2">
        <StudioPanel>
          <label htmlFor="lesson-json" className="mb-1 block text-[13px] font-semibold text-fg">
            Lesson JSON (meta + blocks)
          </label>
          <textarea id="lesson-json" value={json} onChange={(e) => setJson(e.target.value)} spellCheck={false} rows={28} className={`${studioControl} min-h-[32rem] py-2 font-mono text-[12px]`} />
          {errors.length > 0 && (
            <ul className="mt-3 space-y-1 rounded-card border border-danger-200 bg-danger-50 px-4 py-3 text-[13px] text-danger-800" aria-label="Problems in the lesson">
              {errors.slice(0, 40).map((e, i) => (
                <li key={i}>
                  <span className="font-mono">{e.path}</span> — {e.message}
                </li>
              ))}
            </ul>
          )}
        </StudioPanel>
        <StudioPanel aria-labelledby="preview-title">
          <h2 id="preview-title" className="mb-3 text-[15px] font-bold text-fg">
            Preview
          </h2>
          <p className="mb-3 text-[12px] text-fg-secondary">Formulas show their reading here; students see them typeset.</p>
          {preview ? (
            <>
              <p className="mb-3 text-h2 font-bold text-fg">{preview.meta.title}</p>
              <LessonBlocksRenderer blocks={preview.blocks} links={NO_LINKS} Math={PlainMath} />
            </>
          ) : (
            <p className="text-[13px] text-fg-secondary">Press Check to see the lesson as students will.</p>
          )}
        </StudioPanel>
      </div>
    </div>
  );
}
