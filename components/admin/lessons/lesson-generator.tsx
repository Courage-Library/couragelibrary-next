"use client";

import React, { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { StudioEmpty, StudioField, StudioPageHeader, StudioPanel, studioControl, studioPrimaryAction, studioQuietAction } from "@/components/admin/studio/studio-page";
import { LessonBlocksRenderer, PlainMath } from "@/components/learning/lesson-blocks-renderer";
import type { BlockError } from "@/lib/lessons/blocks";
import { lessonChecklist, checklistPasses, type ChecklistItem } from "@/lib/lessons/completeness";
import { parseLessonPaste, type LessonPaste } from "@/lib/prompts/lesson-prompt";
import type { LessonGeneratorData, LessonNodeOption } from "@/lib/lessons/admin-types";
import { saveGeneratedLessonAction } from "@/app/admin/lessons/actions";

/**
 * CA-4 lesson prompt generator (Studio template): 1 choose a node (topic / subtopic / concept) → 2 copy the LESSON prompt
 * (its exam coverage comes from the published syllabi) into an AI assistant → 3 paste the answer → Check (block rules +
 * the completeness checklist + flagged facts) → Save draft (the node's lesson, English) → review + publish in the editor.
 */

const NO_LINKS = { nodes: {}, images: {} };

interface Props {
  nodes: LessonNodeOption[];
  selectedNodeId: string | null;
  generator: LessonGeneratorData | null;
  loadError: string | null;
}

export function LessonGenerator({ nodes, selectedNodeId, generator, loadError }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [filter, setFilter] = useState("");
  const [paste, setPaste] = useState("");
  const [result, setResult] = useState<LessonPaste | null>(null);
  const [factsChecked, setFactsChecked] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string; href?: string } | null>(null);
  const [serverErrors, setServerErrors] = useState<BlockError[]>([]);
  const [copied, setCopied] = useState(false);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (q ? nodes.filter((n) => n.path.toLowerCase().includes(q)) : nodes).slice(0, 200);
  }, [nodes, filter]);
  const checklist: ChecklistItem[] = result && result.ok ? lessonChecklist(result.blocks, generator?.context.subjectType ?? null) : [];
  const facts = result && result.ok ? result.uncertainFacts : [];
  const canSave = Boolean(selectedNodeId && result && result.ok && (facts.length === 0 || factsChecked) && !pending);

  const check = () => {
    setMessage(null);
    setServerErrors([]);
    setFactsChecked(false);
    setResult(parseLessonPaste(paste));
  };

  const save = () =>
    start(async () => {
      if (!selectedNodeId) return;
      const r = await saveGeneratedLessonAction(selectedNodeId, paste, factsChecked);
      if (r.success) {
        setMessage({ kind: "ok", text: `Draft saved. ${checklistPasses(r.data.checklist) ? "The checklist passes: review and publish it in the editor." : "Complete the checklist before publishing."}`, href: `/admin/lessons/${r.data.documentId}` });
        router.refresh();
      } else {
        setMessage({ kind: "error", text: r.error });
        if ("errors" in r && r.errors) setServerErrors(r.errors);
      }
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

  const errors = result && !result.ok ? result.errors : serverErrors;

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
      {loadError && (
        <p role="alert" className="rounded-card border border-danger-200 bg-danger-50 px-4 py-3 text-[13px] font-semibold text-danger-800">
          {loadError}
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
              {generator.context.nodePath} · template LESSON {generator.templateVersion ? `v${generator.templateVersion}` : "(built-in)"} ·{" "}
              {generator.context.coverage.length ? `${generator.context.coverage.length} exam unit(s)` : "no published exam maps this node yet"}
            </p>
            {generator.context.coverage.length > 0 && (
              <ul className="mb-3 space-y-0.5 text-[13px]" aria-label="Exam coverage">
                {generator.context.coverage.map((c, i) => (
                  <li key={i}>
                    <span className="font-semibold text-fg">{c.exam}{c.cycleYear ? ` ${c.cycleYear}` : ""}{c.tier ? ` (${c.tier})` : ""}</span>
                    <span className="text-fg-secondary"> · {c.syllabusPath}{c.weightageTier ? ` · ${c.weightageTier}` : ""}</span>
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
          <p className="text-[13px] text-fg-secondary">Choose a node first.</p>
        )}
      </StudioPanel>

      <StudioPanel aria-labelledby="gen-step-3">
        <h2 id="gen-step-3" className="mb-1 text-[15px] font-bold text-fg">
          3. Paste the answer
        </h2>
        <label htmlFor="gen-paste" className="mb-1 block text-[13px] text-fg-secondary">
          The assistant&apos;s JSON (contract LESSON_BLOCKS v2)
        </label>
        <textarea id="gen-paste" value={paste} onChange={(e) => (setPaste(e.target.value), setResult(null))} rows={10} className={`${studioControl} min-h-48 py-2 font-mono text-[12px]`} />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button type="button" onClick={check} disabled={!paste.trim() || !generator} className={studioQuietAction}>
            Check
          </button>
          {result?.ok && <span className="text-[13px] text-success-700">The blocks are valid: {result.blocks.length} block(s).</span>}
        </div>
        {errors.length > 0 && (
          <ul className="mt-3 space-y-1 rounded-card border border-danger-200 bg-danger-50 px-4 py-3 text-[13px] text-danger-800" aria-label="Problems in the pasted lesson">
            {errors.slice(0, 30).map((e, i) => (
              <li key={i}>
                <span className="font-mono">{e.path}</span> — {e.message}
              </li>
            ))}
          </ul>
        )}
      </StudioPanel>

      {result?.ok && (
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
