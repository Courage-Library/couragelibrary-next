"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { StatusChip } from "@/components/admin/status-chip";
import { StudioField, StudioPageHeader, StudioPanel, studioControl, studioPrimaryAction, studioQuietAction } from "@/components/admin/studio/studio-page";
import { TEMPLATE_PLACEHOLDERS, TEMPLATE_TYPES, templateProblems, type TemplateType } from "@/lib/prompts/template";
import type { PromptTemplateRow } from "@/lib/prompts/admin-types";
import { activatePromptAction, savePromptDraftAction } from "@/app/admin/prompts/actions";

/**
 * CA-4 prompt templates (Studio template): one tab per type; the active version, the open draft and the history.
 * Editing saves a DRAFT version (checked here and again by the database); Activate makes it the version the screens use
 * and retires the previous one. Active and retired versions never change (re-activate an old one instead).
 */

const TYPE_LABEL: Record<TemplateType, string> = { SYLLABUS: "Syllabus", LESSON: "Lesson", QUESTION: "Question", TRANSLATE_HI: "Translation" };

export function PromptTemplatesEditor({ rows, loadError }: { rows: PromptTemplateRow[]; loadError: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [type, setType] = useState<TemplateType>("SYLLABUS");
  const list = rows.filter((r) => r.type === type);
  const active = list.find((r) => r.status === "ACTIVE") || null;
  const draft = list.find((r) => r.status === "DRAFT") || null;
  const [body, setBody] = useState<string>((draft || active)?.body || "");
  const [notes, setNotes] = useState<string>(draft?.notes || "");
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const problems = body.trim() ? templateProblems(type, body) : [];
  const spec = TEMPLATE_PLACEHOLDERS[type];

  const pick = (t: TemplateType) => {
    setType(t);
    const l = rows.filter((r) => r.type === t);
    const d = l.find((r) => r.status === "DRAFT");
    setBody((d || l.find((r) => r.status === "ACTIVE"))?.body || "");
    setNotes(d?.notes || "");
    setMessage(null);
  };

  const save = () =>
    start(async () => {
      const r = await savePromptDraftAction(type, body, notes.trim() || null);
      if (r.success) {
        setMessage({ kind: "ok", text: `Draft v${r.data.version} saved. Activate it to use it.` });
        router.refresh();
      } else setMessage({ kind: "error", text: "problems" in r && r.problems ? `${r.error} ${r.problems.join(" ")}` : r.error });
    });

  const activate = (id: string, version: number) =>
    start(async () => {
      const r = await activatePromptAction(id);
      if (r.success) {
        setMessage({ kind: "ok", text: `Version ${version} is now active.` });
        router.refresh();
      } else setMessage({ kind: "error", text: r.error });
    });

  return (
    <div className="space-y-5">
      <StudioPageHeader
        title="Prompt templates"
        description="The prompts the owner copies into an AI assistant. Versioned and audited; exactly one active version per type."
        primary={
          <button type="button" className={studioPrimaryAction} disabled={pending || !body.trim() || problems.length > 0 || body === active?.body} onClick={save}>
            {pending ? "Saving…" : "Save draft"}
          </button>
        }
      />
      {loadError && (
        <p role="alert" className="rounded-card border border-danger-200 bg-danger-50 px-4 py-3 text-[13px] font-semibold text-danger-800">
          {loadError}
        </p>
      )}
      <div role="status" aria-live="polite">
        {message && (
          <p className={`rounded-card border px-4 py-3 text-[13px] font-semibold ${message.kind === "ok" ? "border-success-200 bg-success-50 text-success-800" : "border-danger-200 bg-danger-50 text-danger-800"}`}>{message.text}</p>
        )}
      </div>

      <div role="tablist" aria-label="Template type" className="flex flex-wrap gap-2">
        {TEMPLATE_TYPES.map((t) => (
          <button key={t} type="button" role="tab" aria-selected={t === type} onClick={() => pick(t)} className={`${studioQuietAction} ${t === type ? "border-primary-300 bg-primary-50 font-bold" : ""}`}>
            {TYPE_LABEL[t]}
          </button>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <StudioPanel aria-labelledby="pt-editor">
          <h2 id="pt-editor" className="mb-1 text-[15px] font-bold text-fg">
            {TYPE_LABEL[type]} template {draft ? `· draft v${draft.version}` : active ? `· editing a copy of v${active.version}` : "· no version yet"}
          </h2>
          <p className="mb-2 text-[13px] text-fg-secondary">
            Placeholders: {spec.allowed.map((p) => `{{${p}}}`).join(" ")}. Required: {spec.required.join(", ")}. A part between {"{{#NAME}}"} and {"{{/NAME}}"} appears only when NAME has a value.
          </p>
          <label htmlFor="pt-body" className="sr-only">
            Template text
          </label>
          <textarea id="pt-body" value={body} onChange={(e) => setBody(e.target.value)} rows={22} className={`${studioControl} min-h-96 py-2 font-mono text-[12px]`} />
          <StudioField label="Notes (optional)" htmlFor="pt-notes" className="mt-3">
            <input id="pt-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} className={studioControl} />
          </StudioField>
          {problems.length > 0 && (
            <ul className="mt-3 space-y-1 rounded-card border border-danger-200 bg-danger-50 px-4 py-3 text-[13px] text-danger-800" aria-label="Problems in the template">
              {problems.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          )}
        </StudioPanel>

        <StudioPanel aria-labelledby="pt-versions">
          <h2 id="pt-versions" className="mb-2 text-[15px] font-bold text-fg">
            Versions
          </h2>
          {list.length === 0 ? (
            <p className="text-[13px] text-fg-secondary">No version yet. Save a draft, then activate it.</p>
          ) : (
            <ul className="divide-y divide-line text-[13px]" aria-label="Versions">
              {list.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="font-semibold text-fg">v{r.version}</span>
                  <StatusChip status={r.status} />
                  <span className="font-mono text-[12px] text-fg-secondary">{r.bodySha256.slice(0, 10)}</span>
                  {r.status !== "ACTIVE" && (
                    <button type="button" disabled={pending} onClick={() => activate(r.id, r.version)} className={`${studioQuietAction} ml-auto`}>
                      Activate
                    </button>
                  )}
                  {r.notes && <span className="w-full text-fg-secondary">{r.notes}</span>}
                </li>
              ))}
            </ul>
          )}
        </StudioPanel>
      </div>
    </div>
  );
}
