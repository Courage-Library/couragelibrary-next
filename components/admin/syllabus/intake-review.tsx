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
import type { IntakeDecision, IntakeItemView, IntakeNodeOption, IntakeSessionView } from "@/lib/syllabus/intake-types";
import { decideIntakeItemAction, discardIntakeAction, importIntakeAction } from "@/app/admin/syllabus/intake/actions";
import { addTaxonomyAliasAction } from "@/app/admin/taxonomy/actions";

/**
 * CA-2 owner review (Studio template): the intake as a tree diff against the master tree. Per item the owner LINKs it
 * to a node, LINKs + adds its name as an ALIAS, APPROVEs it as a new node, or IGNOREs it (with everything below it).
 * Parents first: a child's choices are the parent's node's children. When every item is decided, one DRAFT syllabus.
 * SYLLABUS-PROMPT-2: each topic / subtopic / concept shows its origin (Official / PYQ trend / Expanded) and weightage; a
 * filter narrows the list by origin; "based on" is shown at the top. The owner still decides every node.
 * SYLLABUS-CONTRACT-3.1: an uncertain PAPER gets a warning banner with its reason; a linked item's AI aliases are offered
 * as one-click "Add as alias" (the audited admin alias action, on the owner's click only — never automatic).
 */

interface Props {
  session: IntakeSessionView | null;
  items: IntakeItemView[];
  nodes: IntakeNodeOption[];
  loadError: string | null;
}

const LEVEL_LABEL: Record<string, string> = { PAPER: "Paper", SUBJECT: "Subject", TOPIC: "Topic", SUBTOPIC: "Subtopic", CONCEPT: "Concept" };
const INDENT: Record<string, string> = { PAPER: "pl-0", SUBJECT: "pl-4", TOPIC: "pl-8", SUBTOPIC: "pl-12", CONCEPT: "pl-16" };
const MATCH_LABEL: Record<string, string> = { EXACT: "Exact match", ALIAS: "Alias match", CLOSE: "Close: check", NEW: "New", NOT_APPLICABLE: "" };
const MATCH_STYLE: Record<string, string> = {
  EXACT: "border-success-200 bg-success-50 text-success-800",
  ALIAS: "border-success-200 bg-success-50 text-success-800",
  CLOSE: "border-warning-200 bg-warning-50 text-fg",
  NEW: "border-primary-200 bg-primary-50 text-primary-800",
  NOT_APPLICABLE: "",
};
const DECISION_LABEL: Record<IntakeDecision, string> = { LINK: "Linked", ALIAS: "Linked + alias", APPROVE_NEW: "Approved as new", IGNORE: "Ignored" };
const ORIGIN_LABEL: Record<string, string> = { OFFICIAL: "Official", PYQ_TREND: "PYQ trend", EXPANDED: "Expanded" };
const ORIGIN_STYLE: Record<string, string> = {
  OFFICIAL: "border-primary-200 bg-primary-50 text-primary-800",
  PYQ_TREND: "border-warning-200 bg-warning-50 text-fg",
  EXPANDED: "border-line bg-ink-50 text-fg-secondary",
};
const ORIGIN_FILTERS = ["ALL", "OFFICIAL", "PYQ_TREND", "EXPANDED"] as const;
type OriginFilter = (typeof ORIGIN_FILTERS)[number];

export function IntakeReview({ session, items, nodes, loadError }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [versionTag, setVersionTag] = useState("");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [origin, setOrigin] = useState<OriginFilter>("ALL");
  const [addedAliases, setAddedAliases] = useState<Set<string>>(new Set());
  const addAlias = (nodeId: string, alias: string) =>
    run(() => addTaxonomyAliasAction(nodeId, alias, "en"), `"${alias}" added as an alias.`, () => setAddedAliases((prev) => new Set(prev).add(`${nodeId}|${alias.toLowerCase()}`)));

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const decidable = items.filter((i) => i.level !== "PAPER");
  const open = decidable.filter((i) => !i.decision);
  const editable = session?.status === "REVIEW";
  const stats: StudioStat[] = [
    { key: "EXACT", label: "Exact", value: decidable.filter((i) => i.matchStatus === "EXACT").length, tone: "green" },
    { key: "ALIAS", label: "Alias", value: decidable.filter((i) => i.matchStatus === "ALIAS").length, tone: "green" },
    { key: "CLOSE", label: "Close", value: decidable.filter((i) => i.matchStatus === "CLOSE").length, tone: "orange" },
    { key: "NEW", label: "New", value: decidable.filter((i) => i.matchStatus === "NEW").length, tone: "blue" },
    { key: "OPEN", label: "Undecided", value: open.length, tone: open.length ? "red" : "muted" },
    { key: "UNCERTAIN", label: "Uncertain", value: items.filter((i) => i.uncertain).length, tone: "orange" },
  ];

  const run = (fn: () => Promise<{ success: boolean; error?: string }>, ok: string, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.success) {
        setMessage({ kind: "ok", text: ok });
        after?.();
        router.refresh();
      } else setMessage({ kind: "error", text: r.error || "The change could not be saved." });
    });

  const createDraft = () =>
    start(async () => {
      if (!session) return;
      const r = await importIntakeAction(session.id, versionTag.trim() || null);
      if (r.success) router.push(`/admin/syllabus/${r.data.versionId}`);
      else setMessage({ kind: "error", text: r.error });
    });

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

  const selected = selectedId ? byId.get(selectedId) || null : null;
  const hasOrigins = items.some((i) => i.origin);
  // papers and subjects always stay visible as context; topics / subtopics / concepts follow the origin filter
  const visible = origin === "ALL" ? items : items.filter((i) => i.level === "PAPER" || i.level === "SUBJECT" || i.origin === origin);
  const originCount = (o: string) => items.filter((i) => i.origin === o).length;

  return (
    <div className="space-y-5">
      <StudioPageHeader
        title="Review syllabus intake"
        description={`${session.examTitle}${session.cycleYear ? ` · ${session.cycleYear}` : ""}${session.tier ? ` · ${session.tier}` : ""}${session.asOf ? ` · as of ${session.asOf}` : ""}. Decide every item; nothing changes in the master tree until you do.`}
        meta={<StatusChip status={session.status} />}
        primary={
          editable ? (
            <button type="button" className={studioPrimaryAction} disabled={pending || open.length > 0} onClick={createDraft}>
              {pending ? "Working…" : "Create draft syllabus"}
            </button>
          ) : undefined
        }
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
          </>
        }
      />
      {session.basedOn && (
        <p className="rounded-card border border-line bg-surface px-4 py-3 text-[14px]">
          <span className="font-semibold text-fg">Based on:</span> {session.basedOn}
        </p>
      )}
      <StudioStatStrip label="Intake items by match (not counting papers)" stats={stats} />
      <div role="status" aria-live="polite">
        {message && (
          <p className={`rounded-card border px-4 py-3 text-[13px] font-semibold ${message.kind === "ok" ? "border-success-200 bg-success-50 text-success-800" : "border-danger-200 bg-danger-50 text-danger-800"}`}>{message.text}</p>
        )}
      </div>

      {editable && (
        <StudioPanel>
          <div className="flex flex-wrap items-end gap-3">
            <StudioField label="Version tag (optional)" htmlFor="rv-tag" className="min-w-[14rem]">
              <input id="rv-tag" value={versionTag} onChange={(e) => setVersionTag(e.target.value.trim().toLowerCase())} maxLength={80} className={`${studioControl} font-mono`} />
            </StudioField>
            <p className="flex-1 text-[13px] text-fg-secondary">
              {open.length > 0 ? `${open.length} item(s) still need a decision. Decide parents first.` : "Every item is decided. Create the draft, then check it against the notification in the editor before publishing."}
            </p>
            {confirmDiscard ? (
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
            )}
          </div>
        </StudioPanel>
      )}

      <StudioPanel>
        {hasOrigins && (
          <div role="group" aria-label="Filter by origin" className="mb-3 flex flex-wrap items-center gap-2 text-[13px]">
            <span className="font-semibold text-fg-secondary">Origin:</span>
            {ORIGIN_FILTERS.map((o) => (
              <button
                key={o}
                type="button"
                aria-pressed={origin === o}
                onClick={() => setOrigin(o)}
                className={`${studioQuietAction} ${origin === o ? "border-primary-300 bg-primary-50 font-bold" : ""}`}
              >
                {o === "ALL" ? `All (${items.length})` : `${ORIGIN_LABEL[o]} (${originCount(o)})`}
              </button>
            ))}
          </div>
        )}
        {items
          .filter((p) => p.level === "PAPER" && p.uncertain)
          .map((p) => (
            <p key={`unc-${p.id}`} role="note" data-paper-uncertain="" className="mb-3 rounded-card border border-warning-200 bg-warning-50 px-4 py-3 text-[13px] text-fg">
              <span className="font-semibold text-warning-800">{p.name}: the assistant was not sure of this paper.</span> {p.uncertainReason || "No reason given."} Check it against the
              official notification before you create the draft.
            </p>
          ))}
        {items.length === 0 ? (
          <StudioEmpty title="No items" body="This intake has no items." />
        ) : (
          <ul aria-label="Intake items" className="space-y-0.5">
            {visible.map((i) => (
              <li key={i.id} className={INDENT[i.level]}>
                {i.level === "PAPER" ? (
                  <p className="py-2 text-[14px] font-bold text-fg">
                    {i.name}
                    {i.questions !== null ? <span className="ml-2 text-[13px] font-normal text-fg-secondary">{i.questions} questions</span> : null}
                    {i.durationMinutes !== null ? <span className="ml-2 text-[13px] font-normal text-fg-secondary">{i.durationMinutes} min</span> : null}
                    {i.negativeMarking ? <span className="ml-2 text-[13px] font-normal text-fg-secondary">negative: {i.negativeMarking}</span> : null}
                  </p>
                ) : (
                  <button type="button" onClick={() => setSelectedId(i.id)} className="focus-ring flex min-h-10 w-full flex-wrap items-center gap-2 rounded-control px-2 text-left hover:bg-ink-50">
                    <span className="text-[12px] font-semibold text-fg-secondary">{LEVEL_LABEL[i.level]}</span>
                    <span className="text-[14px] font-semibold text-fg">{i.name}</span>
                    {i.nameHi && <span className="text-[13px] text-fg-secondary">{i.nameHi}</span>}
                    <span className={`rounded border px-1.5 py-0.5 text-[12px] font-semibold ${MATCH_STYLE[i.matchStatus]}`}>{MATCH_LABEL[i.matchStatus]}</span>
                    {i.origin && <span className={`rounded border px-1.5 py-0.5 text-[12px] font-semibold ${ORIGIN_STYLE[i.origin]}`}>{ORIGIN_LABEL[i.origin]}</span>}
                    {i.weightageTier && <span className="text-[12px] font-semibold text-fg-secondary">{i.weightageTier.replace("_", " ")}</span>}
                    {i.avgQuestions !== null && <span className="text-[12px] text-fg-secondary">~{i.avgQuestions} Q</span>}
                    {i.uncertain && <span className="text-[12px] font-semibold text-warning-700">Uncertain</span>}
                    <span className={`ml-auto text-[12px] font-semibold ${i.decision ? "text-success-700" : "text-danger-700"}`}>{i.decision ? DECISION_LABEL[i.decision] : "Undecided"}</span>
                  </button>
                )}
                {(i.decision === "LINK" || i.decision === "ALIAS") && i.decisionNodeId && i.aliases.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1 pb-1 pl-2 text-[12px]" data-ai-aliases="">
                    <span className="text-fg-secondary">AI aliases:</span>
                    {i.aliases.map((a) => {
                      const done = addedAliases.has(`${i.decisionNodeId}|${a.toLowerCase()}`);
                      return done ? (
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
            ))}
          </ul>
        )}
      </StudioPanel>

      {selected && (
        <DecisionDrawer key={selected.id} item={selected} parent={selected.parentId ? byId.get(selected.parentId) || null : null} nodes={nodes} editable={editable} pending={pending}
          onClose={() => setSelectedId(null)}
          onDecide={(decision, nodeId) => run(() => decideIntakeItemAction(session.id, selected.id, decision, nodeId), `"${selected.name}": ${DECISION_LABEL[decision].toLowerCase()}.`, () => setSelectedId(null))}
        />
      )}
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
  const scope = item.level === "SUBJECT" ? null : parent?.decision && parent.decision !== "IGNORE" ? parent.decisionNodeId : undefined;
  const options = scope === undefined ? [] : nodes.filter((n) => n.nodeType === item.level && (n.parentId ?? null) === scope);
  const firstChoice = item.decisionNodeId || item.matchedNodeId || item.candidates.find((c) => options.some((o) => o.id === c.node_id))?.node_id || "";
  const [decision, setDecision] = useState<IntakeDecision>(item.decision || (item.matchStatus === "NEW" ? "APPROVE_NEW" : "LINK"));
  const [nodeId, setNodeId] = useState(firstChoice);
  const final = item.decision === "ALIAS" || item.decision === "APPROVE_NEW";
  const blockedByParent = item.level !== "SUBJECT" && scope === undefined;
  const needsNode = decision === "LINK" || decision === "ALIAS";
  const canSave = editable && !final && !pending && (decision === "IGNORE" || (!blockedByParent && (!needsNode || Boolean(nodeId))));

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
            {(
              [
                ["LINK", "Link to an existing node", "It is the same item as the chosen node."],
                ["ALIAS", "Link and add this name as an alias", "Same item, different name: future syllabi will match it automatically."],
                ["APPROVE_NEW", "Approve as a new node", "Creates it in the master tree under the parent's node (audited)."],
                ["IGNORE", "Ignore", "Leaves it (and everything below it) out of the draft."],
              ] as const
            ).map(([value, label, help]) => (
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
