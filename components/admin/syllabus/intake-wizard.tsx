"use client";

import React, { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { StatusChip } from "@/components/admin/status-chip";
import { StudioEmpty, StudioField, StudioPageHeader, StudioPanel, studioControl, studioPrimaryAction, studioQuietAction } from "@/components/admin/studio/studio-page";
import { INTAKE_CONTRACT_VERSION, SOURCE_URL_RE, TIER_RE, validateIntakePayload, type IntakeError, type IntakeStats } from "@/lib/syllabus/intake-contract";
import { buildSyllabusIntakePrompt } from "@/lib/syllabus/intake-prompt";
import type { IntakeSessionView } from "@/lib/syllabus/intake-types";
import { createIntakeAction } from "@/app/admin/syllabus/intake/actions";

/**
 * CA-2 / SYLLABUS-PROMPT-2 intake wizard (Studio template): 1 choose exam / cycle / tier (an optional reference link
 * stays collapsed) → 2 copy the prompt (the ACTIVE SYLLABUS template, rendered here) into an AI assistant → 3 paste its
 * JSON and check it (contract v3, or v2 for an older paste, in the browser) → create the intake (the server matches it to
 * the master tree; nothing changes until every item is decided on the review screen).
 */

interface Props {
  exams: { id: string; title: string; slug: string }[];
  cycles: { id: string; examId: string; year: number }[];
  sessions: IntakeSessionView[];
  /** the ACTIVE SYLLABUS template (null: the built-in v1) */
  template: { body: string; version: number | null } | null;
  loadError: string | null;
}

export function IntakeWizard({ exams, cycles, sessions, template, loadError }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [examId, setExamId] = useState("");
  const [cycleId, setCycleId] = useState("");
  const [tier, setTier] = useState("");
  const [referenceUrl, setReferenceUrl] = useState("");
  const [json, setJson] = useState("");
  const [checked, setChecked] = useState<{ stats: IntakeStats } | null>(null);
  const [errors, setErrors] = useState<IntakeError[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const exam = exams.find((e) => e.id === examId) || null;
  const examCycles = cycles.filter((c) => c.examId === examId);
  const cycle = examCycles.find((c) => c.id === cycleId) || null;
  const referenceOk = !referenceUrl.trim() || SOURCE_URL_RE.test(referenceUrl.trim());
  const contextOk = Boolean(exam) && Boolean(cycle) && (!tier || TIER_RE.test(tier)) && referenceOk;
  const prompt = useMemo(() => {
    if (!exam || !cycle || !contextOk) return "";
    try {
      return buildSyllabusIntakePrompt({ examName: exam.title, examSlug: exam.slug, cycleYear: cycle.year, tier: tier || null }, template?.body);
    } catch {
      return "";
    }
  }, [exam, cycle, contextOk, tier, template]);

  const check = () => {
    setMessage(null);
    if (!exam) return;
    const v = validateIntakePayload(json, { examSlug: exam.slug, cycleYear: cycle?.year ?? null, tier: tier || null });
    if (!v.ok) {
      setChecked(null);
      setErrors(v.errors);
      return;
    }
    setErrors([]);
    setChecked({ stats: v.stats });
  };

  const create = () =>
    start(async () => {
      const r = await createIntakeAction({ examId, cycleId: cycleId || null, tier: tier || null, referenceUrl: referenceUrl.trim() || null, json });
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
        description="Build a complete DRAFT syllabus for an exam: an AI assistant drafts it from the latest pattern and previous papers, you decide every item against the master tree."
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
          1. Exam, cycle and tier
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
              <option value="">Choose…</option>
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
        </div>
        {tier && !TIER_RE.test(tier) && <p className="mt-2 text-[13px] text-danger-700">A tier uses lower-case letters, digits and single hyphens.</p>}
        {examId && examCycles.length === 0 && <p className="mt-2 text-[13px] text-fg-secondary">This exam has no cycle yet. Add one in the exam settings first.</p>}
        <details className="mt-3">
          <summary className="focus-ring min-h-10 cursor-pointer rounded-control py-2 text-[13px] font-semibold text-fg-secondary">Reference link (optional)</summary>
          <StudioField label="A link kept with the intake for your own reference (https)" htmlFor="in-url" className="mt-2 max-w-2xl">
            <input id="in-url" type="url" value={referenceUrl} onChange={(e) => (setReferenceUrl(e.target.value), setChecked(null))} maxLength={500} className={studioControl} />
          </StudioField>
          {!referenceOk && <p className="mt-2 text-[13px] text-danger-700">Use an https:// link, or leave it empty.</p>}
        </details>
      </StudioPanel>

      <StudioPanel aria-labelledby="step-2">
        <h2 id="step-2" className="mb-1 text-[15px] font-bold text-fg">
          2. Prompt
        </h2>
        <p className="mb-3 text-[13px] text-fg-secondary">
          Copy this into an AI assistant. It asks for the complete teaching tree (official topics, previous-paper trends and teaching breakdowns, each marked), weightage, strict JSON and a flag on every uncertain fact. Template SYLLABUS {template?.version ? `v${template.version}` : "(built-in)"}.
        </p>
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
          <p className="text-[13px] text-fg-secondary">Choose the exam and the cycle first.</p>
        )}
      </StudioPanel>

      <StudioPanel aria-labelledby="step-3">
        <h2 id="step-3" className="mb-1 text-[15px] font-bold text-fg">
          3. Paste the answer
        </h2>
        <label htmlFor="in-json" className="mb-1 block text-[13px] text-fg-secondary">
          The assistant&apos;s JSON (contract SYLLABUS_INTAKE v{INTAKE_CONTRACT_VERSION}; an older v2 answer is accepted too)
        </label>
        <textarea id="in-json" value={json} onChange={(e) => (setJson(e.target.value), setChecked(null))} rows={10} className={`${studioControl} min-h-48 py-2 font-mono text-[12px]`} />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button type="button" onClick={check} disabled={!exam || !json.trim()} className={studioQuietAction}>
            Check
          </button>
          {checked && (
            <span className="text-[13px] text-success-700">
              Looks right: {checked.stats.papers} paper(s), {checked.stats.subjects} subject(s), {checked.stats.topics} topic(s), {checked.stats.subtopics} subtopic(s), {checked.stats.concepts} concept(s);{" "}
              {checked.stats.uncertain} flagged uncertain
              {checked.stats.official + checked.stats.pyq_trend + checked.stats.expanded > 0
                ? `; ${checked.stats.official} official, ${checked.stats.pyq_trend} from previous papers, ${checked.stats.expanded} expanded`
                : ""}
              .
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
                <span className="text-fg-secondary">{s.basedOn ? `based on ${s.basedOn}` : s.asOf ? `as of ${s.asOf}` : ""}</span>
                <StatusChip status={s.status} />
              </li>
            ))}
          </ul>
        )}
      </StudioPanel>
    </div>
  );
}
