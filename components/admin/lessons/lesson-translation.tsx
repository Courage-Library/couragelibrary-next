"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { StudioPageHeader, StudioPanel, studioControl, studioPrimaryAction, studioQuietAction } from "@/components/admin/studio/studio-page";
import { LessonBlocksRenderer, PlainMath } from "@/components/learning/lesson-blocks-renderer";
import type { BlockError } from "@/lib/lessons/blocks";
import { parseTranslationPaste, type TranslationPaste } from "@/lib/prompts/translate-prompt";
import type { LessonTranslationData } from "@/lib/lessons/admin-types";
import { publishLessonAction, saveTranslationDraftAction } from "@/app/admin/lessons/actions";

/**
 * CA-4 translation (Studio template; English UI per R9 / decision #85 — the second-language text is CONTENT, shown in
 * marked content displays): 1 copy the TRANSLATE_HI prompt built from the published English lesson → 2 paste the
 * answer → Check (block rules + STRUCTURE PARITY: same blocks, formulas, answers, numbers; the checked paste is shown in
 * the review before saving) → Save draft → 3 review the lesson block by block, EN | HI side by side → Publish. The database re-checks parity and the English master.
 */

const NO_LINKS = { nodes: {}, images: {} };

export function LessonTranslation({ data, loadError }: { data: LessonTranslationData | null; loadError: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [paste, setPaste] = useState("");
  const [result, setResult] = useState<TranslationPaste | null>(null);
  const [serverErrors, setServerErrors] = useState<BlockError[]>([]);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);

  if (!data) {
    return (
      <div className="space-y-5">
        <StudioPageHeader title="Lesson translation" />
        <p role="alert" className="rounded-card border border-danger-200 bg-danger-50 px-4 py-3 text-[13px] font-semibold text-danger-800">
          {loadError || "Could not load the lesson."}
        </p>
      </div>
    );
  }

  const en = data.en;
  const hi = data.hi;
  const canPublish = Boolean(hi && hi.source === "DRAFT" && !hi.outdated && !pending);

  const check = () => {
    setMessage(null);
    setServerErrors([]);
    setResult(en ? parseTranslationPaste(paste, en.blocks) : null);
  };

  const save = () =>
    start(async () => {
      const r = await saveTranslationDraftAction(data.documentId, paste);
      if (r.success) {
        setMessage({ kind: "ok", text: "Translation draft saved. Review it below, block by block, then publish." });
        setPaste("");
        setResult(null);
        router.refresh();
      } else {
        setMessage({ kind: "error", text: r.error });
        if ("errors" in r && r.errors) setServerErrors(r.errors);
      }
    });

  const publish = () =>
    start(async () => {
      if (!hi) return;
      const r = await publishLessonAction(data.documentId, hi.versionId);
      setConfirmPublish(false);
      if (r.success) {
        setMessage({ kind: "ok", text: `Translation v${hi.versionNumber} published.` });
        router.refresh();
      } else setMessage({ kind: "error", text: r.error });
    });

  const copy = async () => {
    if (!data.prompt) return;
    try {
      await navigator.clipboard.writeText(data.prompt);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const errors = result && !result.ok ? result.errors : serverErrors;
  // the review shows a checked (not yet saved) paste first, else the saved draft / published translation
  const review = result?.ok ? { blocks: result.blocks, label: "Checked, not saved yet" } : hi ? { blocks: hi.blocks, label: null } : null;

  return (
    <div className="space-y-5">
      <StudioPageHeader
        title="Lesson translation"
        description={`${en ? en.meta.title : data.slug} · EN | HI. The translation keeps the English structure exactly: same blocks, formulas, answers and numbers.`}
        primary={
          <button type="button" className={studioPrimaryAction} disabled={!canPublish} onClick={confirmPublish ? publish : () => setConfirmPublish(true)}>
            {pending ? "Publishing…" : confirmPublish ? "Confirm publish" : "Publish translation"}
          </button>
        }
        actions={
          <>
            {confirmPublish && (
              <button type="button" className={studioQuietAction} onClick={() => setConfirmPublish(false)}>
                Cancel
              </button>
            )}
            <Link href={`/admin/lessons/${data.documentId}`} className={studioQuietAction}>
              English editor
            </Link>
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

      {!en ? (
        <StudioPanel>
          <p className="text-[13px] text-fg-secondary">Publish the English lesson first; the translation starts from the published English version.</p>
        </StudioPanel>
      ) : (
        <>
          <StudioPanel aria-labelledby="tr-step-1">
            <h2 id="tr-step-1" className="mb-1 text-[15px] font-bold text-fg">
              1. Prompt
            </h2>
            <p className="mb-2 text-[13px] text-fg-secondary">
              From English v{en.versionNumber} · template TRANSLATE_HI {data.templateVersion ? `v${data.templateVersion}` : "(built-in)"} · glossary of exam terms included.
            </p>
            <label htmlFor="tr-prompt" className="sr-only">
              Prompt
            </label>
            <textarea id="tr-prompt" readOnly value={data.prompt || ""} rows={8} className={`${studioControl} min-h-40 py-2 font-mono text-[12px]`} />
            <div className="mt-2 flex items-center gap-2">
              <button type="button" onClick={copy} className={studioQuietAction}>
                Copy prompt
              </button>
              {copied && <span className="text-[13px] text-success-700">Copied.</span>}
            </div>
          </StudioPanel>

          <StudioPanel aria-labelledby="tr-step-2">
            <h2 id="tr-step-2" className="mb-1 text-[15px] font-bold text-fg">
              2. Paste the answer
            </h2>
            <label htmlFor="tr-paste" className="mb-1 block text-[13px] text-fg-secondary">
              Hindi lesson JSON (contract LESSON_BLOCKS v2 hi)
            </label>
            <textarea
              id="tr-paste"
              lang="hi"
              data-content-field="lesson-translation-json"
              value={paste}
              onChange={(e) => (setPaste(e.target.value), setResult(null))}
              rows={8}
              className={`${studioControl} min-h-40 py-2 font-mono text-[12px]`}
            />
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <button type="button" onClick={check} disabled={!paste.trim()} className={studioQuietAction}>
                Check
              </button>
              <button type="button" onClick={save} disabled={!result?.ok || pending} className={studioQuietAction}>
                {pending ? "Saving…" : "Save translation draft"}
              </button>
              {result?.ok && <span className="text-[13px] text-success-700">Structure matches the English lesson: {result.blocks.length} block(s).</span>}
            </div>
            {errors.length > 0 && (
              <ul className="mt-3 space-y-1 rounded-card border border-danger-200 bg-danger-50 px-4 py-3 text-[13px] text-danger-800" aria-label="Problems in the pasted translation">
                {errors.slice(0, 30).map((e, i) => (
                  <li key={i}>
                    <span className="font-mono">{e.path}</span> — {e.message}
                  </li>
                ))}
              </ul>
            )}
          </StudioPanel>

          <StudioPanel aria-labelledby="tr-review">
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <h2 id="tr-review" className="text-[15px] font-bold text-fg">
                3. Review EN | HI
              </h2>
              {review?.label ? (
                <span className="text-[13px] font-semibold text-warning-700">{review.label}</span>
              ) : hi ? (
                <span className="text-[13px] text-fg-secondary">
                  {hi.source === "DRAFT" ? `Draft v${hi.versionNumber}` : `Published v${hi.versionNumber}`}
                  {hi.outdated ? " · from an older English version: save the translation again" : ""}
                </span>
              ) : (
                <span className="text-[13px] text-fg-secondary">No translation yet.</span>
              )}
            </div>
            {review && (
              <ol className="space-y-3" aria-label="Blocks side by side">
                {en.blocks.map((b, i) => {
                  const h = review.blocks[i];
                  return (
                    <li key={b.id} className="grid gap-3 rounded-card border border-line p-3 md:grid-cols-2">
                      <div>
                        <p className="mb-1 font-mono text-[12px] text-fg-secondary">
                          {i + 1}. {b.id} · {b.type} · EN
                        </p>
                        <LessonBlocksRenderer blocks={[b]} links={NO_LINKS} Math={PlainMath} />
                      </div>
                      <div>
                        <p className="mb-1 font-mono text-[12px] text-fg-secondary">HI</p>
                        {h && h.id === b.id ? (
                          <div lang="hi" data-content-display="lesson-translation-block">
                            <LessonBlocksRenderer blocks={[h]} links={NO_LINKS} Math={PlainMath} />
                          </div>
                        ) : (
                          <p className="text-[13px] text-danger-700">Missing: the translation does not match this block.</p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </StudioPanel>
        </>
      )}
    </div>
  );
}
