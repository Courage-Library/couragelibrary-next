"use client";

/**
 * SYLLABUS-MAP-1 B2: review one MASTER_INTAKE / EXAM_MAP file. Exact references (path, name, alias) are linked already;
 * a suggestion (CLOSE), a proposed node (NEW) or an unknown path waits for the owner: link to a suggestion or a typed
 * master path, create the proposed node (admin only, audited), or ignore. An exam map shows its pattern (choice groups
 * counted once per pick) and selection stages, and its per-exam weightage can be edited here. Import: a MASTER_INTAKE
 * updates the master tree; an EXAM_MAP becomes a DRAFT syllabus (published from the syllabus editor) + DRAFT stages.
 */
import React, { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { StatusChip } from "@/components/admin/status-chip";
import { StudioPageHeader, StudioPanel, StudioStatStrip, studioControl, studioPrimaryAction, studioQuietAction } from "@/components/admin/studio/studio-page";
import type { MapItemView, MapSessionView } from "@/services/syllabus/map-intake.service";
import {
  decideMapItemAction,
  discardMapSessionAction,
  importMapSessionAction,
  publishMapStagesAction,
  setMapOutlineAction,
  setMapWeightageAction,
} from "@/app/(site)/admin/syllabus/map/actions";

const STATUS_LABEL: Record<string, string> = {
  EXACT_REF: "Path match",
  EXACT: "Exact match",
  ALIAS: "Alias match",
  CLOSE: "Suggestion",
  NEW: "Proposed / not found",
  UNKNOWN_REF: "Unknown path",
};
const TIERS = ["HIGH_YIELD", "CORE", "MODERATE", "LOW", "OPTIONAL"] as const;

type Paper = { name: string; questions: number; marks: number; choice_groups?: { id: string; label: string; pick: number }[]; sections: { name: string; questions: number; marks: number; choice_group?: string }[] };
type Stage = { stage: string; name: string; nature: string; paper?: string };

export function MapReview({ session, items, loadError }: { session: MapSessionView | null; items: MapItemView[]; loadError: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [tag, setTag] = useState("");
  const [paths, setPaths] = useState<Record<string, string>>({});
  const run = (fn: () => Promise<{ success: boolean; error?: string }>, ok: string) =>
    start(async () => {
      const r = await fn();
      setMessage(r.success ? { ok: true, text: ok } : { ok: false, text: r.error || "The change could not be saved." });
      if (r.success) router.refresh();
    });

  const stats = useMemo(() => {
    const open = items.filter((i) => i.decision === null).length;
    const conflicts = items.filter((i) => i.outlineConflict && !i.outlineAction && i.decision !== "IGNORE").length;
    return { open, conflicts, linked: items.filter((i) => i.decision === "LINK" || i.decision === "APPROVE_NEW").length, ignored: items.filter((i) => i.decision === "IGNORE").length };
  }, [items]);

  if (!session)
    return (
      <p role="alert" className="rounded-card border border-danger-200 bg-danger-50 px-4 py-3 text-[13px] font-semibold text-danger-800">
        {loadError || "The file could not be loaded."}
      </p>
    );
  const review = session.status === "REVIEW";
  const isMap = session.contract === "EXAM_MAP";
  const papers = (isMap ? (session.payload.papers as Paper[]) : []) || [];
  const stages = (isMap ? (session.payload.selection_process as Stage[]) : []) || [];
  const sectionName = (key: string | null) => {
    const m = key ? /^p(\d+)\.s(\d+)$/.exec(key) : null;
    return m ? `${papers[Number(m[1])]?.name ?? "Paper"} › ${papers[Number(m[1])]?.sections[Number(m[2])]?.name ?? "Section"}` : "Master nodes";
  };
  const groups = new Map<string, MapItemView[]>();
  for (const it of items) groups.set(it.sectionKey ?? "", [...(groups.get(it.sectionKey ?? "") || []), it]);

  return (
    <div className="space-y-5" data-map-review={session.contract}>
      <StudioPageHeader
        title={`${isMap ? "Exam map" : "Master intake"} — ${session.target}`}
        description={review ? "Exact references are linked. Decide every suggestion, proposed node and unknown path, then import." : `This file is ${session.status.toLowerCase()}.`}
        meta={<StatusChip status={session.status} />}
        primary={
          review ? (
            <button
              type="button"
              className={studioPrimaryAction}
              disabled={pending || stats.open > 0 || stats.conflicts > 0}
              onClick={() => run(() => importMapSessionAction(session.id, tag.trim() || null), isMap ? "Imported as a DRAFT syllabus (not visible to students until published)." : "Applied to the master tree.")}
              data-map-import=""
            >
              {isMap ? "Create DRAFT syllabus" : "Apply to master tree"}
            </button>
          ) : undefined
        }
        actions={
          <>
            <Link href="/admin/syllabus/map" className={studioQuietAction}>
              All files
            </Link>
            {review && (
              <button type="button" className={studioQuietAction} disabled={pending} onClick={() => run(() => discardMapSessionAction(session.id), "Discarded.")}>
                Discard
              </button>
            )}
          </>
        }
      />
      <div role="status" aria-live="polite">
        {message && <p className={`rounded-card border px-4 py-3 text-[13px] font-semibold ${message.ok ? "border-success-200 bg-success-50 text-success-800" : "border-danger-200 bg-danger-50 text-danger-800"}`}>{message.text}</p>}
      </div>
      <StudioStatStrip
        label="Review progress"
        stats={[
          { key: "open", label: "To decide", value: stats.open },
          { key: "conflicts", label: "Outline conflicts", value: stats.conflicts },
          { key: "linked", label: "Linked / created", value: stats.linked },
          { key: "ignored", label: "Ignored", value: stats.ignored },
        ]}
      />
      {review && isMap && (
        <StudioPanel aria-labelledby="map-tag">
          <label id="map-tag" htmlFor="map-tag-in" className="text-[13px] font-semibold text-fg">
            Version tag (optional, e.g. 2026-notice)
          </label>
          <input id="map-tag-in" value={tag} onChange={(e) => setTag(e.target.value)} className={`${studioControl} mt-1 max-w-xs`} />
        </StudioPanel>
      )}
      {!review && session.result && (
        <StudioPanel aria-labelledby="map-result">
          <h2 id="map-result" className="mb-2 text-[15px] font-bold text-fg">
            Result
          </h2>
          <ul className="flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-fg-secondary">
            {Object.entries(session.result)
              .filter(([k]) => k !== "version_id")
              .map(([k, v]) => (
                <li key={k}>
                  {k.replace(/_/g, " ")}: <span className="font-semibold text-fg">{String(v)}</span>
                </li>
              ))}
          </ul>
          {isMap && session.importedVersionId && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href={`/admin/syllabus/${session.importedVersionId}`} className={studioQuietAction}>
                Open the DRAFT syllabus (publish it there)
              </Link>
              {stages.length > 0 && (
                <button type="button" className={studioQuietAction} disabled={pending} onClick={() => run(() => publishMapStagesAction(session.id), "The selection process is published on the exam page.")}>
                  Publish the selection process
                </button>
              )}
            </div>
          )}
        </StudioPanel>
      )}
      {isMap && (
        <StudioPanel aria-labelledby="map-pattern">
          <h2 id="map-pattern" className="mb-2 text-[15px] font-bold text-fg">
            Pattern
          </h2>
          {papers.map((p, pi) => (
            <div key={pi} className="mb-3">
              <p className="text-[13px] font-semibold text-fg">{`${p.name} — ${p.questions} questions, ${p.marks} marks`}</p>
              <ul className="mt-1 list-disc pl-5 text-[13px] text-fg-secondary">
                {p.sections.map((s, si) => {
                  const g = s.choice_group ? p.choice_groups?.find((x) => x.id === s.choice_group) : null;
                  return <li key={si}>{`${s.name}: ${s.questions} Q / ${s.marks} marks${g ? ` — ${g.label} (pick ${g.pick})` : ""}`}</li>;
                })}
              </ul>
            </div>
          ))}
          {stages.length > 0 && (
            <>
              <h3 className="mt-2 text-[13px] font-bold text-fg">Selection process (not syllabus)</h3>
              <ol className="mt-1 list-decimal pl-5 text-[13px] text-fg-secondary" data-map-stages="">
                {stages.map((s, i) => (
                  <li key={i}>{`${s.name} (${s.stage}, ${s.nature.toLowerCase()})`}</li>
                ))}
              </ol>
            </>
          )}
        </StudioPanel>
      )}
      {[...groups.entries()].map(([key, list]) => (
        <StudioPanel key={key} aria-label={sectionName(key || null)}>
          <h2 className="mb-2 text-[15px] font-bold text-fg">{sectionName(key || null)}</h2>
          <ul className="divide-y divide-line">
            {list.map((it) => (
              <li key={it.id} className="space-y-2 py-3" data-map-item={it.matchStatus}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-semibold text-fg">{it.name ?? it.refPath}</span>
                  {it.refPath && it.name && <span className="font-mono text-[12px] text-fg-secondary">{it.refPath}</span>}
                  <span className="rounded-badge border border-line px-2 py-0.5 text-caption text-fg-secondary">{STATUS_LABEL[it.matchStatus]}</span>
                  {it.kind === "NEW" && <span className="text-caption text-fg-secondary">{`proposed ${String(it.level).toLowerCase()}${it.parentNode ? ` under ${it.parentNode.path}` : ""}`}</span>}
                  <span className="ml-auto text-[13px] text-fg-secondary">
                    {it.decision === null ? "Undecided" : it.decision === "IGNORE" ? "Ignored" : `${it.decision === "APPROVE_NEW" ? "Created" : "Linked"} → ${it.decisionNode?.path ?? ""}`}
                  </span>
                </div>
                {review && it.decision !== "APPROVE_NEW" && (
                  <div className="flex flex-wrap items-center gap-2">
                    {it.candidates.map((c) => (
                      <button key={c.node_id} type="button" className={studioQuietAction} disabled={pending} onClick={() => run(() => decideMapItemAction(session.id, it.id, "LINK", c.node_id), `Linked to ${c.path}.`)}>
                        {`Link → ${c.path}`}
                      </button>
                    ))}
                    <input
                      aria-label={`Master path to link "${it.name ?? it.refPath}" to`}
                      placeholder="or type a master path"
                      value={paths[it.id] ?? ""}
                      onChange={(e) => setPaths({ ...paths, [it.id]: e.target.value })}
                      className={`${studioControl} w-64 font-mono text-[12px]`}
                    />
                    <button type="button" className={studioQuietAction} disabled={pending || !(paths[it.id] ?? "").trim()} onClick={() => run(() => decideMapItemAction(session.id, it.id, "LINK", (paths[it.id] ?? "").trim()), "Linked.")}>
                      Link
                    </button>
                    {it.kind === "NEW" && it.decision === null && (
                      <button type="button" className={studioQuietAction} disabled={pending} onClick={() => run(() => decideMapItemAction(session.id, it.id, "APPROVE_NEW", null), `Created "${it.name}" in the master tree.`)} data-map-approve="">
                        Create new master node
                      </button>
                    )}
                    {it.decision !== "IGNORE" && (
                      <button type="button" className={studioQuietAction} disabled={pending} onClick={() => run(() => decideMapItemAction(session.id, it.id, "IGNORE", null), "Ignored.")}>
                        Ignore
                      </button>
                    )}
                  </div>
                )}
                {it.outline && (
                  <details className="text-[13px]">
                    <summary className="cursor-pointer text-fg-secondary">{`Outline: ${it.outline.length} line(s)${it.outlineConflict ? " — differs from the master outline" : ""}`}</summary>
                    <div className="mt-2 grid gap-3 sm:grid-cols-2">
                      <ol className="list-decimal pl-5 text-fg">
                        {it.outline.map((l, i) => (
                          <li key={i}>{l}</li>
                        ))}
                      </ol>
                      {it.outlineConflict && it.currentOutline && (
                        <ol className="list-decimal pl-5 text-fg-secondary" aria-label="Current master outline">
                          {it.currentOutline.map((l, i) => (
                            <li key={i}>{l}</li>
                          ))}
                        </ol>
                      )}
                    </div>
                  </details>
                )}
                {review && it.outlineConflict && it.decision !== "IGNORE" && (
                  <div className="flex flex-wrap items-center gap-2" data-map-conflict="">
                    <span className="text-[13px] font-semibold text-warning-800">{it.outlineAction ? `Outline: ${it.outlineAction === "REPLACE" ? "replace" : "keep the current one"}` : "Outline conflict:"}</span>
                    <button type="button" className={studioQuietAction} disabled={pending} onClick={() => run(() => setMapOutlineAction(session.id, it.id, "REPLACE"), "The new outline will replace the current one.")}>
                      Replace
                    </button>
                    <button type="button" className={studioQuietAction} disabled={pending} onClick={() => run(() => setMapOutlineAction(session.id, it.id, "KEEP"), "The current outline is kept.")}>
                      Keep current
                    </button>
                  </div>
                )}
                {review && isMap && it.decision !== "IGNORE" && (
                  <WeightageEdit item={it} disabled={pending} onSave={(tier, avg) => run(() => setMapWeightageAction(session.id, it.id, tier, avg), "Weightage saved.")} />
                )}
              </li>
            ))}
          </ul>
        </StudioPanel>
      ))}
    </div>
  );
}

function WeightageEdit({ item, disabled, onSave }: { item: MapItemView; disabled: boolean; onSave: (tier: string | null, avg: number | null) => void }) {
  const [tier, setTier] = useState(item.weightageTier ?? "");
  const [avg, setAvg] = useState(item.avgQuestions === null ? "" : String(item.avgQuestions));
  const changed = tier !== (item.weightageTier ?? "") || avg !== (item.avgQuestions === null ? "" : String(item.avgQuestions));
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="text-caption text-fg-secondary" htmlFor={`w-${item.id}`}>
        Weightage
      </label>
      <select id={`w-${item.id}`} value={tier} onChange={(e) => setTier(e.target.value)} className={`${studioControl} w-40`}>
        <option value="">—</option>
        {TIERS.map((t) => (
          <option key={t} value={t}>
            {t.replace(/_/g, " ").toLowerCase()}
          </option>
        ))}
      </select>
      <label className="text-caption text-fg-secondary" htmlFor={`a-${item.id}`}>
        Avg questions
      </label>
      <input id={`a-${item.id}`} inputMode="decimal" value={avg} onChange={(e) => setAvg(e.target.value)} className={`${studioControl} w-24`} />
      <button type="button" className={studioQuietAction} disabled={disabled || !changed || (avg.trim() !== "" && !Number.isFinite(Number(avg)))} onClick={() => onSave(tier || null, avg.trim() === "" ? null : Number(avg))}>
        Save
      </button>
    </div>
  );
}
