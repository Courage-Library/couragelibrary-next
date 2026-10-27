/**
 * CA-2: matches intake items to the master tree — pure and deterministic (same input → same output), level by level,
 * scoped by the matched parent. Uses the ONE normalization (lib/taxonomy/normalize.ts = fn_taxonomy_normalize).
 *   EXACT  the normalized name (or Hindi name) equals a node's name / Hindi name under the matched parent → link
 *   ALIAS  the item's name, Hindi name or one of its aliases equals a node's alias (or an item alias equals a node
 *          name) under the matched parent → link
 *   CLOSE  no equality, but up to 3 similar nodes (bigram Dice ≥ CLOSE_THRESHOLD, or every word of the shorter name
 *          in the longer) → suggestions only; the owner confirms
 *   NEW    nothing similar → a proposed node (an unmatched SUBJECT = a proposed new branch with all its children)
 * Children of an item that is not EXACT / ALIAS get suggestions from the children of the parent's best candidate,
 * never an EXACT / ALIAS claim (the database accepts those only under a matched parent).
 * Never creates anything; never decides anything.
 */
import { normalizeTaxonomyName } from "@/lib/taxonomy/normalize";
import type { IntakeItemDraft, IntakeLevel } from "@/lib/syllabus/intake-contract";

export const CLOSE_THRESHOLD = 0.55;
export const MAX_CANDIDATES = 3;

export type MatchStatus = "EXACT" | "ALIAS" | "CLOSE" | "NEW" | "NOT_APPLICABLE";

export interface MatcherNode {
  id: string;
  parentId: string | null;
  nodeType: string;
  name: string;
  nameHi: string | null;
  isActive: boolean;
}

export interface MatcherAlias {
  nodeId: string;
  normalized: string;
}

export interface MatchCandidate {
  node_id: string;
  name: string;
  score: number;
  reason: "SIMILAR" | "WORDS";
}

export interface MatchedItem extends IntakeItemDraft {
  match_status: MatchStatus;
  matched_node_id: string | null;
  candidates: MatchCandidate[];
}

function bigrams(s: string): string[] {
  const t = s.replace(/ /g, "");
  if (t.length < 2) return t ? [t] : [];
  const out: string[] = [];
  for (let i = 0; i < t.length - 1; i++) out.push(t.slice(i, i + 2));
  return out;
}

/** Sørensen–Dice over character bigrams of two normalized strings (0..1). */
export function diceSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const A = bigrams(a);
  const B = bigrams(b);
  if (!A.length || !B.length) return 0;
  const counts = new Map<string, number>();
  A.forEach((g) => counts.set(g, (counts.get(g) || 0) + 1));
  let both = 0;
  B.forEach((g) => {
    const n = counts.get(g) || 0;
    if (n > 0) {
      both++;
      counts.set(g, n - 1);
    }
  });
  return (2 * both) / (A.length + B.length);
}

/** Every word of the shorter normalized name appears in the longer one (and the shorter has ≥ 1 real word). */
export function wordSubset(a: string, b: string): boolean {
  const wa = a.split(" ").filter((w) => w.length > 1 && w !== "and" && w !== "of" && w !== "the");
  const wb = b.split(" ").filter((w) => w.length > 1 && w !== "and" && w !== "of" && w !== "the");
  if (!wa.length || !wb.length) return false;
  const [small, big] = wa.length <= wb.length ? [wa, new Set(wb)] : [wb, new Set(wa)];
  return small.every((w) => big.has(w));
}

export function matchIntake(items: IntakeItemDraft[], nodes: MatcherNode[], aliases: MatcherAlias[]): MatchedItem[] {
  const active = nodes.filter((n) => n.isActive);
  const childrenOf = new Map<string, MatcherNode[]>();
  active.forEach((n) => {
    const k = n.parentId ?? "ROOT";
    childrenOf.set(k, [...(childrenOf.get(k) || []), n]);
  });
  const aliasesOf = new Map<string, string[]>();
  aliases.forEach((a) => aliasesOf.set(a.nodeId, [...(aliasesOf.get(a.nodeId) || []), a.normalized]));

  const byKey = new Map<string, MatchedItem>();
  const out: MatchedItem[] = [];
  for (const item of items) {
    if (item.level === "PAPER") {
      const m: MatchedItem = { ...item, match_status: "NOT_APPLICABLE", matched_node_id: null, candidates: [] };
      byKey.set(item.key, m);
      out.push(m);
      continue;
    }
    // scope: root subjects, or the children of the parent's matched node; a parent that is not matched gives
    // suggestions only, from the children of its best candidate
    const parent = item.parent_key ? byKey.get(item.parent_key) : undefined;
    let scope: MatcherNode[] = [];
    let claimable = true;
    if (item.level === "SUBJECT") scope = childrenOf.get("ROOT") || [];
    else if (parent?.matched_node_id) scope = childrenOf.get(parent.matched_node_id) || [];
    else {
      claimable = false;
      const best = parent?.candidates[0]?.node_id;
      scope = best ? childrenOf.get(best) || [] : [];
    }
    scope = scope.filter((n) => n.nodeType === (item.level as IntakeLevel));

    const names = [item.name, item.name_hi].filter((x): x is string => Boolean(x)).map(normalizeTaxonomyName).filter(Boolean);
    const itemAliases = item.aliases.map(normalizeTaxonomyName).filter(Boolean);
    let status: MatchStatus = "NEW";
    let matched: string | null = null;
    if (claimable) {
      const exact = scope.find((n) => [n.name, n.nameHi].filter((x): x is string => Boolean(x)).map(normalizeTaxonomyName).some((v) => names.includes(v)));
      if (exact) {
        status = "EXACT";
        matched = exact.id;
      } else {
        const viaAlias = scope.find((n) => {
          const nodeAliases = aliasesOf.get(n.id) || [];
          const nodeNames = [n.name, n.nameHi].filter((x): x is string => Boolean(x)).map(normalizeTaxonomyName);
          return [...names, ...itemAliases].some((v) => nodeAliases.includes(v)) || itemAliases.some((v) => nodeNames.includes(v));
        });
        if (viaAlias) {
          status = "ALIAS";
          matched = viaAlias.id;
        }
      }
    }
    let candidates: MatchCandidate[] = [];
    if (!matched) {
      const scored = scope
        .map((n) => {
          const targets = [n.name, n.nameHi, ...(aliasesOf.get(n.id) || [])].filter((x): x is string => Boolean(x)).map(normalizeTaxonomyName);
          let score = 0;
          let words = false;
          for (const a of [...names, ...itemAliases]) {
            for (const b of targets) {
              score = Math.max(score, diceSimilarity(a, b));
              words = words || wordSubset(a, b);
            }
          }
          return { n, score: Math.round(score * 1000) / 1000, words };
        })
        .filter((x) => x.score >= CLOSE_THRESHOLD || x.words)
        .sort((x, y) => y.score - x.score || x.n.name.localeCompare(y.n.name) || x.n.id.localeCompare(y.n.id))
        .slice(0, MAX_CANDIDATES);
      candidates = scored.map((x) => ({ node_id: x.n.id, name: x.n.name, score: x.score, reason: x.score >= CLOSE_THRESHOLD ? "SIMILAR" : "WORDS" }));
      status = candidates.length ? "CLOSE" : "NEW";
    }
    const m: MatchedItem = { ...item, match_status: status, matched_node_id: matched, candidates };
    byKey.set(item.key, m);
    out.push(m);
  }
  return out;
}

/** Counts by status (for the review screen and the audit). */
export function matchSummary(items: MatchedItem[]): Record<MatchStatus, number> {
  const s: Record<MatchStatus, number> = { EXACT: 0, ALIAS: 0, CLOSE: 0, NEW: 0, NOT_APPLICABLE: 0 };
  items.forEach((i) => (s[i.match_status] += 1));
  return s;
}
