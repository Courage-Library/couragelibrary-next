/**
 * SYLLABUS-MAP-1 B2: resolves the master-tree references of a validated MASTER_INTAKE / EXAM_MAP file — pure and
 * deterministic. The same rules as the v3 matcher (lib/syllabus/tree-matcher.ts: the ONE normalization, Dice ≥ 0.55 or
 * "every word of the shorter name", ≤ 3 candidates), plus the path step (design §2.C):
 *   EXACT_REF  a "ref" path equals an active, public node's path (of the right level)            → linked
 *   EXACT      the normalized name (or Hindi name) equals one node in scope                      → linked
 *   ALIAS      a node alias equals the name (or an item alias equals a node name), one node       → linked
 *   CLOSE      similar names — or more than one exact / alias hit — SUGGESTIONS ONLY             → undecided
 *   NEW        nothing similar (a proposed node, or a name nothing matches)                      → undecided
 *   UNKNOWN_REF a "ref" path that does not exist (suggestions by its last segment)               → undecided
 * Scope: a MASTER_INTAKE stays inside its subject; a proposed node is matched among its parent's children; an EXAM_MAP
 * name is matched across all subjects. NEVER creates anything and never decides a fuzzy match (the database re-checks
 * every linked claim in fn_syllabus_map_create).
 */
import { normalizeTaxonomyName } from "@/lib/taxonomy/normalize";
import { CLOSE_THRESHOLD, MAX_CANDIDATES, diceSimilarity, wordSubset } from "@/lib/syllabus/tree-matcher";
import type { MasterIntake } from "@/lib/syllabus/master-intake-contract";
import type { ExamMap } from "@/lib/syllabus/exam-map-contract";

export type MapMatchStatus = "EXACT_REF" | "EXACT" | "ALIAS" | "CLOSE" | "NEW" | "UNKNOWN_REF";
export const LINKED_STATUSES: readonly MapMatchStatus[] = ["EXACT_REF", "EXACT", "ALIAS"];

export interface MapNode {
  id: string;
  parentId: string | null;
  nodeType: string;
  name: string;
  nameHi: string | null;
  path: string;
  isActive: boolean;
  isInternal: boolean;
}
export interface MapAlias {
  nodeId: string;
  normalized: string;
}
export interface MapCandidate {
  node_id: string;
  name: string;
  path: string;
  score: number;
}
/** One row for fn_syllabus_map_create (snake_case: it goes to the database as is). */
export interface MapItemDraft {
  key: string;
  parent_key: string | null;
  kind: "REF" | "NAME" | "NEW";
  level: "TOPIC" | "SUBTOPIC" | null;
  ref_path: string | null;
  parent_node_id: string | null;
  raw_name: string | null;
  raw_name_hi: string | null;
  aliases: string[];
  outline: string[] | null;
  section_key: string | null;
  weightage_tier: string | null;
  avg_questions: number | null;
  origin: string | null;
  match_status: MapMatchStatus;
  matched_node_id: string | null;
  candidates: MapCandidate[];
}
export type MapMatchResult = { ok: true; subjectNodeId: string | null; items: MapItemDraft[] } | { ok: false; errors: { path: string; message: string }[] };

const LEVEL_BY_DEPTH: Record<number, "TOPIC" | "SUBTOPIC"> = { 2: "TOPIC", 3: "SUBTOPIC" };

class Index {
  readonly byPath = new Map<string, MapNode>();
  readonly byId = new Map<string, MapNode>();
  readonly aliasesOf = new Map<string, string[]>();
  readonly nodes: MapNode[];
  constructor(nodes: MapNode[], aliases: MapAlias[]) {
    this.nodes = nodes.filter((n) => n.isActive && !n.isInternal);
    for (const n of this.nodes) {
      this.byPath.set(n.path, n);
      this.byId.set(n.id, n);
    }
    for (const a of aliases) this.aliasesOf.set(a.nodeId, [...(this.aliasesOf.get(a.nodeId) || []), a.normalized]);
  }
}

/** exact → alias → similar → none, among `pool` (nodes of one level). */
function matchName(name: string, nameHi: string | null, aliases: string[], pool: MapNode[], ix: Index): Pick<MapItemDraft, "match_status" | "matched_node_id" | "candidates"> {
  const n = normalizeTaxonomyName(name);
  const hi = nameHi ? normalizeTaxonomyName(nameHi) : null;
  const itemAliases = aliases.map(normalizeTaxonomyName);
  const cand = (xs: MapNode[], score = 1): MapCandidate[] => xs.slice(0, MAX_CANDIDATES).map((x) => ({ node_id: x.id, name: x.name, path: x.path, score }));
  const exact = pool.filter((x) => normalizeTaxonomyName(x.name) === n || (x.nameHi && (normalizeTaxonomyName(x.nameHi) === n || (hi && normalizeTaxonomyName(x.nameHi) === hi))));
  if (exact.length === 1) return { match_status: "EXACT", matched_node_id: exact[0].id, candidates: [] };
  if (exact.length > 1) return { match_status: "CLOSE", matched_node_id: null, candidates: cand(exact) }; // ambiguous: the owner picks
  const alias = pool.filter((x) => (ix.aliasesOf.get(x.id) || []).some((a) => a === n || itemAliases.includes(a)) || itemAliases.includes(normalizeTaxonomyName(x.name)));
  if (alias.length === 1) return { match_status: "ALIAS", matched_node_id: alias[0].id, candidates: [] };
  if (alias.length > 1) return { match_status: "CLOSE", matched_node_id: null, candidates: cand(alias) };
  const similar = pool
    .map((x) => {
      const xn = normalizeTaxonomyName(x.name);
      return { x, score: Math.max(diceSimilarity(n, xn), wordSubset(n, xn) ? CLOSE_THRESHOLD : 0) };
    })
    .filter((s) => s.score >= CLOSE_THRESHOLD)
    .sort((a, b) => b.score - a.score || a.x.path.localeCompare(b.x.path));
  if (similar.length) return { match_status: "CLOSE", matched_node_id: null, candidates: similar.slice(0, MAX_CANDIDATES).map((s) => ({ node_id: s.x.id, name: s.x.name, path: s.x.path, score: Math.round(s.score * 100) / 100 })) };
  return { match_status: "NEW", matched_node_id: null, candidates: [] };
}

/** A path → its node (active, public, of the level its depth says), or suggestions by its last segment. */
function matchRef(ref: string, ix: Index, scope: (n: MapNode) => boolean): Pick<MapItemDraft, "match_status" | "matched_node_id" | "candidates" | "level"> {
  const level = LEVEL_BY_DEPTH[ref.split(".").length] ?? null;
  const node = ix.byPath.get(ref);
  if (node && level && node.nodeType === level && scope(node)) return { match_status: "EXACT_REF", matched_node_id: node.id, candidates: [], level };
  const last = ref.split(".").pop() as string;
  const pool = ix.nodes.filter((x) => x.nodeType === level && scope(x));
  const m = matchName(last.replace(/-/g, " "), null, [], pool, ix);
  const candidates = m.matched_node_id ? [{ node_id: m.matched_node_id, name: ix.byId.get(m.matched_node_id)!.name, path: ix.byId.get(m.matched_node_id)!.path, score: 1 }] : m.candidates;
  return { match_status: "UNKNOWN_REF", matched_node_id: null, candidates, level };
}

const blank = (key: string): MapItemDraft => ({
  key,
  parent_key: null,
  kind: "REF",
  level: null,
  ref_path: null,
  parent_node_id: null,
  raw_name: null,
  raw_name_hi: null,
  aliases: [],
  outline: null,
  section_key: null,
  weightage_tier: null,
  avg_questions: null,
  origin: null,
  match_status: "NEW",
  matched_node_id: null,
  candidates: [],
});

export function matchMasterIntake(value: MasterIntake, nodes: MapNode[], aliases: MapAlias[]): MapMatchResult {
  const ix = new Index(nodes, aliases);
  const subject = ix.byPath.get(value.subject);
  if (!subject || subject.nodeType !== "SUBJECT") return { ok: false, errors: [{ path: "$.subject", message: `"${value.subject}" is not an active master subject.` }] };
  const inSubject = (n: MapNode) => n.path.startsWith(`${value.subject}.`);
  const errors: { path: string; message: string }[] = [];
  const out: MapItemDraft[] = [];
  const byKey = new Map<string, MapItemDraft>();
  for (const it of value.items) {
    const d = blank(it.key);
    d.raw_name_hi = it.nameHi;
    d.aliases = it.aliases;
    d.outline = it.outline;
    if (it.kind === "EXISTING") {
      Object.assign(d, { kind: "REF", ref_path: it.ref }, matchRef(it.ref as string, ix, inSubject));
    } else {
      d.kind = "NEW";
      d.level = it.level;
      d.raw_name = it.name;
      let parent: MapNode | null = null;
      if (it.parentRef) {
        parent = ix.byPath.get(it.parentRef) ?? null;
        if (!parent || !(parent.id === subject.id || inSubject(parent)) || parent.nodeType !== (it.level === "TOPIC" ? "SUBJECT" : "TOPIC")) {
          errors.push({ path: it.key, message: `The parent "${it.parentRef}" of "${it.name}" is not an active ${it.level === "TOPIC" ? "subject" : "topic"} of this subject.` });
          continue;
        }
      } else if (it.parentKey) {
        // a subtopic of a proposed topic: matched under that topic when the topic itself exists already
        d.parent_key = it.parentKey;
        const p = byKey.get(it.parentKey);
        parent = p && p.matched_node_id ? ix.byId.get(p.matched_node_id) ?? null : null;
      }
      d.parent_node_id = parent ? parent.id : null;
      Object.assign(d, parent ? matchName(it.name as string, it.nameHi, it.aliases, ix.nodes.filter((x) => x.parentId === parent!.id && x.nodeType === it.level), ix) : { match_status: "NEW", matched_node_id: null, candidates: [] });
    }
    byKey.set(it.key, d);
    out.push(d);
  }
  return errors.length ? { ok: false, errors } : { ok: true, subjectNodeId: subject.id, items: out };
}

export function matchExamMap(value: ExamMap, nodes: MapNode[], aliases: MapAlias[]): MapMatchResult {
  const ix = new Index(nodes, aliases);
  const errors: { path: string; message: string }[] = [];
  const out: MapItemDraft[] = [];
  const anywhere = () => true;
  for (const paper of value.papers)
    for (const section of paper.sections)
      for (const e of section.map) {
        const d = blank(e.key);
        Object.assign(d, { section_key: section.key, weightage_tier: e.weightageTier, avg_questions: e.avgQuestions, origin: e.origin, aliases: e.aliases, raw_name_hi: e.nameHi });
        if (e.kind === "REF") {
          Object.assign(d, { kind: "REF", ref_path: e.ref }, matchRef(e.ref as string, ix, anywhere));
        } else if (e.kind === "NAME") {
          d.kind = "NAME";
          d.raw_name = e.name;
          Object.assign(d, matchName(e.name as string, null, e.aliases, ix.nodes.filter((x) => x.nodeType === "TOPIC" || x.nodeType === "SUBTOPIC"), ix));
          if (d.matched_node_id) d.level = ix.byId.get(d.matched_node_id)!.nodeType as "TOPIC" | "SUBTOPIC";
        } else {
          d.kind = "NEW";
          d.level = e.level;
          d.raw_name = e.name;
          const parent = e.parentRef ? ix.byPath.get(e.parentRef) : undefined;
          if (!parent || parent.nodeType !== (e.level === "TOPIC" ? "SUBJECT" : "TOPIC")) {
            errors.push({ path: e.key, message: `The parent "${e.parentRef}" of the proposed "${e.name}" is not an active ${e.level === "TOPIC" ? "subject" : "topic"}.` });
            continue;
          }
          d.parent_node_id = parent.id;
          Object.assign(d, matchName(e.name as string, e.nameHi, e.aliases, ix.nodes.filter((x) => x.parentId === parent.id && x.nodeType === e.level), ix));
        }
        out.push(d);
      }
  return errors.length ? { ok: false, errors } : { ok: true, subjectNodeId: null, items: out };
}

export function mapMatchSummary(items: Pick<MapItemDraft, "match_status">[]): Record<MapMatchStatus, number> {
  const s: Record<MapMatchStatus, number> = { EXACT_REF: 0, EXACT: 0, ALIAS: 0, CLOSE: 0, NEW: 0, UNKNOWN_REF: 0 };
  for (const i of items) s[i.match_status] += 1;
  return s;
}
