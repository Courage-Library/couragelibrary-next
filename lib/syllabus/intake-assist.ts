/**
 * INTAKE-ASSIST-1: the guided review's arithmetic — which undecided items each step's one action may take, the
 * suggestions for a new topic, progress. Pure (no data access, safe in client components); the database re-checks
 * every rule (fn_syllabus_intake_bulk: EXACT only, parents first, subtopics / concepts only).
 */
import { normalizeTaxonomyName } from "@/lib/taxonomy/normalize";
import { diceSimilarity } from "@/lib/syllabus/tree-matcher";
import { INTAKE_BULK_MAX, type IntakeItemView, type IntakeNodeOption } from "@/lib/syllabus/intake-types";

type Item = Pick<IntakeItemView, "id" | "parentId" | "level" | "name" | "matchStatus" | "matchedNodeId" | "decision" | "decisionNodeId" | "origin">;

const LEVEL_ORDER = ["SUBJECT", "TOPIC", "SUBTOPIC", "CONCEPT"] as const;

/** Decided and not ignored: its node (or outline) can carry children. */
export const isOpenParent = (p: Item | undefined): boolean => Boolean(p && p.decision && p.decision !== "IGNORE" && p.decision !== "OUTLINE");

/** Undecided, decidable items. */
export const undecided = <T extends Item>(items: T[]): T[] => items.filter((i) => i.level !== "PAPER" && !i.decision);

/**
 * Step 1: undecided EXACT items whose parent is decided (not ignored) or is itself linked in the same batch — parents
 * first, so a whole exact branch goes in one action. Capped at the bulk limit.
 */
export function exactBatch(items: Item[]): string[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const chosen = new Set<string>();
  for (const level of LEVEL_ORDER) {
    for (const i of items) {
      if (i.level !== level || i.decision || i.matchStatus !== "EXACT" || !i.matchedNodeId) continue;
      const parent = i.parentId ? byId.get(i.parentId) : undefined;
      if (level === "SUBJECT" || (parent && (chosen.has(parent.id) || isOpenParent(parent)))) chosen.add(i.id);
    }
  }
  return [...chosen].slice(0, INTAKE_BULK_MAX);
}

/** Step 4: undecided NEW subtopics under a decided (not ignored) topic; optionally one topic only. */
export function subtopicBatch(items: Item[], topicId?: string): string[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  return items
    .filter((i) => i.level === "SUBTOPIC" && !i.decision && i.matchStatus === "NEW" && (!topicId || i.parentId === topicId))
    .filter((i) => {
      const p = i.parentId ? byId.get(i.parentId) : undefined;
      return p?.level === "TOPIC" && isOpenParent(p);
    })
    .map((i) => i.id)
    .slice(0, INTAKE_BULK_MAX);
}

/** Step 5: undecided concepts under a decided (not ignored) subtopic. */
export function outlineBatch(items: Item[]): string[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  return items
    .filter((i) => i.level === "CONCEPT" && !i.decision && isOpenParent(i.parentId ? byId.get(i.parentId) : undefined))
    .map((i) => i.id)
    .slice(0, INTAKE_BULK_MAX);
}

/** Undecided items whose parent is still undecided (they wait for an earlier step). */
export function waitingForParent(items: Item[], level: Item["level"]): number {
  const byId = new Map(items.map((i) => [i.id, i]));
  return items.filter((i) => i.level === level && !i.decision && i.parentId && !byId.get(i.parentId)?.decision).length;
}

export interface TopicSuggestion {
  nodeId: string;
  name: string;
  score: number;
}

/**
 * Step 3: the 3 most similar existing nodes of the item's level under its parent's node — even below the CLOSE
 * threshold, so the owner can link instead of creating a near-duplicate. Empty until the parent is decided.
 */
export function suggestionsFor(item: Item, parent: Item | undefined, nodes: IntakeNodeOption[], limit = 3): TopicSuggestion[] {
  if (item.level !== "SUBJECT" && !isOpenParent(parent)) return [];
  const scope = item.level === "SUBJECT" ? null : (parent?.decisionNodeId ?? null);
  const name = normalizeTaxonomyName(item.name);
  return nodes
    .filter((n) => n.nodeType === item.level && (n.parentId ?? null) === scope)
    .map((n) => ({ nodeId: n.id, name: n.name, score: Math.round(diceSimilarity(name, normalizeTaxonomyName(n.name)) * 100) / 100 }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, limit);
}

export function progress(items: Item[]): { decided: number; total: number } {
  const decidable = items.filter((i) => i.level !== "PAPER");
  return { decided: decidable.filter((i) => i.decision).length, total: decidable.length };
}
