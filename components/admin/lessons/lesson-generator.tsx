"use client";

import React, { useCallback, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { StudioEmpty, StudioField, StudioPageHeader, StudioPanel, studioControl, studioPrimaryAction, studioQuietAction } from "@/components/admin/studio/studio-page";
import { CheckButton, CheckProblems, CheckRegion, usePasteCheck } from "@/components/admin/studio/paste-check";
import { LessonBlocksRenderer, PlainMath } from "@/components/learning/lesson-blocks-renderer";
import type { BlockError } from "@/lib/lessons/blocks";
import { lessonChecklist, checklistPasses, type ChecklistItem } from "@/lib/lessons/completeness";
import { mergeLessonParts, parseLessonPart, type LessonPaste, type LessonPart } from "@/lib/prompts/lesson-prompt";
import type { LessonGeneratorData, LessonNodeOption } from "@/lib/lessons/admin-types";
import { saveGeneratedLessonAction } from "@/app/admin/lessons/actions";
import { createTaxonomyNodeAction } from "@/app/admin/taxonomy/actions";

/**
 * CA-4 / LESSON-PROMPT-2 / GEN-CHECK-1 lesson prompt generator (Studio template): 1 choose a node (its subject must have a
 * subject type) → 2 copy the LESSON prompt → 3 paste the answer (one or several parts) → Check (block rules + the
 * weightage- and type-aware checklist + flagged facts; the result is always shown in view) → Save draft → review +
 * publish in the editor. Suggested subtopics can be added to the Master tree, one confirmed click each.
 */

const NO_LINKS = { nodes: {}, images: {} };
const CHILD_LEVEL: Record<string, string | undefined> = { TOPIC: "SUBTOPIC", SUBTOPIC: "CONCEPT" };

interface Props {
  nodes: LessonNodeOption[];
  selectedNodeId: string | null;
  generator: LessonGeneratorData | null;
  loadError: string | null;
  /** LESSON-PROMPT-2 item 1: the node's subject has no subject type */
  subjectMissing: { subjectName: string | null } | null;
}

type Outcome =
  | { kind: "none" }
  | { kind: "exception"; message: string }
  | { kind: "errors"; errors: BlockError[]; notice: string | null }
  | { kind: "incomplete"; have: number[]; missing: number[]; total: number; notice: string | null }
  | { kind: "lesson"; result: Extract<LessonPaste, { ok: true }>; notice: string | null };

export function LessonGenerator({ nodes, selectedNodeId, generator, loadError, subjectMissing }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [filter, setFilter] = useState("");
  const [paste, setPaste] = useState("");
  const [parts, setParts] = useState<{ text: string; parsed: LessonPart }[]>([]);
  const [outcome, setOutcome] = useState<Outcome>({ kind: "none" });
  const [factsChecked, setFactsChecked] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string; href?: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmAdd, setConfirmAdd] = useState<string | null>(null);
  const [added, setAdded] = useState<string[]>([]);
  const onException = useCallback((m: string) => setOutcome({ kind: "exception", message: m }), []);
  const { busy, run, regionRef } = usePasteCheck(onException);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (q ? nodes.filter((n) => n.path.toLowerCase().includes(q)) : nodes).slice(0, 200);
  }, [nodes, filter]);
  const result = outcome.kind === "lesson" ? outcome.result : null;
  const checklist: ChecklistItem[] = result ? lessonChecklist(result.blocks, generator?.context.subjectType ?? null, generator?.size) : [];
  const facts = result ? result.uncertainFacts : [];
  const canSave = Boolean(selectedNodeId && result && (facts.length === 0 || factsChecked) && !pending && !busy);
  const childLevel = generator ? CHILD_LEVEL[generator.context.nodeLevel] : undefined;

  // GEN-CHECK-1: the check runs on click only; a part of a multi-part answer is kept and the rest is asked for
  const check = () =>
    run(() => {
      setMessage(null);
      setFactsChecked(false);
      const parsed = parseLessonPart(paste);
      const notice = parsed.ok ? parsed.notice : null;
      if (!parsed.ok) {
        setOutcome({ kind: "errors", errors: parsed.errors, notice: null });
        return;
      }
      const next = [...(parsed.totalParts > 1 ? parts.filter((p) => p.parsed.ok && p.parsed.part !== parsed.part && p.parsed.totalParts === parsed.totalParts) : []), { text: paste, parsed }];
      setParts(next);
      const merged = mergeLessonParts(next.map((p) => p.parsed));
      if (merged.state === "ERROR") setOutcome({ kind: "errors", errors: merged.errors, notice });
      else if (merged.state === "INCOMPLETE") {
        setOutcome({ kind: "incomplete", have: merged.have, missing: merged.missing, total: merged.totalParts, notice });
        setPaste("");
      } else if (!merged.result.ok) setOutcome({ kind: "errors", errors: merged.result.errors, notice });
      else setOutcome({ kind: "lesson", result: merged.result, notice });
    });

  const save = () =>
    start(async () => {
      if (!selectedNodeId) return;
      const r = await saveGeneratedLessonAction(selectedNodeId, parts.map((p) => p.text), factsChecked);
      if (r.success) {
        setMessage({ kind: "ok", text: `Draft saved. ${checklistPasses(r.data.checklist) ? "The checklist passes: review and publish it in the editor." : "Complete the checklist before publishing."}`, href: `/admin/lessons/${r.data.documentId}` });
        router.refresh();
      } else {
        setMessage({ kind: "error", text: r.error });
        if ("errors" in r && r.errors) setOutcome({ kind: "errors", errors: r.errors, notice: null });
      }
    });

  const addSubtopic = (name: string) =>
    start(async () => {
      if (!selectedNodeId || !childLevel) return;
      const r = await createTaxonomyNodeAction({ parentId: selectedNodeId, nodeType: childLevel, name });
      setConfirmAdd(null);
      if (r.success) {
        setAdded((a) => [...a, name]);
        setMessage({ kind: "ok", text: `"${name}" was added to the Master tree as a ${childLevel.toLowerCase()} (audited).` });
      } else setMessage({ kind: "error", text: r.error });
    });

  const copy = async () => {
    if (!generator) return;
    try {
      await navigator.clipboard.writeText(generator.prompt);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const resetParts = () => {
    setParts([]);
    setOutcome({ kind: "none" });
    setPaste("");
  };

  return (
    <div className="space-y-5">
      <StudioPageHeader
        title="Lesson prompt generator"
        description="One lesson per master-tree node. The prompt carries every published exam that asks the node; the answer is checked before it becomes a draft."
        primary={
          <button type="button" className={studioPrimaryAction} disabled={!canSave} onClick={save}>
            {pending ? "Saving…" : "Save draft"}
          </button>
        }
        actions={
          <>
            <Link href="/admin/prompts" className={studioQuietAction}>
              Prompt templates
            </Link>
            <Link href="/admin/lessons" className={studioQuietAction}>
              All lessons
            </Link>
          </>
        }
      />
      {loadError && !subjectMissing && (
        <p role="alert" className="rounded-card border border-danger-200 bg-danger-50 px-4 py-3 text-[13px] font-semibold text-danger-800">
          {loadError}
        </p>
      )}
      {subjectMissing && (
        <p role="alert" className="rounded-card border border-warning-200 bg-warning-50 px-4 py-3 text-[13px] font-semibold text-fg">
          {subjectMissing.subjectName ? `"${subjectMissing.subjectName}" has no subject type. ` : ""}Set the subject type in the Master tree first.{" "}
          <Link href="/admin/taxonomy" className="text-link underline">
            Open the Master tree
          </Link>
        </p>
      )}
      <div role="status" aria-live="polite">
        {message && (
          <p className={`rounded-card border px-4 py-3 text-[13px] font-semibold ${message.kind === "ok" ? "border-success-200 bg-success-50 text-success-800" : "border-danger-200 bg-danger-50 text-danger-800"}`}>
            {message.text}{" "}
            {message.href && (
              <Link href={message.href} className="text-link underline">
                Open the lesson
              </Link>
            )}
          </p>
        )}
      </div>

      <StudioPanel aria-labelledby="gen-step-1">
        <h2 id="gen-step-1" className="mb-3 text-[15px] font-bold text-fg">
          1. Node
        </h2>
        <StudioField label="Find a topic, subtopic or concept" htmlFor="gen-filter">
          <input id="gen-filter" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="e.g. Percentage" className={studioControl} />
        </StudioField>
        {shown.length === 0 ? (
          <StudioEmpty title="No nodes" body="Add topics in the master tree first." />
        ) : (
          <ul className="mt-3 max-h-64 divide-y divide-line overflow-y-auto rounded-card border border-line" aria-label="Nodes">
            {shown.map((n) => (
              <li key={n.id}>
                <Link
                  href={`/admin/lessons/generate?node=${n.id}`}
                  aria-current={n.id === selectedNodeId ? "true" : undefined}
                  className={`focus-ring flex min-h-10 flex-wrap items-center gap-2 px-3 py-2 text-[13px] ${n.id === selectedNodeId ? "bg-primary-50 font-semibold" : "hover:bg-ink-50"}`}
                >
                  <span className="text-[12px] font-semibold text-fg-secondary">{n.nodeType}</span>
                  <span className="text-fg">{n.path}</span>
                  {n.documentId && <span className="ml-auto text-[12px] font-semibold text-success-700">{n.documentStatus === "PUBLISHED" ? "Lesson published" : "Lesson draft"}</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </StudioPanel>

      <StudioPanel aria-labelledby="gen-step-2">
        <h2 id="gen-step-2" className="mb-1 text-[15px] font-bold text-fg">
          2. Prompt
        </h2>
        {generator ? (
          <>
            <p className="mb-2 text-[13px] text-fg-secondary">
              {generator.context.nodePath} · subject type <span className="font-semibold text-fg">{generator.context.subjectType}</span> · size {generator.size.tier} ({generator.size.minExamples}–{generator.size.maxExamples} examples, {generator.size.quickChecks} quick checks) · template LESSON{" "}
              {generator.templateVersion ? `v${generator.templateVersion}` : "(built-in)"} · {generator.context.coverage.length ? `${generator.context.coverage.length} exam unit(s)` : "no published exam maps this node yet"}
            </p>
            {generator.context.coverage.length > 0 && (
              <ul className="mb-3 space-y-0.5 text-[13px]" aria-label="Exam coverage">
                {generator.context.coverage.map((c, i) => (
                  <li key={i}>
                    <span className="font-semibold text-fg">
                      {c.exam}
                      {c.cycleYear ? ` ${c.cycleYear}` : ""}
                      {c.tier ? ` (${c.tier})` : ""}
                    </span>
                    <span className="text-fg-secondary">
                      {" "}
                      · {c.syllabusPath}
                      {c.weightageTier ? ` · ${c.weightageTier}` : ""}
                      {c.avgQuestions != null ? ` · avg ${c.avgQuestions} question(s)` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <label htmlFor="gen-prompt" className="sr-only">
              Prompt
            </label>
            <textarea id="gen-prompt" readOnly value={generator.prompt} rows={12} className={`${studioControl} min-h-56 py-2 font-mono text-[12px]`} />
            <div className="mt-2 flex items-center gap-2">
              <button type="button" onClick={copy} className={studioQuietAction}>
                Copy prompt
              </button>
              {copied && <span className="text-[13px] text-success-700">Copied.</span>}
              {generator.documentId && (
                <Link href={`/admin/lessons/${generator.documentId}`} className={studioQuietAction}>
                  Open this node&apos;s lesson
                </Link>
              )}
            </div>
          </>
        ) : (
          <p className="text-[13px] text-fg-secondary">{subjectMissing ? "Set the subject type first, then choose the node again." : "Choose a node first."}</p>
        )}
      </StudioPanel>

      <StudioPanel aria-labelledby="gen-step-3">
        <h2 id="gen-step-3" className="mb-1 text-[15px] font-bold text-fg">
          3. Paste the answer
        </h2>
        <label htmlFor="gen-paste" className="mb-1 block text-[13px] text-fg-secondary">
          The assistant&apos;s JSON (contract LESSON_BLOCKS v2). A long answer may come in parts: paste and check each part in turn.
        </label>
        <textarea id="gen-paste" value={paste} onChange={(e) => setPaste(e.target.value)} rows={10} className={`${studioControl} min-h-48 py-2 font-mono text-[12px]`} />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <CheckButton busy={busy} disabled={!paste.trim() || !generator} onClick={check} />
          {parts.length > 0 && (
            <button type="button" onClick={resetParts} className={studioQuietAction}>
              Start over
            </button>
          )}
        </div>
        <CheckRegion regionRef={regionRef}>
          {outcome.kind === "exception" && <p className="mt-3 rounded-card border border-danger-200 bg-danger-50 px-4 py-3 text-[13px] font-semibold text-danger-800">{outcome.message}</p>}
          {outcome.kind === "errors" && <CheckProblems notice={outcome.notice} errors={outcome.errors} title="Problems in the pasted lesson" />}
          {outcome.kind === "incomplete" && (
            <div className="mt-3 rounded-card border border-warning-200 bg-warning-50 px-4 py-3 text-[13px] text-fg">
              {outcome.notice && <p>{outcome.notice}</p>}
              <p className="font-semibold">
                Part {outcome.have.join(", ")} of {outcome.total} received. Part {outcome.missing.join(", ")} of {outcome.total} missing.
              </p>
              <p>Ask the assistant for the &quot;next part&quot;, paste it above and press Check.</p>
            </div>
          )}
          {outcome.kind === "lesson" && (
            <div className="mt-3 rounded-card border border-success-200 bg-success-50 px-4 py-3 text-[13px] text-success-800">
              {outcome.notice && <p className="text-fg">{outcome.notice}</p>}
              <p className="font-semibold">
                The blocks are valid: {outcome.result.blocks.length} block(s){parts.length > 1 ? ` from ${parts.length} parts` : ""}. The checklist and the preview are below.
              </p>
            </div>
          )}
        </CheckRegion>
      </StudioPanel>

      {result && (
        <div className="grid gap-5 lg:grid-cols-[22rem_1fr]">
          <StudioPanel aria-labelledby="gen-checklist">
            <h2 id="gen-checklist" className="mb-2 text-[15px] font-bold text-fg">
              Completeness checklist
            </h2>
            <ul className="space-y-1.5 text-[13px]" aria-label="Checklist">
              {checklist.map((i) => (
                <li key={i.key} className="flex items-start gap-2">
                  <span className={`mt-0.5 shrink-0 rounded border px-1.5 text-[12px] font-semibold ${i.ok ? "border-success-200 bg-success-50 text-success-800" : i.severity === "error" ? "border-danger-200 bg-danger-50 text-danger-800" : "border-warning-200 bg-warning-50 text-fg"}`}>
                    {i.ok ? "Pass" : i.severity === "error" ? "Fail" : "Warn"}
                  </span>
                  <span>
                    {i.label}
                    {i.detail && <span className="block text-fg-secondary">{i.detail}</span>}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[13px] text-fg-secondary">{checklistPasses(checklist) ? "Ready to publish after review." : "You can save the draft; publishing needs every Fail fixed."}</p>
            {facts.length > 0 && (
              <div className="mt-4 rounded-card border border-warning-200 bg-warning-50 px-3 py-2 text-[13px]">
                <p className="font-semibold text-fg">Flagged as uncertain by the assistant</p>
                <ul className="ml-4 mt-1 list-disc">
                  {facts.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
                <label className="mt-2 flex min-h-10 items-center gap-2">
                  <input type="checkbox" checked={factsChecked} onChange={(e) => setFactsChecked(e.target.checked)} className="size-4" />
                  <span>I checked these facts and corrected the lesson where needed.</span>
                </label>
              </div>
            )}
            {result.suggestedSubtopics.length > 0 && (
              <div className="mt-4 rounded-card border border-line px-3 py-2 text-[13px]">
                <p className="font-semibold text-fg">Suggested parts of this topic</p>
                <p className="text-fg-secondary">
                  {childLevel ? `Add each one to the Master tree as a ${childLevel.toLowerCase()} — one confirmed click each (audited).` : "A concept has no deeper level: these become headings inside the lesson."}
                </p>
                <ul className="mt-1 space-y-1">
                  {result.suggestedSubtopics.map((s) => (
                    <li key={s} className="flex flex-wrap items-center gap-2">
                      <span className="text-fg">{s}</span>
                      {childLevel &&
                        (added.includes(s) ? (
                          <span className="text-success-700">Added</span>
                        ) : confirmAdd === s ? (
                          <>
                            <button type="button" disabled={pending} onClick={() => addSubtopic(s)} className={studioQuietAction}>
                              Confirm add
                            </button>
                            <button type="button" onClick={() => setConfirmAdd(null)} className={studioQuietAction}>
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button type="button" onClick={() => setConfirmAdd(s)} className={studioQuietAction}>
                            Add to Master tree
                          </button>
                        ))}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </StudioPanel>
          <StudioPanel aria-labelledby="gen-preview">
            <h2 id="gen-preview" className="mb-2 text-[15px] font-bold text-fg">
              Preview: {result.meta.title}
            </h2>
            <LessonBlocksRenderer blocks={result.blocks} links={NO_LINKS} Math={PlainMath} />
          </StudioPanel>
        </div>
      )}
    </div>
  );
}
