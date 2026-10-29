"use client";

import React, { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Plus, Search } from "lucide-react";
import { StudioDrawer } from "@/components/admin/studio/studio-drawer";
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
import { normalizeTaxonomyName } from "@/lib/taxonomy/normalize";
import {
  MERGE_CONFIRM_WORD,
  MERGE_REASON_MIN,
  PROJECTED_NODE_TYPES,
  SUBJECT_TYPES,
  SUBJECT_TYPE_LABELS,
  allowedChildTypes,
  slugifyTaxonomyName,
  type SubjectType,
  type TaxonomyAlias,
  type TaxonomyNodeType,
  type TaxonomyTreeNode,
} from "@/services/taxonomy/taxonomy.rules";
import {
  addTaxonomyAliasAction,
  createTaxonomyNodeAction,
  mergeTaxonomyNodesAction,
  moveTaxonomyNodeAction,
  removeTaxonomyAliasAction,
  renameTaxonomyNodeAction,
  reorderTaxonomyNodesAction,
  setTaxonomyNodeActiveAction,
  setTaxonomyNodeInternalAction,
  updateTaxonomyDetailsAction,
} from "@/app/admin/taxonomy/actions";

/**
 * CA-1 master tree (Studio template): Subject → Topic → Subtopic → Concept, EN / HI names, aliases, same-level move
 * and the owner's merge (reason + typed confirmation). The database enforces every rule; this screen explains them.
 */

interface Props {
  tree: TaxonomyTreeNode[];
  aliases: TaxonomyAlias[];
  loadError: string | null;
  /** MASTER-TREE UX: node id → its node lesson state (absent = no lesson) */
  lessonStatus: Record<string, "DRAFT" | "PUBLISHED">;
}

type Result = { success: boolean; error?: string };

const LEVEL_LABEL: Record<TaxonomyNodeType, string> = {
  SUBJECT: "L1 Subject",
  TOPIC: "L2 Topic",
  SUBTOPIC: "L3 Subtopic",
  CONCEPT: "L4 Concept",
  DOMAIN: "Legacy domain",
  METHOD: "Legacy method",
};
const LEVEL_NOUN: Record<TaxonomyNodeType, string> = {
  SUBJECT: "subject",
  TOPIC: "topic",
  SUBTOPIC: "subtopic",
  CONCEPT: "concept",
  DOMAIN: "domain",
  METHOD: "method",
};
const LEVEL_STYLE: Record<TaxonomyNodeType, string> = {
  SUBJECT: "border-primary-200 bg-primary-50 text-primary-800",
  TOPIC: "border-success-200 bg-success-50 text-success-800",
  SUBTOPIC: "border-accent-200 bg-accent-50 text-accent-800",
  CONCEPT: "border-line bg-ink-50 text-fg-secondary",
  DOMAIN: "border-line bg-ink-50 text-fg-secondary",
  METHOD: "border-line bg-ink-50 text-fg-secondary",
};

/** MASTER-TREE UX: the node lesson state — colour + a text label (never colour alone) */
function LessonDot({ status }: { status: "DRAFT" | "PUBLISHED" | null }) {
  const label = status === "PUBLISHED" ? "Lesson published" : status === "DRAFT" ? "Lesson draft" : "No lesson";
  const dot = status === "PUBLISHED" ? "bg-success-600" : status === "DRAFT" ? "bg-warning-500" : "border border-ink-300 bg-white";
  return (
    <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 text-[12px] text-fg-secondary">
      <span aria-hidden="true" className={`inline-block size-2.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

function flatten(list: TaxonomyTreeNode[], out: TaxonomyTreeNode[] = []): TaxonomyTreeNode[] {
  list.forEach((n) => {
    out.push(n);
    flatten(n.children, out);
  });
  return out;
}

function descendantIds(node: TaxonomyTreeNode, out = new Set<string>()): Set<string> {
  node.children.forEach((c) => {
    out.add(c.id);
    descendantIds(c, out);
  });
  return out;
}

export function TaxonomyManager({ tree, aliases, loadError, lessonStatus }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(tree.map((n) => n.id)));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState<{ parentId: string | null; parentType: TaxonomyNodeType | null } | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [query, setQuery] = useState("");
  const [showInactive, setShowInactive] = useState(true);

  const all = useMemo(() => flatten(tree), [tree]);
  const byId = useMemo(() => new Map(all.map((n) => [n.id, n])), [all]);
  const aliasesByNode = useMemo(() => {
    const m = new Map<string, TaxonomyAlias[]>();
    aliases.forEach((a) => m.set(a.nodeId, [...(m.get(a.nodeId) || []), a]));
    return m;
  }, [aliases]);

  const stats: StudioStat[] = useMemo(() => {
    const count = (t: TaxonomyNodeType) => all.filter((n) => n.nodeType === t && n.isActive).length;
    return [
      { key: "SUBJECT", label: "Subjects", value: count("SUBJECT"), tone: "blue" },
      { key: "TOPIC", label: "Topics", value: count("TOPIC"), tone: "green" },
      { key: "SUBTOPIC", label: "Subtopics", value: count("SUBTOPIC"), tone: "teal" },
      { key: "CONCEPT", label: "Concepts", value: count("CONCEPT"), tone: "muted" },
      { key: "ALIASES", label: "Aliases", value: aliases.length, tone: "muted" },
      { key: "INACTIVE", label: "Inactive", value: all.filter((n) => !n.isActive).length, tone: "red" },
    ];
  }, [all, aliases.length]);

  // search: a node matches by name, Hindi name, slug or alias (same normalization as the database); ancestors stay visible
  const visible = useMemo(() => {
    const needle = normalizeTaxonomyName(query);
    const keep = new Set<string>();
    all.forEach((n) => {
      if (!showInactive && !n.isActive) return;
      const hay = [n.name, n.nameHi || "", n.slug, ...(aliasesByNode.get(n.id) || []).map((a) => a.alias)].map(normalizeTaxonomyName);
      if (!needle || hay.some((h) => h.includes(needle))) {
        let cur: TaxonomyTreeNode | undefined = n;
        while (cur) {
          keep.add(cur.id);
          cur = cur.parentId ? byId.get(cur.parentId) : undefined;
        }
      }
    });
    return keep;
  }, [all, aliasesByNode, byId, query, showInactive]);

  const run = (fn: () => Promise<Result>, okText: string, after?: () => void) => {
    startTransition(async () => {
      const res = await fn();
      if (res.success) {
        setMessage({ kind: "ok", text: okText });
        after?.();
        router.refresh();
      } else {
        setMessage({ kind: "error", text: res.error || "The change could not be saved." });
      }
    });
  };

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const reorder = (siblings: TaxonomyTreeNode[], index: number, delta: number, parentId: string | null) => {
    const target = index + delta;
    if (target < 0 || target >= siblings.length) return;
    const ids = siblings.map((s) => s.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    run(() => reorderTaxonomyNodesAction(parentId, ids), "Order updated.");
  };

  const renderNodes = (nodes: TaxonomyTreeNode[], parentId: string | null): React.ReactNode =>
    nodes.map((node, index) => {
      if (!visible.has(node.id)) return null;
      const open = expanded.has(node.id) || Boolean(query);
      const childTypes = allowedChildTypes(node.nodeType);
      const aliasCount = aliasesByNode.get(node.id)?.length || 0;
      return (
        <li key={node.id}>
          <div className={`flex items-center gap-1.5 rounded-control px-1 py-0.5 hover:bg-ink-50 ${node.isActive ? "" : "opacity-60"}`}>
            <button
              type="button"
              onClick={() => toggle(node.id)}
              disabled={node.children.length === 0}
              aria-expanded={node.children.length > 0 ? open : undefined}
              aria-label={`${open ? "Collapse" : "Expand"} ${node.name}`}
              className="focus-ring inline-flex size-10 shrink-0 items-center justify-center rounded-control text-fg-secondary disabled:invisible"
            >
              {open ? <ChevronDown aria-hidden="true" className="size-4" /> : <ChevronRight aria-hidden="true" className="size-4" />}
            </button>
            <button
              type="button"
              onClick={() => setSelectedId(node.id)}
              className="focus-ring flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-control px-1 text-left"
            >
              <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[11px] font-semibold ${LEVEL_STYLE[node.nodeType]}`}>{LEVEL_LABEL[node.nodeType]}</span>
              <span className="truncate text-[14px] font-semibold text-fg">{node.name}</span>
              {node.nameHi && <span className="truncate text-[13px] text-fg-secondary">{node.nameHi}</span>}
              {aliasCount > 0 && <span className="shrink-0 text-[12px] text-fg-secondary">{aliasCount === 1 ? "1 alias" : `${aliasCount} aliases`}</span>}
              {!node.isActive && <span className="shrink-0 text-[12px] font-semibold text-danger-700">{node.mergedInto ? "Merged" : "Inactive"}</span>}
              {node.nodeType === "SUBJECT" &&
                (node.subjectType ? (
                  <span className="shrink-0 rounded-full border border-line bg-ink-50 px-2 py-0.5 text-[11px] font-semibold text-fg">{SUBJECT_TYPE_LABELS[node.subjectType]}</span>
                ) : (
                  <span className="shrink-0 rounded-full border border-warning-200 bg-warning-50 px-2 py-0.5 text-[11px] font-semibold text-warning-800">Type not set</span>
                ))}
              {node.isInternal && <span className="shrink-0 rounded-full border border-line bg-ink-50 px-2 py-0.5 text-[11px] font-semibold text-fg-secondary">Internal</span>}
              {node.nodeType !== "SUBJECT" && <LessonDot status={lessonStatus[node.id] ?? null} />}
            </button>
            <span className="hidden shrink-0 font-mono text-[12px] text-ink-500 md:inline">{node.slug}</span>
            <button type="button" aria-label={`Move ${node.name} up`} disabled={isPending || index === 0} onClick={() => reorder(nodes, index, -1, parentId)} className="focus-ring inline-flex size-10 items-center justify-center rounded-control text-fg-secondary hover:bg-ink-100 disabled:opacity-30">
              <ArrowUp aria-hidden="true" className="size-4" />
            </button>
            <button type="button" aria-label={`Move ${node.name} down`} disabled={isPending || index === nodes.length - 1} onClick={() => reorder(nodes, index, 1, parentId)} className="focus-ring inline-flex size-10 items-center justify-center rounded-control text-fg-secondary hover:bg-ink-100 disabled:opacity-30">
              <ArrowDown aria-hidden="true" className="size-4" />
            </button>
            {childTypes.length > 0 ? (
              <button type="button" aria-label={`Add a child under ${node.name}`} disabled={isPending} onClick={() => setCreating({ parentId: node.id, parentType: node.nodeType })} className="focus-ring inline-flex size-10 items-center justify-center rounded-control text-link hover:bg-primary-50">
                <Plus aria-hidden="true" className="size-4" />
              </button>
            ) : (
              <span className="size-10" aria-hidden="true" />
            )}
          </div>
          {open && node.children.length > 0 && <ul className="ml-5 border-l border-line pl-1.5">{renderNodes(node.children, node.id)}</ul>}
        </li>
      );
    });

  const selected = selectedId ? byId.get(selectedId) || null : null;

  return (
    <div className="space-y-5">
      <StudioPageHeader
        title="Master tree"
        description="Subject → Topic → Subtopic → Concept: the one library every exam maps into. Names in both content languages, aliases, move and merge."
        primary={
          <button type="button" className={studioPrimaryAction} onClick={() => setCreating({ parentId: null, parentType: null })}>
            <Plus aria-hidden="true" className="size-4" /> Add subject
          </button>
        }
      />

      <StudioStatStrip label="Master tree counts (active nodes)" stats={stats} />

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

      <StudioPanel>
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <StudioField label="Find a node" htmlFor="tax-search" className="min-w-[16rem] flex-1">
            <div className="relative">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-500" />
              <input id="tax-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, Hindi name, slug or alias" className={`${studioControl} pl-9`} />
            </div>
          </StudioField>
          <label className="inline-flex min-h-10 items-center gap-2 text-[13px] text-fg">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="size-4" />
            Show inactive and merged
          </label>
        </div>
        {tree.length === 0 ? (
          <StudioEmpty title="No subjects yet" body="Add the first subject; topics, subtopics and concepts go under it." />
        ) : visible.size === 0 ? (
          <StudioEmpty title="Nothing matches" body="No name, Hindi name, slug or alias matches this search." />
        ) : (
          <ul aria-label="Master tree" className="space-y-0.5">
            {renderNodes(tree, null)}
          </ul>
        )}
      </StudioPanel>

      {creating && <CreateDrawer key={`new-${creating.parentId}`} creating={creating} parent={creating.parentId ? byId.get(creating.parentId) || null : null} pending={isPending} onClose={() => setCreating(null)} run={run} />}
      {selected && (
        <NodeDrawer
          key={selected.id}
          node={selected}
          byId={byId}
          all={all}
          aliases={aliasesByNode.get(selected.id) || []}
          pending={isPending}
          onClose={() => setSelectedId(null)}
          run={run}
        />
      )}
    </div>
  );
}

function rootSubjectType(node: TaxonomyTreeNode, byId: Map<string, TaxonomyTreeNode>): SubjectType | null {
  const root = node.rootSubjectId ? byId.get(node.rootSubjectId) : node.nodeType === "SUBJECT" ? node : undefined;
  return root?.subjectType ?? null;
}

function CreateDrawer({
  creating,
  parent,
  pending,
  onClose,
  run,
}: {
  creating: { parentId: string | null; parentType: TaxonomyNodeType | null };
  parent: TaxonomyTreeNode | null;
  pending: boolean;
  onClose: () => void;
  run: (fn: () => Promise<Result>, okText: string, after?: () => void) => void;
}) {
  const childTypes = allowedChildTypes(creating.parentType);
  const [nodeType, setNodeType] = useState<TaxonomyNodeType>(childTypes[0] || "SUBJECT");
  const [name, setName] = useState("");
  const [nameHi, setNameHi] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [subjectType, setSubjectType] = useState<string>("");
  const [description, setDescription] = useState("");
  const effectiveSlug = slugTouched ? slug : slugifyTaxonomyName(name);

  const submit = () =>
    run(
      () =>
        createTaxonomyNodeAction({
          parentId: creating.parentId,
          nodeType,
          name,
          slug: effectiveSlug,
          description,
          nameHi: nameHi || null,
          subjectType: nodeType === "SUBJECT" ? subjectType || null : null,
        }),
      `${LEVEL_LABEL[nodeType]} "${name.trim()}" created.`,
      onClose
    );

  return (
    <StudioDrawer
      open
      onClose={onClose}
      title={parent ? `Add under ${parent.name}` : "Add subject"}
      subtitle={parent ? parent.path : "A new L1 subject of the master tree"}
      footer={
        <>
          <button type="button" onClick={onClose} className={studioQuietAction}>
            Cancel
          </button>
          <button type="button" disabled={pending || !name.trim()} onClick={submit} className={studioPrimaryAction}>
            {pending ? "Saving…" : "Create"}
          </button>
        </>
      }
    >
      <div className="grid gap-4">
        {childTypes.length > 1 && (
          <StudioField label="Level" htmlFor="new-type">
            <select id="new-type" value={nodeType} onChange={(e) => setNodeType(e.target.value as TaxonomyNodeType)} className={studioControl}>
              {childTypes.map((t) => (
                <option key={t} value={t}>
                  {LEVEL_LABEL[t]}
                </option>
              ))}
            </select>
          </StudioField>
        )}
        <StudioField label="Name (English)" htmlFor="new-name">
          <input id="new-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required className={studioControl} />
        </StudioField>
        <StudioField label="Hindi name (optional)" htmlFor="new-name-hi">
          <input id="new-name-hi" lang="hi" data-content-field="name_hi" value={nameHi} onChange={(e) => setNameHi(e.target.value)} maxLength={160} className={studioControl} />
        </StudioField>
        <StudioField label="Slug" htmlFor="new-slug">
          <input
            id="new-slug"
            value={effectiveSlug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value);
            }}
            className={`${studioControl} font-mono`}
          />
        </StudioField>
        {nodeType === "SUBJECT" && (
          <StudioField label="Subject type" htmlFor="new-subject-type">
            <select id="new-subject-type" value={subjectType} onChange={(e) => setSubjectType(e.target.value)} className={studioControl}>
              <option value="">Not set</option>
              {SUBJECT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {SUBJECT_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </StudioField>
        )}
        <StudioField label="Description (optional)" htmlFor="new-description">
          <input id="new-description" value={description} onChange={(e) => setDescription(e.target.value)} className={studioControl} />
        </StudioField>
        <p className="text-[13px] text-fg-secondary">
          The slug must be unique under this parent; the public path is {parent ? `${parent.path}.` : ""}
          <span className="font-mono">{effectiveSlug || "…"}</span>.{PROJECTED_NODE_TYPES.includes(nodeType) ? " This node also appears in the app's subject and topic lists with the same id." : ""}
        </p>
      </div>
    </StudioDrawer>
  );
}

function NodeDrawer({
  node,
  byId,
  all,
  aliases,
  pending,
  onClose,
  run,
}: {
  node: TaxonomyTreeNode;
  byId: Map<string, TaxonomyTreeNode>;
  all: TaxonomyTreeNode[];
  aliases: TaxonomyAlias[];
  pending: boolean;
  onClose: () => void;
  run: (fn: () => Promise<Result>, okText: string, after?: () => void) => void;
}) {
  const [name, setName] = useState(node.name);
  const [slug, setSlug] = useState(node.slug);
  const [nameHi, setNameHi] = useState(node.nameHi || "");
  const [subjectType, setSubjectType] = useState<string>(node.subjectType || "");
  const [stateCode, setStateCode] = useState(node.stateCode || "");
  const [aliasEn, setAliasEn] = useState("");
  const [aliasHi, setAliasHi] = useState("");
  const [moveTo, setMoveTo] = useState("");
  const [moveReason, setMoveReason] = useState("");
  const [moveConfirm, setMoveConfirm] = useState(false);
  const [mergeInto, setMergeInto] = useState("");
  const [mergeReason, setMergeReason] = useState("");
  const [mergeWord, setMergeWord] = useState("");
  const [internalConfirm, setInternalConfirm] = useState(false);

  const parent = node.parentId ? byId.get(node.parentId) || null : null;
  const stateAllowed = (node.nodeType === "SUBJECT" ? subjectType : rootSubjectType(node, byId)) === "STATE_SPECIFIC";
  const below = useMemo(() => descendantIds(node), [node]);

  const moveTargets = parent ? all.filter((n) => n.nodeType === parent.nodeType && n.isActive && n.id !== parent.id && !below.has(n.id)) : [];
  const mergeTargets = all.filter(
    (n) => n.nodeType === node.nodeType && n.isActive && n.id !== node.id && !below.has(n.id) && (node.nodeType === "SUBJECT" || n.rootSubjectId === node.rootSubjectId)
  );
  const moveTarget = moveTo ? byId.get(moveTo) : undefined;
  const mergeTarget = mergeInto ? byId.get(mergeInto) : undefined;

  const namesChanged = name.trim() !== node.name || slug.trim() !== node.slug;
  const detailsChanged = (nameHi.trim() || null) !== node.nameHi || (subjectType || null) !== node.subjectType || (stateCode.trim().toUpperCase() || null) !== node.stateCode;

  const save = () =>
    run(async () => {
      if (namesChanged) {
        const r = await renameTaxonomyNodeAction(node.id, name, slug);
        if (!r.success) return r;
      }
      if (detailsChanged) {
        return updateTaxonomyDetailsAction(node.id, { nameHi: nameHi.trim() || null, subjectType: subjectType || null, stateCode: stateCode.trim().toUpperCase() || null });
      }
      return { success: true };
    }, `"${name.trim()}" saved.`);

  const normalizedEn = normalizeTaxonomyName(aliasEn);
  const normalizedHi = normalizeTaxonomyName(aliasHi);

  return (
    <StudioDrawer
      open
      wide
      onClose={onClose}
      title={node.name}
      subtitle={
        <span className="flex flex-wrap items-center gap-2">
          <span className={`rounded border px-1.5 py-0.5 text-[11px] font-semibold ${LEVEL_STYLE[node.nodeType]}`}>{LEVEL_LABEL[node.nodeType]}</span>
          <span className="font-mono text-[12px]">{node.path}</span>
          {!node.isActive && <span className="font-semibold text-danger-700">{node.mergedInto ? `Merged into ${byId.get(node.mergedInto)?.name || "another node"}` : "Inactive"}</span>}
          {node.isInternal && <span className="rounded-full border border-line bg-ink-50 px-2 py-0.5 text-[11px] font-semibold text-fg-secondary">Internal</span>}
        </span>
      }
      footer={
        <>
          {/* CA-7: internal = a legacy catch-all — question mapping only, never a lesson, course or public page */}
          {node.nodeType !== "SUBJECT" &&
            (internalConfirm ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => (setInternalConfirm(false), run(() => setTaxonomyNodeInternalAction(node.id, !node.isInternal), node.isInternal ? `"${node.name}" is no longer internal.` : `"${node.name}" is internal: no lessons, courses or public pages.`))}
                className={`${studioQuietAction} border border-primary-700`}
              >
                {node.isInternal ? "Confirm: not internal" : "Confirm: mark internal"}
              </button>
            ) : (
              <button type="button" disabled={pending} onClick={() => setInternalConfirm(true)} className={studioQuietAction}>
                {node.isInternal ? "Make public again" : "Mark internal"}
              </button>
            ))}
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => setTaxonomyNodeActiveAction(node.id, !node.isActive), node.isActive ? `"${node.name}" deactivated.` : `"${node.name}" reactivated.`)}
            className={studioQuietAction}
          >
            {node.isActive ? "Deactivate" : "Reactivate"}
          </button>
          <button type="button" disabled={pending || (!namesChanged && !detailsChanged) || !name.trim()} onClick={save} className={studioPrimaryAction}>
            {pending ? "Saving…" : "Save names"}
          </button>
        </>
      }
    >
      <div className="grid gap-6">
        <section aria-labelledby="sec-names" className="grid gap-3">
          <h3 id="sec-names" className="text-[15px] font-bold text-fg">
            Names
          </h3>
          <div className="grid gap-3 md:grid-cols-2">
            <StudioField label="Name (English)" htmlFor="node-name">
              <input id="node-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className={studioControl} />
            </StudioField>
            <StudioField label="Hindi name" htmlFor="node-name-hi">
              <input id="node-name-hi" lang="hi" data-content-field="name_hi" value={nameHi} onChange={(e) => setNameHi(e.target.value)} maxLength={160} className={studioControl} />
            </StudioField>
            <StudioField label="Slug (unique under the parent)" htmlFor="node-slug">
              <input id="node-slug" value={slug} onChange={(e) => setSlug(e.target.value)} className={`${studioControl} font-mono`} />
            </StudioField>
            {node.nodeType === "SUBJECT" && (
              <StudioField label="Subject type" htmlFor="node-subject-type">
                <select id="node-subject-type" value={subjectType} onChange={(e) => setSubjectType(e.target.value)} className={studioControl}>
                  <option value="">Not set</option>
                  {SUBJECT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {SUBJECT_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </StudioField>
            )}
            {stateAllowed && (
              <StudioField label="State code (two letters)" htmlFor="node-state">
                <input id="node-state" value={stateCode} onChange={(e) => setStateCode(e.target.value.toUpperCase())} maxLength={2} className={`${studioControl} font-mono uppercase`} />
              </StudioField>
            )}
          </div>
        </section>

        <section aria-labelledby="sec-aliases" className="grid gap-3">
          <h3 id="sec-aliases" className="text-[15px] font-bold text-fg">
            Aliases
          </h3>
          <p className="text-[13px] text-fg-secondary">Other names syllabi use for this node. An alias may not equal the name or alias of a sibling.</p>
          {aliases.length === 0 ? (
            <p className="text-[13px] text-fg-secondary">No aliases yet.</p>
          ) : (
            <ul className="flex flex-wrap gap-2" aria-label={`Aliases of ${node.name}`}>
              {aliases.map((a) => (
                <li key={a.id} className="inline-flex items-center gap-1 rounded-control border border-line bg-surface py-0.5 pl-2.5 pr-0.5 text-[13px]">
                  <span>{a.alias}</span>
                  <span className="text-[11px] uppercase text-ink-500">{a.language === "hi" ? "HI" : "EN"}</span>
                  <button
                    type="button"
                    disabled={pending}
                    aria-label={`Remove alias ${a.alias}`}
                    onClick={() => run(() => removeTaxonomyAliasAction(a.id), `Alias "${a.alias}" removed.`)}
                    className="focus-ring inline-flex size-10 items-center justify-center rounded-control text-fg-secondary hover:bg-ink-100"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-end gap-2">
            <StudioField label="New English alias" htmlFor="alias-en" className="min-w-[14rem] flex-1">
              <input id="alias-en" value={aliasEn} onChange={(e) => setAliasEn(e.target.value)} maxLength={160} className={studioControl} />
            </StudioField>
            <button
              type="button"
              disabled={pending || !normalizeTaxonomyName(aliasEn)}
              onClick={() => run(() => addTaxonomyAliasAction(node.id, aliasEn, "en"), `Alias "${aliasEn.trim()}" added.`, () => setAliasEn(""))}
              className={studioQuietAction}
            >
              Add English alias
            </button>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <StudioField label="New Hindi alias" htmlFor="alias-hi" className="min-w-[14rem] flex-1">
              <input id="alias-hi" lang="hi" data-content-field="alias_hi" value={aliasHi} onChange={(e) => setAliasHi(e.target.value)} maxLength={160} className={studioControl} />
            </StudioField>
            <button
              type="button"
              disabled={pending || !normalizeTaxonomyName(aliasHi)}
              onClick={() => run(() => addTaxonomyAliasAction(node.id, aliasHi, "hi"), `Alias "${aliasHi.trim()}" added.`, () => setAliasHi(""))}
              className={studioQuietAction}
            >
              Add second-language alias
            </button>
          </div>
          {(normalizedEn || normalizedHi) && (
            <p className="text-[12px] text-fg-secondary">
              Compared as: <span className="font-mono">{[normalizedEn, normalizedHi].filter(Boolean).join(" · ")}</span>
            </p>
          )}
        </section>

        {parent && (
          <section aria-labelledby="sec-move" className="grid gap-3">
            <h3 id="sec-move" className="text-[15px] font-bold text-fg">
              Move
            </h3>
            <p className="text-[13px] text-fg-secondary">
              A {LEVEL_NOUN[node.nodeType]} moves only under another {LEVEL_NOUN[parent.nodeType]}. Its id and every link stay; its path changes.
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <StudioField label="New parent" htmlFor="move-to">
                <select
                  id="move-to"
                  value={moveTo}
                  onChange={(e) => {
                    setMoveTo(e.target.value);
                    setMoveConfirm(false);
                  }}
                  className={studioControl}
                >
                  <option value="">Choose…</option>
                  {moveTargets.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.path}
                    </option>
                  ))}
                </select>
              </StudioField>
              <StudioField label="Reason (optional)" htmlFor="move-reason">
                <input id="move-reason" value={moveReason} onChange={(e) => setMoveReason(e.target.value)} className={studioControl} />
              </StudioField>
            </div>
            {moveTarget &&
              (moveConfirm ? (
                <div className="flex flex-wrap items-center gap-2 rounded-card border border-warning-200 bg-warning-50 px-3 py-2 text-[13px] text-fg">
                  <span>
                    New path: <span className="font-mono">{`${moveTarget.path}.${node.slug}`}</span>
                  </span>
                  <button type="button" disabled={pending} onClick={() => run(() => moveTaxonomyNodeAction(node.id, moveTarget.id, moveReason), `"${node.name}" moved under "${moveTarget.name}".`, onClose)} className={studioQuietAction}>
                    Confirm move
                  </button>
                  <button type="button" onClick={() => setMoveConfirm(false)} className={studioQuietAction}>
                    Cancel
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => setMoveConfirm(true)} className={`${studioQuietAction} justify-self-start`}>
                  Move under “{moveTarget.name}”…
                </button>
              ))}
          </section>
        )}

        {node.isActive && (
          <section aria-labelledby="sec-merge" className="grid gap-3 rounded-card border border-danger-200 p-4">
            <h3 id="sec-merge" className="text-[15px] font-bold text-fg">
              Merge into another node
            </h3>
            <p className="text-[13px] text-fg-secondary">
              Owner action. Every question, lesson, mapping and record that points here moves to the target; this node&apos;s children move too; its names (both content languages) become aliases of the target; this node is deactivated. Nothing changes if anything conflicts
              (for example a published syllabus maps this node).
            </p>
            {mergeTargets.length === 0 ? (
              <p className="text-[13px] text-fg-secondary">No other active {LEVEL_NOUN[node.nodeType]} {node.nodeType === "SUBJECT" ? "exists" : "in this subject"}.</p>
            ) : (
              <>
                <div className="grid gap-3 md:grid-cols-2">
                  <StudioField label="Merge into" htmlFor="merge-into">
                    <select id="merge-into" value={mergeInto} onChange={(e) => setMergeInto(e.target.value)} className={studioControl}>
                      <option value="">Choose…</option>
                      {mergeTargets.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.path}
                        </option>
                      ))}
                    </select>
                  </StudioField>
                  <StudioField label={`Reason (at least ${MERGE_REASON_MIN} characters)`} htmlFor="merge-reason">
                    <input id="merge-reason" value={mergeReason} onChange={(e) => setMergeReason(e.target.value)} className={studioControl} />
                  </StudioField>
                  <StudioField label={`Type ${MERGE_CONFIRM_WORD} to confirm`} htmlFor="merge-word">
                    <input id="merge-word" value={mergeWord} onChange={(e) => setMergeWord(e.target.value)} autoComplete="off" className={`${studioControl} font-mono`} />
                  </StudioField>
                </div>
                <button
                  type="button"
                  disabled={pending || !mergeTarget || mergeReason.trim().length < MERGE_REASON_MIN || mergeWord !== MERGE_CONFIRM_WORD}
                  onClick={() =>
                    mergeTarget && run(() => mergeTaxonomyNodesAction(node.id, mergeTarget.id, mergeReason, mergeWord), `"${node.name}" merged into "${mergeTarget.name}".`, onClose)
                  }
                  className="focus-ring inline-flex min-h-10 items-center justify-self-start rounded-control border border-danger-600 px-4 text-[14px] font-semibold text-danger-700 hover:bg-danger-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Merge{mergeTarget ? ` into “${mergeTarget.name}”` : ""}
                </button>
              </>
            )}
          </section>
        )}
      </div>
    </StudioDrawer>
  );
}
