/**
 * CA-7 coverage matrix (design H) — pure. For one exam (× cycle): the exam's mapped master-tree nodes (from its published
 * syllabus) and which of them have a published EN / HI node lesson. INTERNAL nodes (the legacy "<Subject> General
 * Topics" catch-alls) and everything under them never count. "Build next" = the missing nodes in master order.
 */
export interface CoverageNodeInput {
  id: string;
  name: string;
  path: string; // hierarchy_path (master order)
  nodeType: string;
  isInternal: boolean;
  /** an INTERNAL ancestor makes the node internal too */
  underInternal: boolean;
  weightageTier: string | null;
}

export interface CoverageLessonInput {
  nodeId: string;
  documentId: string;
  hiCurrent: boolean;
}

export interface CoverageRow {
  nodeId: string;
  name: string;
  path: string;
  nodeType: string;
  weightageTier: string | null;
  en: boolean;
  hi: boolean;
  documentId: string | null;
}

export interface Coverage {
  total: number;
  en: number;
  hi: number;
  enPercent: number;
  hiPercent: number;
  rows: CoverageRow[];
  missing: CoverageRow[];
  excludedInternal: number;
}

const WEIGHT_ORDER = ["HIGH_YIELD", "CORE", "MODERATE", "LOW", "OPTIONAL"];

const pct = (n: number, d: number) => (d === 0 ? 0 : Math.round((n / d) * 1000) / 10);

export function computeCoverage(nodes: CoverageNodeInput[], lessons: CoverageLessonInput[]): Coverage {
  const byNode = new Map(lessons.map((l) => [l.nodeId, l]));
  const seen = new Set<string>();
  let excludedInternal = 0;
  const rows: CoverageRow[] = [];
  for (const n of nodes) {
    if (seen.has(n.id)) continue;
    seen.add(n.id);
    if (n.isInternal || n.underInternal) {
      excludedInternal++;
      continue;
    }
    const l = byNode.get(n.id);
    rows.push({ nodeId: n.id, name: n.name, path: n.path, nodeType: n.nodeType, weightageTier: n.weightageTier, en: Boolean(l), hi: Boolean(l?.hiCurrent), documentId: l?.documentId ?? null });
  }
  rows.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const en = rows.filter((r) => r.en).length;
  const hi = rows.filter((r) => r.hi).length;
  // "Build next": the heaviest weightage first, then master order
  const rank = (t: string | null) => (t && WEIGHT_ORDER.includes(t) ? WEIGHT_ORDER.indexOf(t) : WEIGHT_ORDER.length);
  const missing = rows.filter((r) => !r.en).sort((a, b) => rank(a.weightageTier) - rank(b.weightageTier) || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { total: rows.length, en, hi, enPercent: pct(en, rows.length), hiPercent: pct(hi, rows.length), rows, missing, excludedInternal };
}

/** The snapshot stored with a launch (exam_course_launches.coverage) — counts only, no names. */
export function coverageSnapshot(c: Coverage): { total: number; en: number; hi: number; en_percent: number; hi_percent: number; excluded_internal: number } {
  return { total: c.total, en: c.en, hi: c.hi, en_percent: c.enPercent, hi_percent: c.hiPercent, excluded_internal: c.excludedInternal };
}

export interface CoverageExam {
  id: string;
  title: string;
  slug: string;
  launch: { status: "LIVE" | "PAUSED"; launchedAt: string; changedAt: string; changedBy: string; cycleId: string | null } | null;
}

export interface CoverageView {
  exam: CoverageExam;
  cycleId: string | null;
  cycleYear: number | null;
  state: "OK" | "NO_SYLLABUS";
  coverage: Coverage;
}
