/**
 * SYLLABUS-UI-1 / SYLLABUS-PUBLISH-IMPACT: the syllabus editor's arithmetic — warnings grouped into "Structure" vs
 * "Content gaps" (Current Affairs-linked topics get no "no lessons" gap), which units carry a topic ("Go to unit"),
 * per-unit mapping labels, Σ expected questions per section / paper, and the publish-confirmation rule. Pure (no data
 * access; safe in client components).
 */
import type { SyllabusEditorNode, SyllabusIssue } from "@/types/syllabus";

/** Validation warning codes that are about content still to be written, not about the syllabus structure. */
export const CONTENT_GAP_CODES = ["TOPIC_NO_SERVABLE_DOCUMENTS", "TOPIC_NO_PUBLISHED_QUESTIONS"] as const;
export type ContentGapKind = "NO_LESSONS" | "NO_QUESTIONS";
/** canonical_taxonomy_nodes.metadata.content_source for a topic whose content comes from Current Affairs */
export const CA_CONTENT_SOURCE = "CURRENT_AFFAIRS";

export interface ContentGapRow {
  topicId: string;
  name: string;
  gaps: ContentGapKind[];
}

export interface GroupedWarnings {
  /** structure warnings (shown first, open): anything that is not a content gap */
  structure: SyllabusIssue[];
  /** one row per topic with its content gaps (collapsed by default) */
  gaps: ContentGapRow[];
  noLessons: number;
  noQuestions: number;
  /** topics linked to Current Affairs: their "no lessons" warning is replaced by this label */
  caLinked: Array<{ topicId: string; name: string }>;
}

const topicName = (w: SyllabusIssue) => (/^Topic "(.+)" has /.exec(w.message)?.[1] ?? w.message);

export function groupWarnings(warnings: SyllabusIssue[], caLinkedTopicIds: ReadonlySet<string>): GroupedWarnings {
  const structure: SyllabusIssue[] = [];
  const rows = new Map<string, ContentGapRow>();
  const ca = new Map<string, string>();
  for (const w of warnings) {
    const kind: ContentGapKind | null = w.code === "TOPIC_NO_SERVABLE_DOCUMENTS" ? "NO_LESSONS" : w.code === "TOPIC_NO_PUBLISHED_QUESTIONS" ? "NO_QUESTIONS" : null;
    if (!kind || !w.topic_id) {
      structure.push(w);
      continue;
    }
    if (kind === "NO_LESSONS" && caLinkedTopicIds.has(w.topic_id)) {
      ca.set(w.topic_id, topicName(w));
      continue;
    }
    const row = rows.get(w.topic_id) ?? { topicId: w.topic_id, name: topicName(w), gaps: [] };
    if (!row.gaps.includes(kind)) row.gaps.push(kind);
    rows.set(w.topic_id, row);
  }
  const gaps = [...rows.values()].sort((a, b) => a.name.localeCompare(b.name));
  return {
    structure,
    gaps,
    noLessons: gaps.filter((g) => g.gaps.includes("NO_LESSONS")).length,
    noQuestions: gaps.filter((g) => g.gaps.includes("NO_QUESTIONS")).length,
    caLinked: [...ca.entries()].map(([topicId, name]) => ({ topicId, name })).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/** canonical node id → its rolled-up TOPIC id and own level (from the master tree the page loads) */
export type TopicRollup = Record<string, { topicId: string; level: string }>;

/** The UNITs whose mappings roll up to this topic (for "Go to unit"), in tree order. */
export function unitsForTopic(nodes: SyllabusEditorNode[], rollup: TopicRollup, topicId: string): string[] {
  return nodes
    .filter((n) => n.kind === "UNIT" && n.mappings.some((m) => (rollup[m.topic_id]?.topicId ?? m.topic_id) === topicId))
    .sort((a, b) => a.depth - b.depth || a.display_order - b.display_order)
    .map((n) => n.id);
}

/**
 * "1 topic", "3 subtopics", "1 topic · 2 concepts": what a unit maps, by level — the per-unit count is mapping rows
 * (topics, subtopics or concepts), the version total counts DISTINCT rolled-up topics, so they are labelled apart.
 */
export function mappingLabel(n: SyllabusEditorNode, rollup: TopicRollup): string {
  const counts: Record<string, number> = {};
  for (const m of n.mappings) {
    const level = rollup[m.topic_id]?.level ?? "TOPIC";
    counts[level] = (counts[level] || 0) + 1;
  }
  const word: Record<string, [string, string]> = { TOPIC: ["topic", "topics"], SUBTOPIC: ["subtopic", "subtopics"], CONCEPT: ["concept", "concepts"] };
  const parts = ["TOPIC", "SUBTOPIC", "CONCEPT"].filter((l) => counts[l]).map((l) => `${counts[l]} ${word[l][counts[l] === 1 ? 0 : 1]}`);
  return parts.length ? parts.join(" · ") : "no topics";
}

/** A unit's expected questions: min–max when set, else the intake's ~average (metadata.avg_questions). */
export function unitQuestions(n: SyllabusEditorNode): { low: number; high: number; label: string } | null {
  if (n.expected_questions_min !== null || n.expected_questions_max !== null) {
    const low = n.expected_questions_min ?? n.expected_questions_max ?? 0;
    const high = n.expected_questions_max ?? n.expected_questions_min ?? 0;
    return { low, high, label: low === high ? `${low} Q` : `${low}–${high} Q` };
  }
  if (typeof n.avg_questions === "number") return { low: n.avg_questions, high: n.avg_questions, label: `~${n.avg_questions} Q` };
  return null;
}

export interface QuestionSum {
  nodeId: string;
  low: number;
  high: number;
  /** the section's / paper's own question count (expected max, else min), if set */
  target: number | null;
  /** more than 20 % away from the target (only when both are known) */
  off: boolean;
  label: string;
}

/** Σ of the units' expected questions under each SECTION / PAPER vs that node's own question count. */
export function questionSums(nodes: SyllabusEditorNode[]): Map<string, QuestionSum> {
  const kids = new Map<string | null, SyllabusEditorNode[]>();
  for (const n of nodes) kids.set(n.parent_id, [...(kids.get(n.parent_id) ?? []), n]);
  const out = new Map<string, QuestionSum>();
  const walk = (n: SyllabusEditorNode): { low: number; high: number; known: boolean } => {
    if (n.kind === "UNIT") {
      const q = unitQuestions(n);
      return q ? { low: q.low, high: q.high, known: true } : { low: 0, high: 0, known: false };
    }
    let low = 0;
    let high = 0;
    let known = false;
    for (const c of kids.get(n.id) ?? []) {
      const s = walk(c);
      low += s.low;
      high += s.high;
      known = known || s.known;
    }
    if (known) {
      const target = n.expected_questions_max ?? n.expected_questions_min;
      const lo = Math.round(low * 10) / 10;
      const hi = Math.round(high * 10) / 10;
      const mid = (lo + hi) / 2;
      const off = target !== null && target > 0 && Math.abs(mid - target) > target * 0.2;
      out.set(n.id, { nodeId: n.id, low: lo, high: hi, target, off, label: `Σ ${lo === hi ? lo : `${lo}–${hi}`}${target !== null ? ` / ${target}` : ""} Q` });
    }
    return { low, high, known };
  };
  for (const root of kids.get(null) ?? []) walk(root);
  return out;
}

export interface PublishImpactTopic {
  id: string;
  name: string;
  publishedLessons: number;
  publishedQuestions: number;
  progressRows: number;
}

export interface PublishImpact {
  /** the version students see now (what this publish replaces on the exam page), if any */
  current: { id: string; versionNumber: number; tier: string | null } | null;
  /** PUBLISHED versions of the same exam + cycle that stay published unless archived too (another tier) */
  otherPublished: Array<{ id: string; versionNumber: number; tier: string | null; shownToStudents: boolean }>;
  topicsAdded: Array<{ id: string; name: string }>;
  topicsRemoved: PublishImpactTopic[];
  unitsAdded: number;
  unitsRemoved: number;
  /** topics in the new version with a published lesson / with published questions */
  withLessons: number;
  withQuestions: number;
  topics: number;
}

/** The typed confirmation the owner must enter when publishing would drop published content or progress. */
export const confirmPhrase = (versionNumber: number) => `PUBLISH v${versionNumber}`;

/** Something published (a lesson, questions, student progress) would leave the exam's syllabus. */
export function needsTypedConfirm(impact: PublishImpact): boolean {
  return impact.topicsRemoved.some((t) => t.publishedLessons > 0 || t.publishedQuestions > 0 || t.progressRows > 0);
}
