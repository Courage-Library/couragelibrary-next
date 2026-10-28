"use client";

import React, { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { StudioDrawer } from "@/components/admin/studio/studio-drawer";
import { StatusChip } from "@/components/admin/status-chip";
import {
  StudioEmpty,
  StudioField,
  StudioPageHeader,
  StudioPanel,
  StudioStatStrip,
  studioControl,
  studioPrimaryAction,
  studioQuietAction,
  type StudioStat,
} from "@/components/admin/studio/studio-page";
import type { IntakeBatchView, IntakeBulkAction, IntakeDecision, IntakeItemView, IntakeNodeOption, IntakeSessionView, IntakeSourceCheck } from "@/lib/syllabus/intake-types";
import { exactBatch, isOpenParent, outlineBatch, progress, subtopicBatch, suggestionsFor, waitingForParent } from "@/lib/syllabus/intake-assist";
import { weightageChecks } from "@/lib/syllabus/intake-contract";
import { bulkIntakeAction, decideIntakeItemAction, discardIntakeAction, importIntakeAction, undoIntakeBulkAction } from "@/app/admin/syllabus/intake/actions";
import { addTaxonomyAliasAction } from "@/app/admin/taxonomy/actions";

/**
 * CA-2 owner review (Studio template): the intake as a tree diff against the master tree. Per item the owner LINKs it
 * to a node, LINKs + adds its name as an ALIAS, APPROVEs it as a new node, IGNOREs it (with everything below it) or —
 * a concept — KEEPs it as a line of its subtopic's lesson outline (no node). Parents first. When every item is decided
 * and the source is checked, one DRAFT syllabus.
 * SYLLABUS-PROMPT-2: origin (Official / PYQ trend / Expanded) and weightage per item; an origin filter; "based on".
 * SYLLABUS-CONTRACT-3.1: an uncertain PAPER gets a warning banner; a linked item's AI aliases are one-click "Add as
 * alias" (the audited admin alias action, on the owner's click only).
 * INTAKE-ASSIST-1: a sticky guide (7 steps, live counts, one action each — the current step's is the page's one
 * primary action); decision buttons on every row; topics collapsed with child counts; status / level filters; a
 * progress bar; bulk steps are one audited transaction each and the newest can be undone until the draft exists.
 */

interface Props {
  session: IntakeSessionView | null;
  items: IntakeItemView[];
  nodes: IntakeNodeOption[];
  lastBatch: IntakeBatchView | null;
  loadError: string | null;
}

const LEVEL_LABEL: Record<string, string> = { PAPER: "Paper", SUBJECT: "Subject", TOPIC: "Topic", SUBTOPIC: "Subtopic", CONCEPT: "Concept" };
const INDENT: Record<string, string> = { PAPER: "pl-0", SUBJECT: "pl-3", TOPIC: "pl-6", SUBTOPIC: "pl-10", CONCEPT: "pl-14" };
const MATCH_LABEL: Record<string, string> = { EXACT: "Exact match", ALIAS: "Alias match", CLOSE: "Close: check", NEW: "New", NOT_APPLICABLE: "" };
const MATCH_STYLE: Record<string, string> = {
  EXACT: "border-success-200 bg-success-50 text-success-800",
  ALIAS: "border-success-200 bg-success-50 text-success-800",
  CLOSE: "border-warning-200 bg-warning-50 text-fg",
  NEW: "border-primary-200 bg-primary-50 text-primary-800",
  NOT_APPLICABLE: "",
};
const DECISION_LABEL: Record<IntakeDecision, string> = { LINK: "Linked", ALIAS: "Linked + alias", APPROVE_NEW: "Approved as new", IGNORE: "Ignored", OUTLINE: "Kept as lesson outline" };
const BULK_LABEL: Record<IntakeBulkAction, string> = { LINK_EXACT: "Linked exact matches", APPROVE_CHILDREN: "Approved new subtopics", KEEP_OUTLINE: "Kept concepts as lesson outlines" };
const ORIGIN_LABEL: Record<string, string> = { OFFICIAL: "Official", PYQ_TREND: "PYQ trend", EXPANDED: "Expanded" };
const ORIGIN_STYLE: Record<string, string> = {
  OFFICIAL: "border-primary-200 bg-primary-50 text-primary-800",
  PYQ_TREND: "border-warning-200 bg-warning-50 text-fg",
  EXPANDED: "border-line bg-ink-50 text-fg-secondary",
};
/** "What does this mean?" — one line each. */
const MEANING: [string, string][] = [
  ["Link", "It is the same thing as an existing node of the master tree; nothing new is created."],
  ["Link + alias", "Same thing, different name: the name is saved so future syllabi match it automatically."],
  ["Approve new", "Creates it in the master tree under its parent's node (audited)."],
  ["Ignore", "Leaves it, and everything below it, out of the draft."],
  ["Keep as outline", "Concepts only: no node; the concept becomes a MUST COVER line of its subtopic's lesson."],
];
const ORIGIN_FILTERS = ["ALL", "OFFICIAL", "PYQ_TREND", "EXPANDED"] as const;
type OriginFilter = (typeof ORIGIN_FILTERS)[number];
const STATUS_FILTERS = ["ALL", "UNDECIDED", "DECIDED"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];
const LEVEL_FILTERS = ["ALL", "SUBJECT", "TOPIC", "SUBTOPIC", "CONCEPT"] as const;
type LevelFilter = (typeof LEVEL_FILTERS)[number];
type MatchFilter = "ALL" | "CLOSE" | "NEW_TOPIC";
const chip = "rounded border px-1.5 py-0.5 text-[12px] font-semibold";
const segment = "focus-ring min-h-8 rounded-control border border-line bg-surface px-2 text-[12px] font-semibold text-fg hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-40";

export function IntakeReview({ session, items, nodes, lastBatch, loadError }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [versionTag, setVersionTag] = useState("");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [origin, setOrigin] = useState<OriginFilter>("ALL");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [level, setLevel] = useState<LevelFilter>("ALL");
  const [match, setMatch] = useState<MatchFilter>("ALL");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [guideOpen, setGuideOpen] = useState(true);
  const [sourceCheck, setSourceCheck] = useState<IntakeSourceCheck | null>(null);
  const [addedAliases, setAddedAliases] = useState<Set<string>>(new Set());

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const kids = useMemo(() => {
    const m = new Map<string, IntakeItemView[]>();
    for (const i of items) if (i.parentId) m.set(i.parentId, [...(m.get(i.parentId) || []), i]);
    return m;
  }, [items]);
  const decidable = items.filter((i) => i.level !== "PAPER");
  const open = decidable.filter((i) => !i.decision);
  const editable = session?.status === "REVIEW";
  const done = progress(items);

  const run = (fn: () => Promise<{ success: boolean; error?: string }>, ok: string, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.success) {
        setMessage({ kind: "ok", text: ok });
        after?.();
        router.refresh();
      } else setMessage({ kind: "error", text: r.error || "The change could not be saved." });
    });
  const decide = (i: IntakeItemView, d: IntakeDecision, nodeId: string | null, after?: () => void) =>
    session && run(() => decideIntakeItemAction(session.id, i.id, d, nodeId), `"${i.name}": ${DECISION_LABEL[d].toLowerCase()}.`, after);
  const bulk = (action: IntakeBulkAction, ids: string[]) =>
    session && ids.length > 0 && run(() => bulkIntakeAction(session.id, action, ids), `${BULK_LABEL[action]}: ${ids.length} item(s). You can undo this until you create the draft.`);
  const addAlias = (nodeId: string, alias: string) =>
    run(() => addTaxonomyAliasAction(nodeId, alias, "en"), `"${alias}" added as an alias.`, () => setAddedAliases((prev) => new Set(prev).add(`${nodeId}|${alias.toLowerCase()}`)));

  if (!session) {
    return (
      <div className="space-y-5">
        <StudioPageHeader title="Review syllabus intake" />
        <p role="alert" className="rounded-card border border-danger-200 bg-danger-50 px-4 py-3 text-[13px] font-semibold text-danger-800">
          {loadError || "Could not load the intake."}
        </p>
      </div>
    );
  }

  // ---------------------------------------------------------------- the guide's steps (live counts)
  const exactIds = exactBatch(items);
  const exactOpen = open.filter((i) => i.matchStatus === "EXACT").length;
  const closeOpen = open.filter((i) => i.matchStatus === "CLOSE");
  const newTopicsOpen = open.filter((i) => i.level === "TOPIC" && i.matchStatus === "NEW");
  const subIds = subtopicBatch(items);
  const subOpen = open.filter((i) => i.level === "SUBTOPIC").length;
  const outlineIds = outlineBatch(items);
  const conceptOpen = open.filter((i) => i.level === "CONCEPT").length;
  const weightage = weightageChecks(items.map((i) => ({ key: i.id, parentKey: i.parentId, level: i.level, name: i.name, questions: i.questions, avgQuestions: i.avgQuestions })));
  const papers = items.filter((i) => i.level === "PAPER");
  const showOnly = (m: MatchFilter, l: LevelFilter) => {
    setMatch(m);
    setLevel(l);
    setStatus("UNDECIDED");
    setOrigin("ALL");
  };

  interface Step {
    title: string;
    count: string;
    done: boolean;
    help: string;
    action?: { label: string; disabled: boolean; onClick: () => void };
    extra?: React.ReactNode;
  }
  const steps: Step[] = [
    {
      title: "Confirm exact matches",
      count: `${exactOpen} left`,
      done: exactOpen === 0,
      help: "These have the same name as a node already in the master tree. Linking them creates nothing new.",
      action: { label: `Link all exact matches (${exactIds.length})`, disabled: exactIds.length === 0, onClick: () => bulk("LINK_EXACT", exactIds) },
    },
    {
      title: "Check close matches",
      count: `${closeOpen.length} left`,
      done: closeOpen.length === 0,
      help: "Similar to an existing node. Open each one: link it if it is the same thing, otherwise approve it as new.",
      action: { label: "Show them", disabled: closeOpen.length === 0, onClick: () => showOnly("CLOSE", "ALL") },
    },
    {
      title: "Check new topics",
      count: `${newTopicsOpen.length} left`,
      done: newTopicsOpen.length === 0,
      help: "Each new topic shows the 3 most similar existing topics. Link one if it is the same thing; approve it as new only if it really is new.",
      action: { label: "Show them", disabled: newTopicsOpen.length === 0, onClick: () => showOnly("NEW_TOPIC", "TOPIC") },
    },
    {
      title: "Subtopics under decided topics",
      count: `${subOpen} left`,
      done: subOpen === 0,
      help: `New subtopics whose topic you have decided. Approve them all here, or per topic on its row.${waitingForParent(items, "SUBTOPIC") ? ` ${waitingForParent(items, "SUBTOPIC")} wait for their topic.` : ""}`,
      action: { label: `Approve all new subtopics under decided topics (${subIds.length})`, disabled: subIds.length === 0, onClick: () => bulk("APPROVE_CHILDREN", subIds) },
    },
    {
      title: "Concepts",
      count: `${conceptOpen} left`,
      done: conceptOpen === 0,
      help: `Concepts become the MUST COVER outline of their subtopic's lesson instead of new nodes. You can still approve a single concept as its own node.${waitingForParent(items, "CONCEPT") ? ` ${waitingForParent(items, "CONCEPT")} wait for their subtopic.` : ""}`,
      action: { label: `Keep all as lesson outline (${outlineIds.length})`, disabled: outlineIds.length === 0, onClick: () => bulk("KEEP_OUTLINE", outlineIds) },
    },
    {
      title: "Verify source & weightage",
      count: sourceCheck ? "checked" : "to check",
      done: sourceCheck !== null,
      help: "Open the official website and find the notification named below. The weightage figures are the assistant's estimates.",
      extra: (
        <div className="mt-2 grid gap-2 text-[13px]" data-step-source="">
          <p>
            <span className="font-semibold">Based on:</span> {session.basedOn || "not given"}
          </p>
          {papers.map((p) => (
            <p key={p.id}>
              <span className="font-semibold">{p.name}:</span> {p.uncertain ? <span className="text-warning-800">marked uncertain — {p.uncertainReason || "no reason given"}</span> : "not marked uncertain by the assistant"}
              {p.questions !== null ? ` · ${p.questions} questions` : ""}
            </p>
          ))}
          {weightage.length > 0 && (
            <ul aria-label="Weightage per subject" className="grid gap-1" data-weightage="">
              {weightage.map((w) => (
                <li key={w.path} className={w.off ? "font-semibold text-warning-800" : "text-fg-secondary"}>
                  {w.off ? "⚠ " : ""}
                  {w.message}
                </li>
              ))}
            </ul>
          )}
          <fieldset className="grid gap-1" disabled={!editable}>
            <legend className="font-semibold text-fg">Before you create the draft (required)</legend>
            <label className="flex min-h-10 items-start gap-2">
              <input type="radio" name="source-check" className="mt-1 size-4" checked={sourceCheck === "VERIFIED"} onChange={() => setSourceCheck("VERIFIED")} />
              <span>I verified the notification on the official website (ssc.gov.in for SSC exams).</span>
            </label>
            <label className="flex min-h-10 items-start gap-2">
              <input type="radio" name="source-check" className="mt-1 size-4" checked={sourceCheck === "UNVERIFIABLE"} onChange={() => setSourceCheck("UNVERIFIABLE")} />
              <span>Not verifiable — mark the paper as uncertain in the draft.</span>
            </label>
          </fieldset>
        </div>
      ),
    },
    {
      title: "Create draft syllabus",
      count: open.length ? `${open.length} undecided` : "ready",
      done: Boolean(session.importedVersionId),
      help: "Creates one DRAFT. Check it in the editor against the notification before you publish.",
      action: {
        label: pending ? "Working…" : "Create draft syllabus",
        disabled: pending || open.length > 0 || sourceCheck === null,
        onClick: () =>
          start(async () => {
            const r = await importIntakeAction(session.id, versionTag.trim() || null, sourceCheck as IntakeSourceCheck);
            if (r.success) router.push(`/admin/syllabus/${r.data.versionId}`);
            else setMessage({ kind: "error", text: r.error });
          }),
      },
      extra: (
        <StudioField label="Version tag (optional)" htmlFor="rv-tag" className="mt-2 max-w-[18rem]">
          <input id="rv-tag" value={versionTag} onChange={(e) => setVersionTag(e.target.value.trim().toLowerCase())} maxLength={80} className={`${studioControl} font-mono`} />
        </StudioField>
      ),
    },
  ];
  const current = steps.findIndex((s) => !s.done);

  const stats: StudioStat[] = [
    { key: "EXACT", label: "Exact", value: decidable.filter((i) => i.matchStatus === "EXACT").length, tone: "green" },
    { key: "ALIAS", label: "Alias", value: decidable.filter((i) => i.matchStatus === "ALIAS").length, tone: "green" },
    { key: "CLOSE", label: "Close", value: decidable.filter((i) => i.matchStatus === "CLOSE").length, tone: "orange" },
    { key: "NEW", label: "New", value: decidable.filter((i) => i.matchStatus === "NEW").length, tone: "blue" },
    { key: "OPEN", label: "Undecided", value: open.length, tone: open.length ? "red" : "muted" },
    { key: "UNCERTAIN", label: "Uncertain", value: items.filter((i) => i.uncertain).length, tone: "orange" },
  ];

  // ---------------------------------------------------------------- the list
  const filtered = status !== "ALL" || level !== "ALL" || match !== "ALL" || origin !== "ALL";
  const keep = (i: IntakeItemView) =>
    i.level !== "PAPER" &&
    (status === "ALL" || (status === "UNDECIDED" ? !i.decision : Boolean(i.decision))) &&
    (level === "ALL" || i.level === level) &&
    (origin === "ALL" || i.origin === origin) &&
    (match === "ALL" || (match === "CLOSE" ? i.matchStatus === "CLOSE" : i.level === "TOPIC" && i.matchStatus === "NEW"));
  /** tree view: papers / subjects / topics always; a topic's subtree only when expanded */
  const treeRows = items.filter((i) => {
    if (i.level === "PAPER" || i.level === "SUBJECT" || i.level === "TOPIC") return true;
    let p = i.parentId ? byId.get(i.parentId) : undefined;
    while (p && p.level !== "TOPIC") p = p.parentId ? byId.get(p.parentId) : undefined;
    return Boolean(p && expanded.has(p.id));
  });
  const rows = filtered ? items.filter(keep) : treeRows;
  const countBelow = (id: string) => {
    let sub = 0;
    let con = 0;
    for (const s of kids.get(id) || []) {
      sub++;
      con += (kids.get(s.id) || []).length;
    }
    return { sub, con };
  };
  const trail = (i: IntakeItemView) => {
    const out: string[] = [];
    let p = i.parentId ? byId.get(i.parentId) : undefined;
    while (p && p.level !== "PAPER") {
      out.unshift(p.name);
      p = p.parentId ? byId.get(p.parentId) : undefined;
    }
    return out.join(" › ");
  };
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const pct = done.total ? Math.round((done.decided / done.total) * 100) : 0;

  return (
    <div className="space-y-5">
      <StudioPageHeader
        title="Review syllabus intake"
        description={`${session.examTitle}${session.cycleYear ? ` · ${session.cycleYear}` : ""}${session.tier ? ` · ${session.tier}` : ""}${session.asOf ? ` · as of ${session.asOf}` : ""}. Nothing changes in the master tree until you decide.`}
        meta={<StatusChip status={session.status} />}
        actions={
          <>
            {session.sourceUrl && (
              <a href={session.sourceUrl} target="_blank" rel="noopener noreferrer" className={studioQuietAction}>
                {session.contractVersion === 2 ? "Official notification" : "Reference link"}
              </a>
            )}
            {session.importedVersionId && (
              <Link href={`/admin/syllabus/${session.importedVersionId}`} className={studioQuietAction}>
                Open the draft
              </Link>
            )}
            <Link href="/admin/syllabus/intake" className={studioQuietAction}>
              All intakes
            </Link>
            {editable &&
              (confirmDiscard ? (
                <span className="flex items-center gap-2">
                  <button type="button" disabled={pending} onClick={() => run(() => discardIntakeAction(session.id), "Intake discarded.")} className={studioQuietAction}>
                    Confirm discard
                  </button>
                  <button type="button" onClick={() => setConfirmDiscard(false)} className={studioQuietAction}>
                    Keep
                  </button>
                </span>
              ) : (
                <button type="button" onClick={() => setConfirmDiscard(true)} className={studioQuietAction}>
                  Discard intake…
                </button>
              ))}
          </>
        }
      />

      {/* ------------------------------------------------------------ the guide (sticky, collapsible) */}
      <section aria-labelledby="guide-title" data-intake-guide="" className="sticky top-0 z-10 rounded-card border border-line bg-surface p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="guide-title" className="text-[15px] font-bold text-fg">
            What to do
          </h2>
          <div className="flex min-w-[12rem] flex-1 items-center gap-2">
            <div role="progressbar" aria-label="Items decided" aria-valuemin={0} aria-valuemax={done.total} aria-valuenow={done.decided} className="h-2 flex-1 overflow-hidden rounded-full bg-ink-100">
              <div className="h-full bg-primary-700" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-[13px] font-semibold text-fg" data-progress="">
              {done.decided}/{done.total} decided
            </span>
          </div>
          {editable && lastBatch && (
            <button type="button" disabled={pending} className={studioQuietAction} onClick={() => run(() => undoIntakeBulkAction(session.id), "The last bulk action was undone.")} data-undo-bulk="">
              Undo last bulk action ({BULK_LABEL[lastBatch.action].toLowerCase()}, {lastBatch.count})
            </button>
          )}
          <button type="button" aria-expanded={guideOpen} aria-controls="guide-steps" onClick={() => setGuideOpen((v) => !v)} className={studioQuietAction}>
            {guideOpen ? "Hide steps" : "Show steps"}
          </button>
        </div>
        {guideOpen && (
          <div id="guide-steps" className="mt-3 max-h-[55vh] overflow-y-auto pr-1">
            <ol className="grid gap-2">
              {steps.map((s, n) => (
                <li key={s.title} className={`rounded-control border px-3 py-2 ${n === current ? "border-primary-300 bg-primary-50" : "border-line"}`} data-step={n + 1}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span aria-hidden="true" className={`inline-flex size-6 items-center justify-center rounded-full text-[12px] font-bold ${s.done ? "bg-success-600 text-white" : "bg-ink-100 text-fg"}`}>
                      {s.done ? "✓" : n + 1}
                    </span>
                    <span className="text-[14px] font-semibold text-fg">
                      Step {n + 1}: {s.title}
                    </span>
                    <span className="text-[12px] text-fg-secondary">
                      {s.done ? <span className="font-semibold text-success-700">Done</span> : s.count}
                    </span>
                    {s.action && editable && (
                      <button type="button" disabled={pending || s.action.disabled} onClick={s.action.onClick} className={`ml-auto ${n === current ? studioPrimaryAction : studioQuietAction}`}>
                        {s.action.label}
                      </button>
                    )}
                  </div>
                  {(n === current || !s.done) && <p className="mt-1 text-[13px] text-fg-secondary">{s.help}</p>}
                  {n === current || n === 5 || n === 6 ? s.extra : null}
                </li>
              ))}
            </ol>
            <details className="mt-3 text-[13px]">
              <summary className="focus-ring cursor-pointer font-semibold text-link">What does this mean?</summary>
              <dl className="mt-2 grid gap-1 sm:grid-cols-[9rem_1fr]">
                {MEANING.map(([k, v]) => (
                  <React.Fragment key={k}>
                    <dt className="font-semibold text-fg">{k}</dt>
                    <dd className="text-fg-secondary">{v}</dd>
                  </React.Fragment>
                ))}
              </dl>
            </details>
          </div>
        )}
      </section>

      <StudioStatStrip label="Intake items by match (not counting papers)" stats={stats} />
      <div role="status" aria-live="polite">
        {message && (
          <p className={`rounded-card border px-4 py-3 text-[13px] font-semibold ${message.kind === "ok" ? "border-success-200 bg-success-50 text-success-800" : "border-danger-200 bg-danger-50 text-danger-800"}`}>{message.text}</p>
        )}
      </div>

      <StudioPanel>
        <div className="mb-3 grid gap-2 text-[13px]">
          <FilterRow label="Status" value={status} options={STATUS_FILTERS} text={(v) => (v === "ALL" ? "All" : v === "UNDECIDED" ? `Undecided (${open.length})` : `Decided (${done.decided})`)} onChange={setStatus} />
          <FilterRow label="Level" value={level} options={LEVEL_FILTERS} text={(v) => (v === "ALL" ? "All" : `${LEVEL_LABEL[v]}s (${decidable.filter((i) => i.level === v).length})`)} onChange={setLevel} />
          {items.some((i) => i.origin) && (
            <FilterRow label="Origin" value={origin} options={ORIGIN_FILTERS} text={(v) => (v === "ALL" ? "All" : `${ORIGIN_LABEL[v]} (${items.filter((i) => i.origin === v).length})`)} onChange={setOrigin} />
          )}
          {(filtered || match !== "ALL") && (
            <p className="flex flex-wrap items-center gap-2">
              {match !== "ALL" && <span className="font-semibold text-fg">{match === "CLOSE" ? "Showing close matches" : "Showing new topics"}</span>}
              <button
                type="button"
                className={studioQuietAction}
                onClick={() => {
                  setStatus("ALL");
                  setLevel("ALL");
                  setOrigin("ALL");
                  setMatch("ALL");
                }}
              >
                Clear filters (show the tree)
              </button>
            </p>
          )}
        </div>
        {papers
          .filter((p) => p.uncertain)
          .map((p) => (
            <p key={`unc-${p.id}`} role="note" data-paper-uncertain="" className="mb-3 rounded-card border border-warning-200 bg-warning-50 px-4 py-3 text-[13px] text-fg">
              <span className="font-semibold text-warning-800">{p.name}: the assistant was not sure of this paper.</span> {p.uncertainReason || "No reason given."} Check it against the
              official notification before you create the draft.
            </p>
          ))}
        {items.length === 0 ? (
          <StudioEmpty title="No items" body="This intake has no items." />
        ) : rows.length === 0 ? (
          <StudioEmpty title="Nothing here" body="No item matches these filters." />
        ) : (
          <ul aria-label="Intake items" className="divide-y divide-line">
            {rows.map((i) => {
              const parent = i.parentId ? byId.get(i.parentId) : undefined;
              const parentOpen = i.level === "SUBJECT" || isOpenParent(parent);
              const final = i.decision === "ALIAS" || i.decision === "APPROVE_NEW";
              const below = i.level === "TOPIC" ? countBelow(i.id) : null;
              const topicSubs = i.level === "TOPIC" && editable ? subtopicBatch(items, i.id) : [];
              const suggest = editable && !i.decision && (i.level === "TOPIC" || i.matchStatus === "CLOSE") && i.matchStatus !== "EXACT" ? suggestionsFor(i, parent, nodes) : [];
              const quickLink = i.matchedNodeId && (i.matchStatus === "EXACT" || i.matchStatus === "ALIAS") ? i.matchedNodeId : null;
              return (
                <li key={i.id} className={`${filtered ? "pl-0" : INDENT[i.level]} py-1.5`} data-level={i.level}>
                  {i.level === "PAPER" ? (
                    <p className="py-1 text-[14px] font-bold text-fg">
                      {i.name}
                      {i.questions !== null ? <span className="ml-2 text-[13px] font-normal text-fg-secondary">{i.questions} questions</span> : null}
                      {i.durationMinutes !== null ? <span className="ml-2 text-[13px] font-normal text-fg-secondary">{i.durationMinutes} min</span> : null}
                      {i.negativeMarking ? <span className="ml-2 text-[13px] font-normal text-fg-secondary">negative: {i.negativeMarking}</span> : null}
                    </p>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      {i.level === "TOPIC" && !filtered && below && below.sub > 0 && (
                        <button type="button" aria-expanded={expanded.has(i.id)} aria-label={`${expanded.has(i.id) ? "Collapse" : "Expand"} ${i.name}`} onClick={() => toggle(i.id)} className={`${segment} w-8 px-0`}>
                          {expanded.has(i.id) ? "−" : "+"}
                        </button>
                      )}
                      <span className="text-[12px] font-semibold text-fg-secondary">{LEVEL_LABEL[i.level]}</span>
                      <span className="text-[14px] font-semibold text-fg">{i.name}</span>
                      {filtered && trail(i) && <span className="text-[12px] text-fg-secondary">in {trail(i)}</span>}
                      {i.nameHi && <span className="text-[13px] text-fg-secondary">{i.nameHi}</span>}
                      <span className={`${chip} ${MATCH_STYLE[i.matchStatus]}`}>{MATCH_LABEL[i.matchStatus]}</span>
                      {i.origin && <span className={`${chip} ${ORIGIN_STYLE[i.origin]}`}>{ORIGIN_LABEL[i.origin]}</span>}
                      {i.weightageTier && <span className="text-[12px] font-semibold text-fg-secondary">{i.weightageTier.replace("_", " ")}</span>}
                      {i.avgQuestions !== null && <span className="text-[12px] text-fg-secondary">~{i.avgQuestions} Q</span>}
                      {i.uncertain && <span className="text-[12px] font-semibold text-warning-700">Uncertain</span>}
                      {below && below.sub > 0 && (
                        <span className="text-[12px] text-fg-secondary">
                          {below.sub} subtopic(s){below.con ? ` · ${below.con} concept(s)` : ""}
                        </span>
                      )}
                      <span className="ml-auto flex flex-wrap items-center gap-1">
                        {i.decision ? (
                          <>
                            <span className="text-[12px] font-semibold text-success-700">{DECISION_LABEL[i.decision]}</span>
                            {editable && !final && (
                              <button type="button" className={segment} onClick={() => setSelectedId(i.id)} aria-label={`Change the decision for ${i.name}`}>
                                Change
                              </button>
                            )}
                          </>
                        ) : editable ? (
                          <span role="group" aria-label={`Decide ${i.name}`} className="flex flex-wrap gap-1" data-row-decisions="">
                            {quickLink && (
                              <button type="button" className={segment} disabled={pending || !parentOpen} title={parentOpen ? undefined : "Decide its parent first"} onClick={() => decide(i, "LINK", quickLink)}>
                                Link
                              </button>
                            )}
                            {i.level === "CONCEPT" && (
                              <button type="button" className={segment} disabled={pending || !parentOpen} title={parentOpen ? undefined : "Decide its subtopic first"} onClick={() => decide(i, "OUTLINE", null)}>
                                Keep as outline
                              </button>
                            )}
                            <button type="button" className={segment} disabled={pending || !parentOpen} title={parentOpen ? undefined : "Decide its parent first"} onClick={() => decide(i, "APPROVE_NEW", null)}>
                              Approve new
                            </button>
                            <button type="button" className={segment} disabled={pending} onClick={() => decide(i, "IGNORE", null)}>
                              Ignore
                            </button>
                            <button type="button" className={segment} onClick={() => setSelectedId(i.id)} aria-label={`More choices for ${i.name}`}>
                              More…
                            </button>
                          </span>
                        ) : (
                          <span className="text-[12px] font-semibold text-danger-700">Undecided</span>
                        )}
                      </span>
                    </div>
                  )}
                  {topicSubs.length > 0 && (
                    <p className="mt-1 pl-2 text-[12px]">
                      <button type="button" className={studioQuietAction} disabled={pending} onClick={() => bulk("APPROVE_CHILDREN", topicSubs)} data-topic-approve="">
                        Approve its {topicSubs.length} new subtopic(s)
                      </button>
                    </p>
                  )}
                  {suggest.length > 0 && (
                    <div className="mt-1 flex flex-wrap items-center gap-1 pl-2 text-[12px]" data-suggestions="">
                      <span className="text-fg-secondary">Most similar existing {LEVEL_LABEL[i.level].toLowerCase()}s:</span>
                      {suggest.map((s) => (
                        <span key={s.nodeId} className="flex items-center gap-1 rounded border border-line px-1.5 py-0.5">
                          <span className="font-semibold text-fg">{s.name}</span>
                          <span className="text-fg-secondary">{Math.round(s.score * 100)}%</span>
                          <button type="button" className={segment} disabled={pending} onClick={() => decide(i, "LINK", s.nodeId)} aria-label={`Link ${i.name} to ${s.name}`}>
                            Link
                          </button>
                          <button type="button" className={segment} disabled={pending} onClick={() => decide(i, "ALIAS", s.nodeId)} aria-label={`Link ${i.name} to ${s.name} and add the name as an alias`}>
                            + alias
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  {(i.decision === "LINK" || i.decision === "ALIAS") && i.decisionNodeId && i.aliases.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1 pb-1 pl-2 text-[12px]" data-ai-aliases="">
                      <span className="text-fg-secondary">AI aliases:</span>
                      {i.aliases.map((a) => {
                        const added = addedAliases.has(`${i.decisionNodeId}|${a.toLowerCase()}`);
                        return added ? (
                          <span key={a} className="rounded border border-success-200 bg-success-50 px-1.5 py-0.5 font-semibold text-success-800">
                            {a} · added
                          </span>
                        ) : (
                          <button key={a} type="button" disabled={pending} onClick={() => addAlias(i.decisionNodeId as string, a)} className={studioQuietAction} aria-label={`Add "${a}" as an alias of the linked node`}>
                            Add as alias: {a}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </StudioPanel>

      {selectedId && byId.get(selectedId) && (
        <DecisionDrawer
          key={selectedId}
          item={byId.get(selectedId) as IntakeItemView}
          parent={byId.get(selectedId)?.parentId ? byId.get(byId.get(selectedId)?.parentId as string) || null : null}
          nodes={nodes}
          editable={editable}
          pending={pending}
          onClose={() => setSelectedId(null)}
          onDecide={(d, nodeId) => decide(byId.get(selectedId) as IntakeItemView, d, nodeId, () => setSelectedId(null))}
        />
      )}
    </div>
  );
}

function FilterRow<T extends string>({ label, value, options, text, onChange }: { label: string; value: T; options: readonly T[]; text: (v: T) => string; onChange: (v: T) => void }) {
  return (
    <div role="group" aria-label={`Filter by ${label.toLowerCase()}`} className="flex flex-wrap items-center gap-2">
      <span className="w-14 font-semibold text-fg-secondary">{label}:</span>
      {options.map((o) => (
        <button key={o} type="button" aria-pressed={value === o} onClick={() => onChange(o)} className={`${studioQuietAction} ${value === o ? "border border-primary-300 bg-primary-50 font-bold" : ""}`}>
          {text(o)}
        </button>
      ))}
    </div>
  );
}

function DecisionDrawer({
  item,
  parent,
  nodes,
  editable,
  pending,
  onClose,
  onDecide,
}: {
  item: IntakeItemView;
  parent: IntakeItemView | null;
  nodes: IntakeNodeOption[];
  editable: boolean;
  pending: boolean;
  onClose: () => void;
  onDecide: (d: IntakeDecision, nodeId: string | null) => void;
}) {
  // the choices: active nodes of this level under the parent's decided node (a subject: the root subjects)
  const scope = item.level === "SUBJECT" ? null : isOpenParent(parent ?? undefined) ? parent?.decisionNodeId : undefined;
  const options = scope === undefined ? [] : nodes.filter((n) => n.nodeType === item.level && (n.parentId ?? null) === scope);
  const firstChoice = item.decisionNodeId || item.matchedNodeId || item.candidates.find((c) => options.some((o) => o.id === c.node_id))?.node_id || "";
  const [decision, setDecision] = useState<IntakeDecision>(item.decision || (item.level === "CONCEPT" && item.origin === "EXPANDED" ? "OUTLINE" : item.matchStatus === "NEW" ? "APPROVE_NEW" : "LINK"));
  const [nodeId, setNodeId] = useState(firstChoice);
  const final = item.decision === "ALIAS" || item.decision === "APPROVE_NEW";
  const blockedByParent = item.level !== "SUBJECT" && scope === undefined;
  const needsNode = decision === "LINK" || decision === "ALIAS";
  const canSave = editable && !final && !pending && (decision === "IGNORE" || (!blockedByParent && (!needsNode || Boolean(nodeId))));
  const choices = (
    [
      ["LINK", "Link to an existing node", "It is the same item as the chosen node."],
      ["ALIAS", "Link and add this name as an alias", "Same item, different name: future syllabi will match it automatically."],
      ["APPROVE_NEW", "Approve as a new node", "Creates it in the master tree under the parent's node (audited)."],
      ["OUTLINE", "Keep as lesson outline", "No node: it becomes a MUST COVER line of its subtopic's lesson."],
      ["IGNORE", "Ignore", "Leaves it (and everything below it) out of the draft."],
    ] as const
  ).filter(([value]) => value !== "OUTLINE" || item.level === "CONCEPT");

  return (
    <StudioDrawer
      open
      wide
      onClose={onClose}
      title={item.name}
      subtitle={`${LEVEL_LABEL[item.level]} · ${MATCH_LABEL[item.matchStatus]}`}
      footer={
        <>
          <button type="button" onClick={onClose} className={studioQuietAction}>
            Close
          </button>
          {editable && !final && (
            <button type="button" disabled={!canSave} onClick={() => onDecide(decision, needsNode ? nodeId : null)} className={studioPrimaryAction}>
              Save decision
            </button>
          )}
        </>
      }
    >
      <div className="grid gap-5 text-[14px]">
        <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[10rem_1fr]">
          {item.nameHi && (
            <>
              <dt className="text-fg-secondary">Second name</dt>
              <dd>{item.nameHi}</dd>
            </>
          )}
          {item.aliases.length > 0 && (
            <>
              <dt className="text-fg-secondary">Other names</dt>
              <dd>{item.aliases.join(", ")}</dd>
            </>
          )}
          {item.origin && (
            <>
              <dt className="text-fg-secondary">Origin</dt>
              <dd>{ORIGIN_LABEL[item.origin]}</dd>
            </>
          )}
          {(item.weightageTier || item.avgQuestions !== null) && (
            <>
              <dt className="text-fg-secondary">Weightage</dt>
              <dd>{[item.weightageTier ? item.weightageTier.replace("_", " ") : null, item.avgQuestions !== null ? `about ${item.avgQuestions} question(s) per paper` : null].filter(Boolean).join(" · ")}</dd>
            </>
          )}
          {(item.questions !== null || item.marks !== null) && (
            <>
              <dt className="text-fg-secondary">Weight</dt>
              <dd>{[item.questions !== null ? `${item.questions} questions` : null, item.marks !== null ? `${item.marks} marks` : null].filter(Boolean).join(" · ")}</dd>
            </>
          )}
          {item.uncertain && (
            <>
              <dt className="text-fg-secondary">Uncertain</dt>
              <dd className="text-warning-700">{item.uncertainReason || "No reason given."}</dd>
            </>
          )}
          {item.headings.length > 0 && (
            <>
              <dt className="text-fg-secondary">Deeper headings</dt>
              <dd>{item.headings.join(" › ")}</dd>
            </>
          )}
        </dl>

        {final ? (
          <p className="rounded-card border border-line bg-ink-50 px-3 py-2 text-[13px]">
            {DECISION_LABEL[item.decision as IntakeDecision]}: this changed the master tree and is final. Discard the intake and start again to choose differently.
          </p>
        ) : !editable ? (
          <p className="text-[13px] text-fg-secondary">This intake is closed.</p>
        ) : (
          <fieldset className="grid gap-3">
            <legend className="mb-1 text-[15px] font-bold text-fg">Decision</legend>
            {blockedByParent && (
              <p className="rounded-card border border-warning-200 bg-warning-50 px-3 py-2 text-[13px]">
                {parent?.decision === "IGNORE" ? `"${parent.name}" is ignored, so this item can only be ignored.` : `Decide "${parent?.name ?? "the parent"}" first; this item's choices are its children.`}
              </p>
            )}
            {choices.map(([value, label, help]) => (
              <label key={value} className="flex min-h-10 cursor-pointer items-start gap-2">
                <input type="radio" name="decision" value={value} checked={decision === value} onChange={() => setDecision(value)} disabled={blockedByParent && value !== "IGNORE"} className="mt-1 size-4" />
                <span>
                  <span className="font-semibold text-fg">{label}</span>
                  <span className="block text-[13px] text-fg-secondary">{help}</span>
                </span>
              </label>
            ))}
            {needsNode && !blockedByParent && (
              <StudioField label="Node" htmlFor="dc-node">
                <select id="dc-node" value={nodeId} onChange={(e) => setNodeId(e.target.value)} className={studioControl}>
                  <option value="">Choose…</option>
                  {options.map((o) => {
                    const c = item.candidates.find((x) => x.node_id === o.id);
                    return (
                      <option key={o.id} value={o.id}>
                        {o.name}
                        {o.id === item.matchedNodeId ? " (match)" : c ? ` (suggested, ${Math.round(c.score * 100)}%)` : ""}
                      </option>
                    );
                  })}
                </select>
              </StudioField>
            )}
            {needsNode && !blockedByParent && options.length === 0 && <p className="text-[13px] text-fg-secondary">There is no existing {LEVEL_LABEL[item.level].toLowerCase()} here; approve it as new or ignore it.</p>}
          </fieldset>
        )}
      </div>
    </StudioDrawer>
  );
}
