"use client";

import React, { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { StatusChip } from "@/components/admin/status-chip";
import { StudioEmpty, StudioField, StudioPageHeader, StudioPanel, studioControl, studioPrimaryAction, studioQuietAction } from "@/components/admin/studio/studio-page";
import { SOURCE_URL_RE, TIER_RE, validateIntakePayload, type IntakeError, type IntakeStats } from "@/lib/syllabus/intake-contract";
import { buildSyllabusIntakePrompt } from "@/lib/syllabus/intake-prompt";
import type { IntakeSessionView } from "@/lib/syllabus/intake-types";
import { createIntakeAction } from "@/app/admin/syllabus/intake/actions";

/**
 * CA-2 intake wizard (Studio template): 1 choose exam / cycle / tier + the official link and date → 2 copy the prompt
 * into an AI assistant → 3 paste its JSON and check it (contract v2, in the browser) → create the intake (the server
 * matches it to the master tree; nothing changes until every item is decided on the review screen).
 */

interface Props {
  exams: { id: string; title: string; slug: string }[];
  cycles: { id: string; examId: string; year: number }[];
  sessions: IntakeSessionView[];
  loadError: string | null;
}

export function IntakeWizard({ exams, cycles, sessions, loadError }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [examId, setExamId] = useState("");
  const [cycleId, setCycleId] = useState("");
  const [tier, setTier] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [asOf, setAsOf] = useState("");
  const [json, setJson] = useState("");
  const [checked, setChecked] = useState<{ stats: IntakeStats } | null>(null);
  const [errors, setErrors] = useState<IntakeError[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const exam = exams.find((e) => e.id === examId) || null;
  const examCycles = cycles.filter((c) => c.examId === examId);
  const cycle = examCycles.find((c) => c.id === cycleId) || null;
  const contextOk = Boolean(exam) && (!tier || TIER_RE.test(tier)) && SOURCE_URL_RE.test(sourceUrl.trim()) && /^\d{4}-\d{2}-\d{2}$/.test(asOf);
  const prompt = useMemo(
    () => (exam && contextOk ? buildSyllabusIntakePrompt({ examName: exam.title, examSlug: exam.slug, cycleYear: cycle?.year ?? null, tier: tier || null, sourceUrl: sourceUrl.trim(), asOf }) : ""),
    [exam, contextOk, cycle, tier, sourceUrl, asOf]
  );

  const check = () => {
    setMessage(null);
    if (!exam) return;
    const v = validateIntakePayload(json, { examSlug: exam.slug, cycleYear: cycle?.year ?? null, tier: tier || null });
    if (!v.ok) {
      setChecked(null);
      setErrors(v.errors);
      return;
    }
    if (v.header.source_url !== sourceUrl.trim() || v.header.as_of !== asOf) {
      setChecked(null);
      setErrors([{ code: "CONTEXT_MISMATCH", path: "$.source_url", message: "The link or date in the JSON differs from the ones entered above." }]);
      return;
    }
    setErrors([]);
    setChecked({ stats: v.stats });
  };

  const create = () =>
    start(async () => {
      const r = await createIntakeAction({ examId, cycleId: cycleId || null, tier: tier || null, sourceUrl: sourceUrl.trim(), asOf, json });
      if (r.success) router.push(`/admin/syllabus/intake/${r.data.sessionId}`);
      else {
        setMessage(r.error);
        if ("errors" in r && r.errors) setErrors(r.errors);
      }
    });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="space-y-5">
      <StudioPageHeader
        title="Syllabus intake"
        description="Turn an official notification into a DRAFT syllabus: an AI assistant drafts it, you check every match against the master tree."
        primary={
          <button type="button" className={studioPrimaryAction} disabled={pending || !checked || !contextOk} onClick={create}>
            {pending ? "Matching…" : "Create intake"}
          </button>
        }
        actions={
          <Link href="/admin/syllabus" className={studioQuietAction}>
            All syllabi
          </Link>
        }
      />
      {loadError && (
        <p role="alert" className="rounded-card border border-danger-200 bg-danger-50 px-4 py-3 text-[13px] font-semibold text-danger-800">
          {loadError}
        </p>
      )}
      <div role="status" aria-live="polite">
        {message && <p className="rounded-card border border-danger-200 bg-danger-50 px-4 py-3 text-[13px] font-semibold text-danger-800">{message}</p>}
      </div>

      <StudioPanel aria-labelledby="step-1">
        <h2 id="step-1" className="mb-3 text-[15px] font-bold text-fg">
          1. Exam and source
        </h2>
        <div className="grid gap-3 md:grid-cols-3">
          <StudioField label="Exam" htmlFor="in-exam">
            <select
              id="in-exam"
              value={examId}
              onChange={(e) => {
                setExamId(e.target.value);
                setCycleId("");
                setChecked(null);
              }}
              className={studioControl}
            >
              <option value="">Choose…</option>
              {exams.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title}
                </option>
              ))}
            </select>
          </StudioField>
          <StudioField label="Cycle" htmlFor="in-cycle">
            <select id="in-cycle" value={cycleId} onChange={(e) => (setCycleId(e.target.value), setChecked(null))} className={studioControl} disabled={!examId}>
              <option value="">Exam-wide (no cycle)</option>
              {examCycles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.year}
                </option>
              ))}
            </select>
          </StudioField>
          <StudioField label="Tier (optional, e.g. tier-1)" htmlFor="in-tier">
            <input id="in-tier" value={tier} onChange={(e) => (setTier(e.target.value.trim().toLowerCase()), setChecked(null))} maxLength={40} className={`${studioControl} font-mono`} />
          </StudioField>
          <StudioField label="Official notification link (https)" htmlFor="in-url" className="md:col-span-2">
            <input id="in-url" type="url" value={sourceUrl} onChange={(e) => (setSourceUrl(e.target.value), setChecked(null))} maxLength={500} className={studioControl} />
          </StudioField>
          <StudioField label="As of" htmlFor="in-asof">
            <input id="in-asof" type="date" value={asOf} onChange={(e) => (setAsOf(e.target.value), setChecked(null))} className={studioControl} />
          </StudioField>
        </div>
        {tier && !TIER_RE.test(tier) && <p className="mt-2 text-[13px] text-danger-700">A tier uses lower-case letters, digits and single hyphens.</p>}
      </StudioPanel>

      <StudioPanel aria-labelledby="step-2">
        <h2 id="step-2" className="mb-1 text-[15px] font-bold text-fg">
          2. Prompt
        </h2>
        <p className="mb-3 text-[13px] text-fg-secondary">Copy this into an AI assistant together with the notification. It asks for strict JSON, no invention, and a flag on every uncertain item.</p>
        {prompt ? (
          <>
            <label htmlFor="in-prompt" className="sr-only">
              Prompt
            </label>
            <textarea id="in-prompt" readOnly value={prompt} rows={10} className={`${studioControl} min-h-48 py-2 font-mono text-[12px]`} />
            <div className="mt-2 flex items-center gap-2">
              <button type="button" onClick={copy} className={studioQuietAction}>
                Copy prompt
              </button>
              {copied && <span className="text-[13px] text-success-700">Copied.</span>}
            </div>
          </>
        ) : (
          <p className="text-[13px] text-fg-secondary">Choose the exam and enter the official link and date first.</p>
        )}
      </StudioPanel>

      <StudioPanel aria-labelledby="step-3">
        <h2 id="step-3" className="mb-1 text-[15px] font-bold text-fg">
          3. Paste the answer
        </h2>
        <label htmlFor="in-json" className="mb-1 block text-[13px] text-fg-secondary">
          The assistant&apos;s JSON (contract SYLLABUS_INTAKE v2)
        </label>
        <textarea id="in-json" value={json} onChange={(e) => (setJson(e.target.value), setChecked(null))} rows={10} className={`${studioControl} min-h-48 py-2 font-mono text-[12px]`} />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button type="button" onClick={check} disabled={!exam || !json.trim()} className={studioQuietAction}>
            Check
          </button>
          {checked && (
            <span className="text-[13px] text-success-700">
              Looks right: {checked.stats.papers} paper(s), {checked.stats.subjects} subject(s), {checked.stats.topics} topic(s), {checked.stats.subtopics} subtopic(s), {checked.stats.concepts} concept(s);{" "}
              {checked.stats.uncertain} flagged uncertain.
            </span>
          )}
        </div>
        {errors.length > 0 && (
          <ul className="mt-3 space-y-1 rounded-card border border-danger-200 bg-danger-50 px-4 py-3 text-[13px] text-danger-800" aria-label="Problems in the pasted JSON">
            {errors.slice(0, 30).map((e, i) => (
              <li key={i}>
                <span className="font-mono">{e.path}</span> — {e.message}
              </li>
            ))}
          </ul>
        )}
      </StudioPanel>

      <StudioPanel aria-labelledby="recent">
        <h2 id="recent" className="mb-3 text-[15px] font-bold text-fg">
          Recent intakes
        </h2>
        {sessions.length === 0 ? (
          <StudioEmpty title="No intakes yet" body="Create the first one above; it stays under review until every item is decided." />
        ) : (
          <ul className="divide-y divide-line">
            {sessions.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 py-2 text-[13px]">
                <Link href={`/admin/syllabus/intake/${s.id}`} className="focus-ring min-h-10 flex-1 rounded-control py-2 font-semibold text-link">
                  {s.examTitle}
                  {s.cycleYear ? ` · ${s.cycleYear}` : ""}
                  {s.tier ? ` · ${s.tier}` : ""}
                </Link>
                <span className="text-fg-secondary">as of {s.asOf}</span>
                <StatusChip status={s.status} />
              </li>
            ))}
          </ul>
        )}
      </StudioPanel>
    </div>
  );
}
