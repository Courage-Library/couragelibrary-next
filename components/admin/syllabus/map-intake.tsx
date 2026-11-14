"use client";

/**
 * SYLLABUS-MAP-1 B2: paste a MASTER_INTAKE (one subject's master nodes + outlines) or an EXAM_MAP (one exam's pattern +
 * its map onto the master + selection stages). The file is checked here first (the same pure validators the server uses),
 * then matched to the master tree on the server. Formats + samples: docs/syllabus/SYLLABUS_MAP_1_DESIGN.md,
 * data/syllabus-map/*.json. The v3 "Syllabus intake" stays available for its existing flow.
 */
import React, { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { StatusChip } from "@/components/admin/status-chip";
import { StudioEmpty, StudioField, StudioPageHeader, StudioPanel, studioControl, studioPrimaryAction, studioQuietAction } from "@/components/admin/studio/studio-page";
import { extractJson } from "@/lib/prompts/paste-extract";
import { validateMasterIntake } from "@/lib/syllabus/master-intake-contract";
import { validateExamMap } from "@/lib/syllabus/exam-map-contract";
import type { MapSessionView } from "@/services/syllabus/map-intake.service";
import { createMapSessionAction } from "@/app/(site)/admin/syllabus/map/actions";

type Issue = { path: string; message: string; code?: string };

function check(text: string): { contract: string | null; errors: Issue[]; warnings: Issue[]; summary: string | null } {
  if (!text.trim()) return { contract: null, errors: [], warnings: [], summary: null };
  const x = extractJson(text);
  if (!x.ok) return { contract: null, errors: [{ path: "$", message: x.message }], warnings: [], summary: null };
  const raw = x.data as Record<string, unknown>;
  if (raw?.contract === "MASTER_INTAKE") {
    const r = validateMasterIntake(raw);
    return r.ok
      ? { contract: "MASTER_INTAKE", errors: [], warnings: r.warnings, summary: `${r.value.subject}: ${r.value.stats.existing} existing node(s), ${r.value.stats.new} proposed, ${r.value.stats.outlineLines} outline line(s)` }
      : { contract: "MASTER_INTAKE", errors: r.errors, warnings: r.warnings, summary: null };
  }
  if (raw?.contract === "EXAM_MAP") {
    const r = validateExamMap(raw);
    return r.ok
      ? { contract: "EXAM_MAP", errors: [], warnings: r.warnings, summary: `${r.value.exam}${r.value.cycleYear ? ` ${r.value.cycleYear}` : ""}: ${r.value.stats.papers} paper(s), ${r.value.stats.sections} section(s), ${r.value.stats.entries} map entr${r.value.stats.entries === 1 ? "y" : "ies"} (${r.value.stats.newEntries} proposed), ${r.value.selectionProcess.length} selection stage(s)` }
      : { contract: "EXAM_MAP", errors: r.errors, warnings: r.warnings, summary: null };
  }
  return { contract: null, errors: [{ path: "$.contract", message: 'Set "contract" to "MASTER_INTAKE" or "EXAM_MAP".' }], warnings: [], summary: null };
}

export function MapIntake({ sessions, loadError }: { sessions: MapSessionView[]; loadError: string | null }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [serverIssues, setServerIssues] = useState<Issue[]>([]);
  const [pending, start] = useTransition();
  const local = useMemo(() => check(text), [text]);

  const create = () =>
    start(async () => {
      setMessage(null);
      setServerIssues([]);
      const r = await createMapSessionAction(text);
      if (r.success) router.push(`/admin/syllabus/map/${r.data.sessionId}`);
      else {
        setMessage(r.error);
        setServerIssues(("errors" in r && Array.isArray(r.errors) ? r.errors : []) as Issue[]);
      }
    });

  const issues = [...local.errors, ...serverIssues];
  return (
    <div className="space-y-5">
      <StudioPageHeader
        title="Master tree & exam maps"
        description="Paste a MASTER_INTAKE file (one subject: master topics, subtopics and their outlines) or an EXAM_MAP file (one exam: its pattern, the master topics it uses, its weightage and selection stages). Exact matches link by themselves; anything else waits for your decision."
        primary={
          <button type="button" className={studioPrimaryAction} disabled={pending || !local.summary || local.errors.length > 0} onClick={create}>
            {pending ? "Matching…" : "Check against the master tree"}
          </button>
        }
        actions={
          <>
            <Link href="/admin/syllabus/intake" className={studioQuietAction}>
              Syllabus intake (v3)
            </Link>
            <Link href="/admin/syllabus" className={studioQuietAction}>
              All syllabi
            </Link>
          </>
        }
      />
      {loadError && (
        <p role="alert" className="rounded-card border border-danger-200 bg-danger-50 px-4 py-3 text-[13px] font-semibold text-danger-800">
          {loadError}
        </p>
      )}
      <StudioPanel aria-labelledby="map-paste">
        <h2 id="map-paste" className="mb-3 text-[15px] font-bold text-fg">
          Paste the file
        </h2>
        <StudioField label="MASTER_INTAKE or EXAM_MAP JSON" htmlFor="map-json">
          <textarea id="map-json" value={text} onChange={(e) => setText(e.target.value)} rows={14} spellCheck={false} className={`${studioControl} font-mono text-[12px]`} />
        </StudioField>
        <div role="status" aria-live="polite" className="mt-3 space-y-2" data-map-check="">
          {local.summary && issues.length === 0 && <p className="text-[13px] font-semibold text-success-800">{`${local.contract} — ${local.summary}`}</p>}
          {message && <p className="text-[13px] font-semibold text-danger-800">{message}</p>}
          {issues.length > 0 && (
            <ul className="max-h-64 list-disc space-y-1 overflow-y-auto pl-5 text-[13px] text-danger-800">
              {issues.slice(0, 50).map((e, i) => (
                <li key={i}>
                  <span className="font-mono">{e.path}</span> — {e.message}
                </li>
              ))}
            </ul>
          )}
          {local.warnings.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-[13px] text-warning-800">
              {local.warnings.slice(0, 20).map((w, i) => (
                <li key={i}>
                  <span className="font-mono">{w.path}</span> — {w.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      </StudioPanel>
      <StudioPanel aria-labelledby="map-recent">
        <h2 id="map-recent" className="mb-3 text-[15px] font-bold text-fg">
          Recent files
        </h2>
        {sessions.length === 0 ? (
          <StudioEmpty title="No files yet" body="Paste a MASTER_INTAKE or an EXAM_MAP file above." />
        ) : (
          <ul className="divide-y divide-line" data-map-sessions="">
            {sessions.map((s) => (
              <li key={s.id} className="flex min-h-12 flex-wrap items-center gap-3 py-2">
                <StatusChip status={s.status} />
                <span className="text-[13px] font-semibold text-fg">{s.contract === "MASTER_INTAKE" ? "Master" : "Exam map"}</span>
                <span className="text-[13px] text-fg-secondary">{s.target}</span>
                <Link href={`/admin/syllabus/map/${s.id}`} className={`${studioQuietAction} ml-auto`}>
                  {s.status === "REVIEW" ? "Review" : "Open"}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </StudioPanel>
    </div>
  );
}
