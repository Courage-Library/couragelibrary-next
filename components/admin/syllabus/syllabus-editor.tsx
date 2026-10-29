"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronRight, CornerDownRight, Lightbulb, Lock, Plus, Rocket, ShieldCheck, Trash2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/components/ui/cn";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  deleteSyllabusNodeAction,
  moveSyllabusNodeAction,
  publishSyllabusVersionAction,
  setUnitMappingsAction,
  upsertSyllabusNodeAction,
  validateSyllabusVersionAction,
} from "@/app/admin/syllabus/actions";
import { setTaxonomyContentSourceAction } from "@/app/admin/taxonomy/actions";
import {
  CA_CONTENT_SOURCE,
  confirmPhrase,
  groupWarnings,
  mappingLabel,
  needsTypedConfirm,
  questionSums,
  unitQuestions,
  unitsForTopic,
  type PublishImpact,
  type TopicRollup,
} from "@/lib/syllabus/editor-assist";
import {
  WEIGHTAGE_TIER_LABEL,
  type SyllabusEditorNode,
  type SyllabusNodeKind,
  type SyllabusTopicOption,
  type SyllabusValidationReport,
  type SyllabusVersionRow,
  type SyllabusWeightageTier,
} from "@/types/syllabus";
import type { SyllabusEditorState } from "@/lib/syllabus/editor-state";
import { suggestTopics, type TopicSuggestion } from "@/lib/syllabus/topic-suggest";

type Props = {
  version: SyllabusVersionRow;
  exam: { id: string; title: string };
  nodes: SyllabusEditorNode[];
  topics: SyllabusTopicOption[];
  initialReport: SyllabusValidationReport | null;
  publishedPeer: { id: string; versionNumber: number } | null;
  isAdmin: boolean;
  loadError: boolean;
  /** SYLLABUS-UI-1: canonical node → its rolled-up topic + level (unit labels, "Go to unit") */
  rollup: TopicRollup;
  /** SYLLABUS-UI-1: topics whose content comes from Current Affairs (metadata.content_source) */
  caLinked: string[];
  /** SYLLABUS-PUBLISH-IMPACT: computed by the page (admin + draft); null = not available */
  impact: PublishImpact | null;
};

type Result = { ok: true; state?: SyllabusEditorState | null } | { ok: false; message: string };
const KIND_TONE = { PAPER: "info", SECTION: "primary", UNIT: "neutral" } as const;
const sortNodes = (a: SyllabusEditorNode, b: SyllabusEditorNode) => a.display_order - b.display_order || a.title.localeCompare(b.title);
const intOrNull = (s: string) => (s.trim() === "" ? null : Number(s));

export function SyllabusEditor({ version, exam, nodes: initialNodes, topics, initialReport, publishedPeer, isAdmin, loadError, rollup, caLinked: initialCaLinked, impact }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  // Live state: updated from each action's own response (no dependency on a page refresh) and re-synced whenever a
  // background refresh delivers new props.
  const [nodes, setNodes] = useState(initialNodes);
  useEffect(() => setNodes(initialNodes), [initialNodes]);
  const [status, setStatus] = useState(version.status);
  useEffect(() => setStatus(version.status), [version.status]);
  const readOnly = status !== "DRAFT";
  const [selectedId, setSelectedId] = useState<string | null>(nodes.find((n) => !n.parent_id)?.id ?? null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(nodes.filter((n) => n.kind !== "UNIT").map((n) => n.id)));
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [report, setReport] = useState<SyllabusValidationReport | null>(initialReport);
  const [confirm, setConfirm] = useState<null | "delete" | "publish">(null);
  useEffect(() => setReport(initialReport), [initialReport]);
  const [caLinked, setCaLinked] = useState(() => new Set(initialCaLinked));
  useEffect(() => setCaLinked(new Set(initialCaLinked)), [initialCaLinked]);
  // SYLLABUS-PUBLISH-IMPACT: the page's impact (refreshed with every edit); the owner's choices for this publish
  const [archiveOthers, setArchiveOthers] = useState<Set<string>>(new Set());
  const [typed, setTyped] = useState("");
  const [gapFilter, setGapFilter] = useState<"ALL" | "NO_LESSONS" | "NO_QUESTIONS">("ALL");
  const [gapQuery, setGapQuery] = useState("");

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const children = useMemo(() => {
    const m = new Map<string | null, SyllabusEditorNode[]>();
    for (const n of nodes) m.set(n.parent_id, [...(m.get(n.parent_id) ?? []), n]);
    for (const list of m.values()) list.sort(sortNodes);
    return m;
  }, [nodes]);
  const topicById = useMemo(() => new Map(topics.map((t) => [t.id, t])), [topics]);
  const selected = selectedId ? byId.get(selectedId) ?? null : null;
  // Signature of the selected node's SAVED data: local edits reset only when that data really changes (another
  // node selected, or a save landed) — not on every router.refresh(), which creates new objects with equal data.
  const selectedSig = selected ? JSON.stringify(selected) : "";
  const issueNodes = useMemo(() => new Set((report?.errors ?? []).map((e) => e.node_id).filter(Boolean) as string[]), [report]);

  const run = (fn: () => Promise<Result>, success: string, after?: () => void) =>
    start(async () => {
      setMessage(null);
      const r = await fn();
      if (!r.ok) {
        setMessage({ tone: "danger", text: r.message });
        return;
      }
      if (r.state) {
        setNodes(r.state.nodes);
        if (r.state.report) setReport(r.state.report);
      }
      setMessage({ tone: "success", text: success });
      after?.();
      // background sync outside the transition: a slow or failed refresh can never leave the editor pending
      setTimeout(() => router.refresh(), 0);
    });

  // SYLLABUS-UI-1: the unit's rolled-up topics, Σ expected questions per section / paper, grouped warnings
  const unitTopicIds = (n: SyllabusEditorNode) => [...new Set(n.mappings.map((m) => rollup[m.topic_id]?.topicId ?? m.topic_id))];
  const sums = useMemo(() => questionSums(nodes), [nodes]);
  const grouped = useMemo(() => groupWarnings(report?.warnings ?? [], caLinked), [report, caLinked]);
  const gapRows = grouped.gaps.filter(
    (g) => (gapFilter === "ALL" || g.gaps.includes(gapFilter)) && (!gapQuery.trim() || g.name.toLowerCase().includes(gapQuery.trim().toLowerCase())),
  );
  const goToTopic = (topicId: string) => {
    const unit = unitsForTopic(nodes, rollup, topicId)[0];
    if (unit) goToNode(unit);
  };
  const setCaLink = (topicId: string, on: boolean) =>
    start(async () => {
      const r = await setTaxonomyContentSourceAction(topicId, on ? CA_CONTENT_SOURCE : null);
      if (!r.success) {
        setMessage({ tone: "danger", text: r.error });
        return;
      }
      setCaLinked((cur) => {
        const next = new Set(cur);
        if (on) next.add(topicId);
        else next.delete(topicId);
        return next;
      });
      setMessage({ tone: "success", text: on ? "Linked to Current Affairs: its content comes from there." : "No longer linked to Current Affairs." });
    });

  // ---------------------------------------------------------------- tree (WAI-ARIA tree view, roving tabindex)
  const visible = useMemo(() => {
    const out: SyllabusEditorNode[] = [];
    const walk = (parent: string | null) => {
      for (const n of children.get(parent) ?? []) {
        out.push(n);
        if (expanded.has(n.id)) walk(n.id);
      }
    };
    walk(null);
    return out;
  }, [children, expanded]);
  const itemRefs = useRef(new Map<string, HTMLLIElement>());
  const focusNode = (id: string) => {
    setSelectedId(id);
    itemRefs.current.get(id)?.focus();
  };
  /** From the validation panel: open every ancestor, select the node and move focus to it once rendered. */
  const goToNode = (id: string) => {
    const ancestors: string[] = [];
    for (let p = byId.get(id)?.parent_id ?? null; p; p = byId.get(p)?.parent_id ?? null) ancestors.push(p);
    setExpanded((cur) => new Set([...cur, ...ancestors]));
    setSelectedId(id);
    requestAnimationFrame(() => itemRefs.current.get(id)?.focus());
  };
  const toggle = (id: string, open?: boolean) =>
    setExpanded((cur) => {
      const next = new Set(cur);
      if (open ?? !next.has(id)) next.add(id);
      else next.delete(id);
      return next;
    });
  const onTreeKey = (e: KeyboardEvent<HTMLLIElement>, n: SyllabusEditorNode) => {
    const i = visible.findIndex((x) => x.id === n.id);
    const hasKids = (children.get(n.id) ?? []).length > 0;
    let handled = true;
    if (e.key === "ArrowDown" && i < visible.length - 1) focusNode(visible[i + 1].id);
    else if (e.key === "ArrowUp" && i > 0) focusNode(visible[i - 1].id);
    else if (e.key === "Home" && visible.length) focusNode(visible[0].id);
    else if (e.key === "End" && visible.length) focusNode(visible[visible.length - 1].id);
    else if (e.key === "ArrowRight") {
      if (hasKids && !expanded.has(n.id)) toggle(n.id, true);
      else if (hasKids) focusNode((children.get(n.id) ?? [])[0].id);
    } else if (e.key === "ArrowLeft") {
      if (hasKids && expanded.has(n.id)) toggle(n.id, false);
      else if (n.parent_id) focusNode(n.parent_id);
    } else if (e.key === "Enter" || e.key === " ") setSelectedId(n.id);
    else handled = false;
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  const renderLevel = (parent: string | null, level: number) => {
    const list = children.get(parent) ?? [];
    if (!list.length) return null;
    return list.map((n, idx) => {
      const kids = children.get(n.id) ?? [];
      const isOpen = expanded.has(n.id);
      const isSel = n.id === selectedId;
      return (
        <li
          key={n.id}
          ref={(el) => {
            if (el) itemRefs.current.set(n.id, el);
            else itemRefs.current.delete(n.id);
          }}
          role="treeitem"
          aria-level={level}
          aria-setsize={list.length}
          aria-posinset={idx + 1}
          aria-selected={isSel}
          aria-expanded={kids.length ? isOpen : undefined}
          tabIndex={isSel || (!selectedId && level === 1 && idx === 0) ? 0 : -1}
          onKeyDown={(e) => onTreeKey(e, n)}
          onClick={(e) => {
            e.stopPropagation();
            setSelectedId(n.id);
          }}
          className="focus-ring rounded-control outline-none"
        >
          <div
            className={cn(
              "flex min-h-11 cursor-pointer items-center gap-2 rounded-control px-2 py-1.5",
              isSel ? "bg-primary-50 text-primary-800" : "hover:bg-ink-50",
            )}
            style={{ paddingLeft: `${(level - 1) * 20 + 8}px` }}
          >
            {kids.length ? (
              // pointer-only affordance; keyboard users open / close with the arrow keys (the treeitem owns focus)
              <span
                aria-hidden="true"
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(n.id);
                }}
                className="inline-flex size-6 cursor-pointer items-center justify-center rounded-badge text-fg-secondary hover:bg-ink-100"
              >
                <ChevronRight className={cn("size-4 transition-transform duration-120 motion-reduce:transition-none", isOpen && "rotate-90")} />
              </span>
            ) : (
              <span aria-hidden="true" className="size-6" />
            )}
            <Badge tone={KIND_TONE[n.kind]}>{n.kind}</Badge>
            <span className="min-w-0 flex-1 truncate text-body-sm font-medium">{n.title}</span>
            {n.kind === "UNIT" && (
              <span className="flex flex-wrap items-center justify-end gap-1.5 text-caption text-fg-secondary" data-unit-meta="">
                {unitTopicIds(n).some((t) => caLinked.has(t)) && <Badge tone="info">Current Affairs</Badge>}
                {n.weightage_tier && <span className="font-semibold">{WEIGHTAGE_TIER_LABEL[n.weightage_tier]}</span>}
                {unitQuestions(n) && <span>{unitQuestions(n)?.label}</span>}
                <span>{mappingLabel(n, rollup)}</span>
              </span>
            )}
            {n.kind !== "UNIT" && sums.get(n.id) && (
              <span className={cn("text-caption", sums.get(n.id)?.off ? "font-semibold text-warning-800" : "text-fg-secondary")} data-section-sum="">
                {sums.get(n.id)?.label}
                {sums.get(n.id)?.off ? <span className="sr-only"> (more than 20 % off)</span> : null}
              </span>
            )}
            {issueNodes.has(n.id) && (
              <Badge tone="danger">
                <span className="sr-only">Has validation errors: </span>Fix
              </Badge>
            )}
          </div>
          {kids.length > 0 && isOpen && (
            <ul role="group" className="flex flex-col">
              {renderLevel(n.id, level + 1)}
            </ul>
          )}
        </li>
      );
    });
  };

  // ---------------------------------------------------------------- structure actions
  const addNode = (kind: SyllabusNodeKind, parentId: string | null) =>
    run(
      () =>
        upsertSyllabusNodeAction(version.id, {
          kind,
          parent_id: parentId,
          title: kind === "UNIT" ? "New unit" : kind === "SECTION" ? "New section" : "New paper",
        }) as Promise<Result>,
      `${kind.charAt(0) + kind.slice(1).toLowerCase()} added. Rename it in the details panel.`,
      () => parentId && toggle(parentId, true),
    );
  const siblings = selected ? children.get(selected.parent_id) ?? [] : [];
  const sibIndex = selected ? siblings.findIndex((s) => s.id === selected.id) : -1;
  const moveBy = (delta: -1 | 1) => {
    if (!selected) return;
    const other = siblings[sibIndex + delta];
    if (!other) return;
    const a = other.display_order === selected.display_order ? selected.display_order + delta : other.display_order;
    run(
      async () => {
        const r1 = await moveSyllabusNodeAction(version.id, selected.id, selected.parent_id, a);
        if (!r1.ok) return r1 as Result;
        return (await moveSyllabusNodeAction(version.id, other.id, other.parent_id, selected.display_order)) as Result;
      },
      delta < 0 ? "Moved up." : "Moved down.",
    );
  };
  const descendants = useMemo(() => {
    const out = new Set<string>();
    if (!selected) return out;
    const walk = (id: string) => {
      for (const c of children.get(id) ?? []) {
        out.add(c.id);
        walk(c.id);
      }
    };
    walk(selected.id);
    return out;
  }, [selected, children]);
  const parentOptions = useMemo(
    () =>
      nodes
        .filter((n) => n.kind !== "UNIT" && n.id !== selected?.id && !descendants.has(n.id))
        .sort((a, b) => a.depth - b.depth || sortNodes(a, b))
        .map((n) => ({ value: n.id, label: `${"— ".repeat(n.depth - 1)}${n.title} (${n.kind.toLowerCase()})` })),
    [nodes, selected, descendants],
  );
  const [moveTarget, setMoveTarget] = useState("__root");
  useEffect(() => setMoveTarget(selected?.parent_id ?? "__root"), [selected?.id, selected?.parent_id]);

  // ---------------------------------------------------------------- details form
  const [form, setForm] = useState({ title: "", description: "", kind: "UNIT" as SyllabusNodeKind, tier: "", min: "", max: "", mandatory: true });
  useEffect(() => {
    if (!selected) return;
    setForm({
      title: selected.title,
      description: selected.description ?? "",
      kind: selected.kind,
      tier: selected.weightage_tier ?? "",
      min: selected.expected_questions_min === null ? "" : String(selected.expected_questions_min),
      max: selected.expected_questions_max === null ? "" : String(selected.expected_questions_max),
      mandatory: selected.is_mandatory,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the saved-data signature (see selectedSig)
  }, [selectedSig]);
  const rangeError = (() => {
    const lo = intOrNull(form.min);
    const hi = intOrNull(form.max);
    if ((lo !== null && (!Number.isInteger(lo) || lo < 0)) || (hi !== null && (!Number.isInteger(hi) || hi < 0))) return "Use whole numbers of 0 or more, or leave empty if unknown.";
    if (lo !== null && hi !== null && lo > hi) return "The minimum cannot be above the maximum.";
    return null;
  })();
  const saveDetails = () =>
    selected &&
    run(
      () =>
        upsertSyllabusNodeAction(version.id, {
          id: selected.id,
          title: form.title,
          description: form.description.trim() === "" ? null : form.description,
          kind: form.kind,
          weightage_tier: (form.tier || null) as SyllabusWeightageTier | null,
          expected_questions_min: intOrNull(form.min),
          expected_questions_max: intOrNull(form.max),
          is_mandatory: form.mandatory,
        }) as Promise<Result>,
      "Details saved.",
    );

  // ---------------------------------------------------------------- topic picker (UNIT)
  const [query, setQuery] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [picked, setPicked] = useState<Array<{ topic_id: string; weight: string }>>([]);
  const [useWeights, setUseWeights] = useState(false);
  // GAP2-4c: read-only suggestions from the unit title; staff still tick and press "Save topics" (no auto-mapping)
  const [suggestions, setSuggestions] = useState<Array<TopicSuggestion<(typeof topics)[number]>> | null>(null);
  useEffect(() => {
    if (!selected) return;
    setSuggestions(null);
    setPicked(selected.mappings.map((m) => ({ topic_id: m.topic_id, weight: m.weight === null ? "" : String(m.weight) })));
    setUseWeights(selected.mappings.some((m) => m.weight !== null));
    setQuery("");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the saved-data signature (see selectedSig)
  }, [selectedSig]);
  const subjects = useMemo(
    () => Array.from(new Map(topics.filter((t) => t.subject_id).map((t) => [t.subject_id as string, t.subject_name ?? "Subject"])).entries()),
    [topics],
  );
  const filteredTopics = topics.filter(
    (t) => (!subjectFilter || t.subject_id === subjectFilter) && (!query.trim() || `${t.name} ${t.subject_name ?? ""}`.toLowerCase().includes(query.trim().toLowerCase())),
  );
  const weightSum = picked.reduce((a, p) => a + (Number(p.weight) || 0), 0);
  const weightError = useWeights
    ? picked.some((p) => p.weight.trim() === "" || !(Number(p.weight) > 0 && Number(p.weight) <= 1))
      ? "Every topic needs a weight above 0 and at most 1."
      : Math.abs(weightSum - 1) > 0.0001
        ? `Weights add up to ${weightSum.toFixed(2)}; they must add up to 1.`
        : null
    : null;
  const saveMappings = () =>
    selected &&
    run(
      () =>
        setUnitMappingsAction(
          version.id,
          selected.id,
          picked.map((p) => p.topic_id),
          useWeights ? picked.map((p) => Number(p.weight)) : null,
        ) as Promise<Result>,
      "Topics saved.",
    );

  // ---------------------------------------------------------------- validation + publish
  const validate = () =>
    start(async () => {
      const r = await validateSyllabusVersionAction(version.id);
      if (!r.ok) {
        setMessage({ tone: "danger", text: r.message });
        return;
      }
      setReport(r.report);
      setMessage({ tone: r.report.ok ? "success" : "danger", text: r.report.ok ? "No errors. The draft can be published." : `${r.report.error_count} error(s) to fix before publishing.` });
    });
  const publish = () =>
    start(async () => {
      const r = await publishSyllabusVersionAction(version.id, { archiveOtherIds: [...archiveOthers] });
      setConfirm(null);
      if (!r.ok) {
        if ("report" in r && r.report) setReport(r.report);
        setMessage({ tone: "danger", text: r.message });
        return;
      }
      setMessage({
        tone: "success",
        text: `Version ${version.version_number} is published${r.archivedPreviousVersionId ? ` and version ${publishedPeer?.versionNumber ?? ""} was archived` : ""}${r.archivedOthers.length ? `; ${r.archivedOthers.length} other-tier version(s) archived` : ""}${r.archiveFailed.length ? `; ${r.archiveFailed.length} other version(s) could NOT be archived — archive them on the versions page` : ""}. Audit records were written.`,
      });
      setStatus("PUBLISHED");
      setTimeout(() => router.refresh(), 0);
    });
  const canPublish = isAdmin && !readOnly && report?.ok === true;
  const openPublish = () => {
    setTyped("");
    // a tier version next to an all-tiers one: students would keep seeing the other unless it is archived too
    setArchiveOthers(new Set((impact?.otherPublished ?? []).filter((o) => o.shownToStudents).map((o) => o.id)));
    setConfirm("publish");
  };
  const typedOk = !impact || !needsTypedConfirm(impact) || typed.trim() === confirmPhrase(version.version_number);

  return (
    <div className="flex flex-col gap-6 font-sans text-fg">
      <header className="flex flex-col gap-2">
        <Link href={`/admin/syllabus?exam=${exam.id}`} className="focus-ring w-fit rounded-badge text-body-sm text-link underline underline-offset-2">
          ← All versions of {exam.title}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-h1 font-bold">
            {exam.title} · v{version.version_number}
          </h1>
          <Badge tone={status === "DRAFT" ? "warning" : status === "PUBLISHED" ? "success" : "neutral"}>
            {status === "PUBLISHED" ? "Published (live)" : status.charAt(0) + status.slice(1).toLowerCase()}
          </Badge>
        </div>
        <p className="text-body-sm text-fg-secondary">
          Tag {version.version_tag}
          {version.tier ? ` · ${version.tier}` : " · all tiers"}
          {readOnly ? " · read-only" : " · draft: changes save immediately and are audited"}
        </p>
        {/* SYLLABUS-UI-1: the screen's ONE primary action (admin, draft) */}
        {!readOnly && (
          <div className="flex flex-wrap items-center gap-3" data-header-actions="">
            {isAdmin ? (
              <Button onClick={openPublish} disabled={!canPublish || pending} leadingIcon={<Rocket aria-hidden="true" className="size-4" />}>
                Publish…
              </Button>
            ) : (
              <span className="inline-flex items-center gap-1 text-body-sm text-fg-secondary">
                <Lock aria-hidden="true" className="size-4" /> Only an admin can publish. Ask an admin to review this draft.
              </span>
            )}
            {isAdmin && report && !report.ok && <span className="text-body-sm text-fg-secondary">Fix the errors in Validation to enable publishing.</span>}
          </div>
        )}
      </header>

      {loadError && <Alert tone="danger" title="Part of this page could not be loaded.">Reload the page. Nothing was changed.</Alert>}
      {readOnly && (
        <Alert tone="info" title="Read-only version">
          {status === "PUBLISHED" ? "Published versions cannot be edited. Create a new draft from it on the versions page." : "Archived versions cannot be edited."}
        </Alert>
      )}
      {message && (
        <Alert tone={message.tone} live>
          {message.text}
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        {/* ---- tree */}
        <section aria-labelledby="tree-title" className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="tree-title" className="text-h3 font-semibold">
              Structure
            </h2>
            {!readOnly && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => addNode("SECTION", null)} disabled={pending} leadingIcon={<Plus aria-hidden="true" className="size-4" />}>
                  Add section
                </Button>
                <Button size="sm" variant="ghost" onClick={() => addNode("PAPER", null)} disabled={pending}>
                  Add paper
                </Button>
              </div>
            )}
          </div>
          {nodes.length === 0 ? (
            <p className="text-body-sm text-fg-secondary">No nodes yet. Add a section to start (or a paper for multi-paper exams).</p>
          ) : (
            <ul role="tree" aria-label={`Syllabus structure of ${exam.title}`} className="flex flex-col">
              {renderLevel(null, 1)}
            </ul>
          )}
          <p className="text-caption text-fg-secondary">Arrow keys move through the tree; Right / Left open and close sections.</p>
        </section>

        {/* ---- details */}
        <section aria-labelledby="details-title" className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4">
          <h2 id="details-title" className="text-h3 font-semibold">
            {selected ? `${selected.kind.charAt(0) + selected.kind.slice(1).toLowerCase()}: ${selected.title}` : "Select a node"}
          </h2>
          {!selected ? (
            <p className="text-body-sm text-fg-secondary">Choose a node in the structure to see and edit its details.</p>
          ) : readOnly ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-body-sm">
              <dt className="text-fg-secondary">Weightage</dt>
              <dd>{selected.weightage_tier ? WEIGHTAGE_TIER_LABEL[selected.weightage_tier] : "Not set"}</dd>
              <dt className="text-fg-secondary">Expected questions</dt>
              <dd>
                {selected.expected_questions_min === null && selected.expected_questions_max === null
                  ? "Unknown"
                  : `${selected.expected_questions_min ?? "?"}–${selected.expected_questions_max ?? "?"}`}
              </dd>
              <dt className="text-fg-secondary">Description</dt>
              <dd>{selected.description ?? "—"}</dd>
              {selected.kind === "UNIT" && (
                <>
                  <dt className="text-fg-secondary">Topics</dt>
                  <dd>
                    {selected.mappings.length
                      ? selected.mappings.map((m) => `${topicById.get(m.topic_id)?.name ?? "Unknown topic"}${m.weight !== null ? ` (${m.weight})` : ""}`).join(", ")
                      : "None"}
                  </dd>
                </>
              )}
            </dl>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="node-title" label="Title" required className="sm:col-span-2">
                  <Input value={form.title} maxLength={200} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                </Field>
                <Field id="node-kind" label="Kind" help="Only UNIT nodes carry topics.">
                  <Select
                    value={form.kind}
                    onChange={(e) => setForm({ ...form, kind: e.target.value as SyllabusNodeKind })}
                    options={[
                      { value: "PAPER", label: "Paper" },
                      { value: "SECTION", label: "Section" },
                      { value: "UNIT", label: "Unit" },
                    ]}
                  />
                </Field>
                <Field id="node-tier" label="Weightage tier">
                  <Select
                    value={form.tier}
                    onChange={(e) => setForm({ ...form, tier: e.target.value })}
                    options={[{ value: "", label: "Not set" }, ...Object.entries(WEIGHTAGE_TIER_LABEL).map(([value, label]) => ({ value, label }))]}
                  />
                </Field>
                <Field id="node-min" label="Expected questions (min)" help="Leave empty if unknown." error={rangeError ?? undefined}>
                  <Input inputMode="numeric" value={form.min} onChange={(e) => setForm({ ...form, min: e.target.value })} />
                </Field>
                <Field id="node-max" label="Expected questions (max)" help="Leave empty if unknown.">
                  <Input inputMode="numeric" value={form.max} onChange={(e) => setForm({ ...form, max: e.target.value })} />
                </Field>
                <Field id="node-description" label="Description (optional)" className="sm:col-span-2">
                  <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </Field>
                <Switch label="Mandatory" description="Off for optional parts of the syllabus." checked={form.mandatory} onChange={(e) => setForm({ ...form, mandatory: e.target.checked })} className="sm:col-span-2" />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={saveDetails} loading={pending} disabled={Boolean(rangeError) || !form.title.trim()}>
                  Save details
                </Button>
                {selected.kind !== "UNIT" && (
                  <>
                    <Button variant="secondary" onClick={() => addNode("UNIT", selected.id)} disabled={pending} leadingIcon={<Plus aria-hidden="true" className="size-4" />}>
                      Add unit inside
                    </Button>
                    <Button variant="ghost" onClick={() => addNode("SECTION", selected.id)} disabled={pending}>
                      Add sub-section
                    </Button>
                  </>
                )}
              </div>

              <div className="flex flex-col gap-3 border-t border-line pt-4">
                <h3 className="text-body font-semibold">Position</h3>
                <div className="flex flex-wrap items-end gap-2">
                  <Button size="sm" variant="secondary" onClick={() => moveBy(-1)} disabled={pending || sibIndex <= 0} leadingIcon={<ArrowUp aria-hidden="true" className="size-4" />}>
                    Move up
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => moveBy(1)} disabled={pending || sibIndex < 0 || sibIndex >= siblings.length - 1} leadingIcon={<ArrowDown aria-hidden="true" className="size-4" />}>
                    Move down
                  </Button>
                  <Field id="node-parent" label="Move under" className="min-w-56">
                    <Select value={moveTarget} onChange={(e) => setMoveTarget(e.target.value)} options={[{ value: "__root", label: "Top level" }, ...parentOptions]} />
                  </Field>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={pending || moveTarget === (selected.parent_id ?? "__root")}
                    onClick={() => run(() => moveSyllabusNodeAction(version.id, selected.id, moveTarget === "__root" ? null : moveTarget, null) as Promise<Result>, "Moved.")}
                    leadingIcon={<CornerDownRight aria-hidden="true" className="size-4" />}
                  >
                    Move
                  </Button>
                  {/* SYLLABUS-UI-1: a quiet danger action; the confirm dialog carries the solid one */}
                  <Button size="sm" variant="dangerQuiet" onClick={() => setConfirm("delete")} disabled={pending} leadingIcon={<Trash2 aria-hidden="true" className="size-4" />}>
                    Delete
                  </Button>
                </div>
              </div>

              {selected.kind === "UNIT" && (
                <div className="flex flex-col gap-3 border-t border-line pt-4">
                  <h3 className="text-body font-semibold">Topics for this unit</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field id="topic-search" label="Search topics">
                      <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name or subject" />
                    </Field>
                    <Field id="topic-subject" label="Subject">
                      <Select value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)} options={[{ value: "", label: "All subjects" }, ...subjects.map(([value, label]) => ({ value, label }))]} />
                    </Field>
                  </div>
                  <div className="flex flex-col gap-2">
                    <div>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setSuggestions(suggestTopics(selected.title, topics))}
                        leadingIcon={<Lightbulb aria-hidden="true" className="size-4" />}
                      >
                        Suggest topics
                      </Button>
                    </div>
                    {suggestions !== null &&
                      (suggestions.length === 0 ? (
                        <p className="text-body-sm text-fg-secondary" role="status">
                          No close matches for &ldquo;{selected.title}&rdquo;. Search the list below.
                        </p>
                      ) : (
                        <fieldset className="rounded-control border border-line px-3 pb-2">
                          <legend className="px-1 text-body-sm font-medium text-fg">Suggested topics</legend>
                          <p className="text-body-sm text-fg-secondary">Suggestions only. Tick the topics that apply, then save.</p>
                          {suggestions.map(({ topic: t, score }) => (
                            <Checkbox
                              key={t.id}
                              label={t.name}
                              description={`${t.subject_name ?? "Subject"} · ${Math.round(score * 100)}% match`}
                              checked={picked.some((p) => p.topic_id === t.id)}
                              onChange={(e) =>
                                setPicked((cur) => (e.target.checked ? [...cur, { topic_id: t.id, weight: "" }] : cur.filter((p) => p.topic_id !== t.id)))
                              }
                            />
                          ))}
                        </fieldset>
                      ))}
                  </div>
                  <fieldset className="max-h-64 overflow-y-auto rounded-control border border-line px-3">
                    <legend className="sr-only">Active topics</legend>
                    {filteredTopics.length === 0 ? (
                      <p className="py-3 text-body-sm text-fg-secondary">No topics match.</p>
                    ) : (
                      filteredTopics.map((t) => (
                        <Checkbox
                          key={t.id}
                          label={t.name}
                          description={t.subject_name ?? undefined}
                          checked={picked.some((p) => p.topic_id === t.id)}
                          onChange={(e) =>
                            setPicked((cur) => (e.target.checked ? [...cur, { topic_id: t.id, weight: "" }] : cur.filter((p) => p.topic_id !== t.id)))
                          }
                        />
                      ))
                    )}
                  </fieldset>
                  <Switch label="Use weights" description="Optional share of this unit per topic; they must add up to 1." checked={useWeights} onChange={(e) => setUseWeights(e.target.checked)} />
                  {picked.length > 0 && (
                    <ul aria-label="Selected topics" className="flex flex-col gap-2">
                      {picked.map((p, i) => (
                        <li key={p.topic_id} className="flex flex-wrap items-end gap-3">
                          <span className="min-w-40 flex-1 text-body-sm font-medium">{topicById.get(p.topic_id)?.name ?? "Topic no longer active"}</span>
                          {useWeights && (
                            <Field id={`weight-${p.topic_id}`} label={`Weight for ${topicById.get(p.topic_id)?.name ?? "topic"}`} hideLabel className="w-28">
                              <Input
                                inputMode="decimal"
                                value={p.weight}
                                placeholder="0.5"
                                onChange={(e) => setPicked((cur) => cur.map((x, j) => (j === i ? { ...x, weight: e.target.value } : x)))}
                              />
                            </Field>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {useWeights && (
                    <p role="status" className={cn("text-body-sm font-medium", weightError ? "text-danger-700" : "text-success-700")}>
                      {weightError ?? `Weights add up to ${weightSum.toFixed(2)}.`}
                    </p>
                  )}
                  <Button variant="secondary" onClick={saveMappings} loading={pending} disabled={Boolean(weightError)} className="w-fit">
                    Save topics ({picked.length})
                  </Button>
                </div>
              )}
              {selected.kind === "UNIT" && isAdmin && unitTopicIds(selected).length > 0 && (
                <div className="flex flex-col gap-2 border-t border-line pt-4" data-ca-link="">
                  <h3 className="text-body font-semibold">Content source</h3>
                  {unitTopicIds(selected).map((t) => (
                    <Switch
                      key={t}
                      label={`${topicById.get(t)?.name ?? "This topic"}: linked to Current Affairs`}
                      description="Its content comes from the Current Affairs section, so no lesson is expected."
                      checked={caLinked.has(t)}
                      disabled={pending}
                      onChange={(e) => setCaLink(t, e.target.checked)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {/* ---- validation + publish */}
      <section aria-labelledby="validation-title" className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="validation-title" className="text-h3 font-semibold">
            Validation
          </h2>
          <Button variant="ghost" onClick={validate} loading={pending} leadingIcon={<ShieldCheck aria-hidden="true" className="size-4" />}>
            Validate now
          </Button>
        </div>
        {!report ? (
          <p className="text-body-sm text-fg-secondary">The validation report could not be loaded. Use Validate now.</p>
        ) : (
          <>
            <p className="text-body-sm text-fg-secondary">
              {report.counts.sections} section(s) · {report.counts.units} unit(s) · {report.counts.topics} topic(s) · {report.error_count} error(s) · {report.warning_count} warning(s)
            </p>
            {report.errors.length > 0 && (
              <ul aria-label="Errors" className="flex flex-col gap-2">
                {report.errors.map((e, i) => (
                  <li key={`${e.code}-${i}`} className="flex flex-wrap items-center gap-2 rounded-control border border-danger-200 bg-danger-50 px-3 py-2 text-body-sm text-danger-800">
                    <span className="flex-1">{e.message}</span>
                    {e.node_id && byId.has(e.node_id) && (
                      <Button size="sm" variant="ghost" onClick={() => goToNode(e.node_id as string)}>
                        Go to node
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {/* SYLLABUS-UI-1: "Structure" first (open); content gaps collapsed, counted, filterable, each with its links */}
            {grouped.structure.length > 0 && (
              <section aria-labelledby="warn-structure" className="flex flex-col gap-2" data-warnings-structure="">
                <h3 id="warn-structure" className="text-body font-semibold">
                  Structure ({grouped.structure.length})
                </h3>
                <ul className="flex flex-col gap-2">
                  {grouped.structure.map((w, i) => (
                    <li key={`${w.code}-${i}`} className="flex flex-wrap items-center gap-2 rounded-control border border-warning-200 bg-warning-50 px-3 py-2 text-body-sm text-fg">
                      <span className="flex-1">{w.message}</span>
                      {w.node_id && byId.has(w.node_id) ? (
                        <Button size="sm" variant="ghost" onClick={() => goToNode(w.node_id as string)}>
                          Go to unit
                        </Button>
                      ) : w.topic_id && unitsForTopic(nodes, rollup, w.topic_id).length ? (
                        <Button size="sm" variant="ghost" onClick={() => goToTopic(w.topic_id as string)}>
                          Go to unit
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {grouped.caLinked.length > 0 && (
              <p className="text-body-sm text-fg-secondary" data-ca-linked="">
                Linked to Current Affairs (no lesson expected): {grouped.caLinked.map((t) => t.name).join(", ")}
              </p>
            )}
            {grouped.gaps.length > 0 && (
              <details className="rounded-control border border-line px-3 py-2" data-warnings-gaps="">
                <summary className="focus-ring cursor-pointer rounded-badge text-body-sm font-medium">
                  Content gaps: {grouped.noLessons} topic(s) without a published lesson · {grouped.noQuestions} without published questions — these do not block publishing
                </summary>
                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <Field id="gap-filter" label="Show">
                    <Select
                      value={gapFilter}
                      onChange={(e) => setGapFilter(e.target.value as typeof gapFilter)}
                      options={[
                        { value: "ALL", label: `All gaps (${grouped.gaps.length})` },
                        { value: "NO_LESSONS", label: `No published lesson (${grouped.noLessons})` },
                        { value: "NO_QUESTIONS", label: `No published questions (${grouped.noQuestions})` },
                      ]}
                    />
                  </Field>
                  <Field id="gap-search" label="Find a topic">
                    <Input type="search" value={gapQuery} onChange={(e) => setGapQuery(e.target.value)} />
                  </Field>
                </div>
                <ul aria-label="Content gaps" className="mt-3 flex flex-col divide-y divide-line text-body-sm">
                  {gapRows.map((g) => (
                    <li key={g.topicId} className="flex flex-wrap items-center gap-2 py-2">
                      <span className="min-w-48 flex-1 font-medium text-fg">{g.name}</span>
                      <span className="text-fg-secondary">{g.gaps.map((k) => (k === "NO_LESSONS" ? "no lesson" : "no questions")).join(" · ")}</span>
                      {unitsForTopic(nodes, rollup, g.topicId).length > 0 && (
                        <Button size="sm" variant="ghost" onClick={() => goToTopic(g.topicId)}>
                          Go to unit
                        </Button>
                      )}
                      {g.gaps.includes("NO_LESSONS") && (
                        <Link href={`/admin/lessons/generate?node=${g.topicId}`} className="focus-ring rounded-badge text-link underline underline-offset-2">
                          Lesson editor<span className="sr-only"> for {g.name}</span>
                        </Link>
                      )}
                      {g.gaps.includes("NO_QUESTIONS") && (
                        <Link href={`/admin/questions?topic=${g.topicId}`} className="focus-ring rounded-badge text-link underline underline-offset-2">
                          Question bank<span className="sr-only"> for {g.name}</span>
                        </Link>
                      )}
                      <Link href={`/admin/lessons/coverage?exam=${exam.id}`} className="focus-ring rounded-badge text-link underline underline-offset-2">
                        Coverage<span className="sr-only"> matrix for {exam.title}</span>
                      </Link>
                    </li>
                  ))}
                  {gapRows.length === 0 && <li className="py-2 text-fg-secondary">No gap matches this filter.</li>}
                </ul>
              </details>
            )}
          </>
        )}

      </section>

      <Dialog
        open={confirm === "delete"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Delete "${selected?.title ?? ""}"?`}
        description={descendants.size ? `This also deletes ${descendants.size} node(s) inside it and their topic links.` : "Its topic links are removed too."}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={pending}
              onClick={() => {
                const id = selected?.id;
                setConfirm(null);
                if (id) run(() => deleteSyllabusNodeAction(version.id, id) as Promise<Result>, "Deleted.", () => setSelectedId(null));
              }}
            >
              Delete
            </Button>
          </>
        }
      />
      <Dialog
        open={confirm === "publish"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Publish version ${version.version_number}?`}
        description="Published versions cannot be edited. Check what changes for students first."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button onClick={publish} loading={pending} disabled={!impact || !typedOk}>
              Publish now
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3 text-body-sm" data-publish-impact="">
          {!impact && <Alert tone="danger">What publishing changes could not be worked out. Reload the page; publishing stays off until it is shown.</Alert>}
          {impact && (
            <>
              <p>
                {impact.current
                  ? `Students now see version ${impact.current.versionNumber}${impact.current.tier ? ` (${impact.current.tier})` : " (all tiers)"}.`
                  : "No version is published for this exam yet."}{" "}
                {publishedPeer ? `Version ${publishedPeer.versionNumber} (same tier) will be archived.` : ""}
              </p>
              <ul className="flex flex-col gap-1">
                <li>
                  Topics: {impact.topics} in this version · {impact.topicsAdded.length} new · {impact.topicsRemoved.length} removed
                </li>
                <li>
                  Units: {impact.unitsAdded} new · {impact.unitsRemoved} removed
                </li>
                <li>
                  Content already there: {impact.withLessons} topic(s) with a published lesson · {impact.withQuestions} with published questions
                </li>
              </ul>
              {impact.topicsRemoved.length > 0 && (
                <div>
                  <p className="font-semibold">Removed from this exam&apos;s syllabus:</p>
                  <ul className="list-disc pl-5">
                    {impact.topicsRemoved.map((t) => (
                      <li key={t.id}>
                        {t.name}: {t.publishedLessons} published lesson(s), {t.publishedQuestions} published question(s), {t.progressRows} student progress record(s)
                      </li>
                    ))}
                  </ul>
                  <p className="text-fg-secondary">Lessons, questions and progress stay in the master tree; they leave this exam&apos;s pages, course and sitemap.</p>
                </div>
              )}
              {impact.otherPublished.map((o) => (
                <Checkbox
                  key={o.id}
                  label={`Also archive version ${o.versionNumber} (${o.tier ?? "all tiers"})`}
                  description={
                    o.shownToStudents
                      ? `It stays published otherwise, and the exam page keeps showing it instead of version ${version.version_number}.`
                      : "It stays published otherwise (another tier)."
                  }
                  checked={archiveOthers.has(o.id)}
                  onChange={(e) =>
                    setArchiveOthers((cur) => {
                      const next = new Set(cur);
                      if (e.target.checked) next.add(o.id);
                      else next.delete(o.id);
                      return next;
                    })
                  }
                />
              ))}
              {needsTypedConfirm(impact) && (
                <Field id="publish-confirm" label={`Published content leaves this exam. Type ${confirmPhrase(version.version_number)} to confirm.`}>
                  <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
                </Field>
              )}
            </>
          )}
        </div>
      </Dialog>
    </div>
  );
}
