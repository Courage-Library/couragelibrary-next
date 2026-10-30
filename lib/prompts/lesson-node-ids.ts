/**
 * LESSON-NODE-ID-1 (architect 2026-10-29): the LESSON prompt gives the assistant the REAL node ids it may use, and the
 * paste check refuses anything else — with a one-click fix. The owner hit an answer whose practice_link carried
 * "node_id": "turn0file0" (a ChatGPT file-citation token).
 *   - allowedNodeIdsBlock: appended after the rendered template (like MUST COVER / PREFERRED NAMES; no placeholder):
 *     the lesson's own node + the nodes below it, with names; practice_link.node_id must be one of them or THIS_TOPIC
 *   - resolveLessonNodeIds: THIS_TOPIC → the lesson's node id; an id outside the allowed list → an error naming the
 *     allowed ids, with the fix USE_THIS_TOPIC (that one block only)
 *   - citationProblems / stripCitations: assistant citation artifacts anywhere in the lesson's text (turn0file0,
 *     citeturn0search1, 【…†…】, [cite: …], [cite_start], private-use marker characters) → an error per block + field,
 *     with the fix STRIP_CITATIONS
 *   - applyLessonFix: applies a fix to ONE pasted part's JSON text (other blocks are untouched)
 * Pure; safe in client components.
 */
import type { BlockError } from "@/lib/lessons/blocks";
import { extractJson } from "@/lib/prompts/paste-extract";

export const THIS_TOPIC = "THIS_TOPIC";
export const ALLOWED_NODES_MAX = 80;
export const ALLOWED_NODE_IDS_HEADING =
  'ALLOWED NODE IDS (practice_link "node_id" must be one of these ids exactly, or the token "THIS_TOPIC" for this lesson\'s own node — never invent an id, never use a file or citation reference):';

export interface AllowedNode {
  id: string;
  name: string;
  level: string;
}
export interface NodeIdContext {
  /** the lesson's own node (THIS_TOPIC resolves to it); first in `allowed` */
  lessonNodeId: string;
  allowed: AllowedNode[];
}
export type LessonFix = { kind: "USE_THIS_TOPIC"; blockId: string } | { kind: "STRIP_CITATIONS" };
export type FixableError = BlockError & { fix?: LessonFix };

/** The block appended after the rendered LESSON template; the lesson's node first. */
export function allowedNodeIdsBlock(nodes: AllowedNode[] | undefined): string {
  const xs = (nodes || []).slice(0, ALLOWED_NODES_MAX);
  if (!xs.length) return "";
  const lines = xs.map((n, i) => `- ${n.id} — ${n.name} (${n.level}${i === 0 ? ", this lesson" : ""})`);
  return `\n\n${ALLOWED_NODE_IDS_HEADING}\n${lines.join("\n")}`;
}

// ---------------------------------------------------------------- citation artifacts
// ChatGPT search / file citations ("turn0file0", "citeturn0search1" — often wrapped in private-use characters),
// "【4:0†source】" markers, Gemini-style "[cite: 1]" / "[cite_start]"
const CITE_TOKEN = /(?<![A-Za-z0-9])(?:cite)?turn\d+(?:file|search|view|news|image|product)\d+(?![A-Za-z0-9])/gi;
const CITE_BRACKET = /【[^】\n]{0,80}†[^】\n]{0,80}】/g;
const CITE_TAG = /\[cite(?:_start|_end)?(?::[^\]\n]{0,80})?\]/gi;
// "<U+E200>cite<U+E202>turn0search1<U+E201>": the wrapper word goes with its private-use markers
const CITE_WRAPPED = /[-](?:cite|filecite|navlist|image_group|entity)[-]/gi;
const PRIVATE_USE = /[-]/g;
const PATTERNS = [CITE_WRAPPED, CITE_TOKEN, CITE_BRACKET, CITE_TAG, PRIVATE_USE];
const isPrivateUse = (ch: string) => ch.length === 1 && ch.charCodeAt(0) >= 0xe000 && ch.charCodeAt(0) <= 0xf8ff;

/** The first citation artifact in a string, or null. */
export function citationArtifact(s: string): string | null {
  for (const re of PATTERNS) {
    re.lastIndex = 0;
    const m = re.exec(s);
    if (m) return isPrivateUse(m[0]) ? `U+${m[0].charCodeAt(0).toString(16).toUpperCase()}` : m[0].replace(PRIVATE_USE, "");
  }
  return null;
}

/** Removes every citation artifact and tidies the spaces it leaves; a string without one is returned unchanged. */
export function stripCitations(s: string): string {
  if (citationArtifact(s) === null) return s;
  let out = s;
  for (const re of PATTERNS) out = out.replace(re, "");
  return out.replace(/[ \t]{2,}/g, " ").replace(/ +([.,;:!?)])/g, "$1").replace(/^[ \t]+|[ \t]+$/g, "");
}

// a practice link's node_id is checked (and fixed) by the node-id rule — never treated as text
const NOT_TEXT = new Set(["node_id"]);

function stripDeep(v: unknown): unknown {
  if (typeof v === "string") return stripCitations(v);
  if (Array.isArray(v)) return v.map(stripDeep);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, NOT_TEXT.has(k) ? x : stripDeep(x)]));
  return v;
}

function walk(v: unknown, path: string, out: { path: string; sample: string }[]) {
  if (typeof v === "string") {
    const a = citationArtifact(v);
    if (a) out.push({ path, sample: a });
  } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`, out));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v as Record<string, unknown>)) if (!NOT_TEXT.has(k)) walk(x, `${path}.${k}`, out);
}

/** Every text field carrying a citation artifact (meta, blocks, uncertain facts), as fixable errors. */
export function citationProblems(meta: unknown, blocks: unknown[], facts: unknown[]): FixableError[] {
  const hits: { path: string; sample: string }[] = [];
  walk(meta, "$.meta", hits);
  blocks.forEach((b, i) => walk(b, `$.blocks[${i}]`, hits));
  walk(facts, "$.uncertain_facts", hits);
  return hits.map((h) => ({
    path: h.path,
    code: "CITATION_ARTIFACT",
    message: `An assistant citation marker ("${h.sample}") is in the text. Lessons carry no citations: use "Strip citation markers" to remove them all (nothing else changes).`,
    fix: { kind: "STRIP_CITATIONS" },
  }));
}

// ---------------------------------------------------------------- practice_link node ids
/** THIS_TOPIC → the lesson's node; any other id must be in the allowed list (an error per block, with its fix). */
export function resolveLessonNodeIds(blocks: unknown[], ctx: NodeIdContext): { blocks: unknown[]; errors: FixableError[] } {
  const allowed = new Map(ctx.allowed.map((n) => [n.id.toLowerCase(), n]));
  const list = ctx.allowed.slice(0, 12).map((n) => `${n.name} (${n.id})`).join(", ") + (ctx.allowed.length > 12 ? `, … ${ctx.allowed.length - 12} more` : "");
  const errors: FixableError[] = [];
  const out = blocks.map((b, i) => {
    if (!b || typeof b !== "object" || Array.isArray(b) || (b as { type?: unknown }).type !== "practice_link") return b;
    const blk = b as Record<string, unknown>;
    const id = blk.node_id;
    if (id === THIS_TOPIC) return { ...blk, node_id: ctx.lessonNodeId };
    if (typeof id === "string" && allowed.has(id.toLowerCase())) return { ...blk, node_id: id.toLowerCase() };
    errors.push({
      path: `$.blocks[${i}].node_id`,
      code: "NODE_ID",
      message: `"${typeof id === "string" ? id.slice(0, 60) : String(id)}" is not a node of this lesson. Allowed: ${list}, or "${THIS_TOPIC}".`,
      fix: { kind: "USE_THIS_TOPIC", blockId: typeof blk.id === "string" ? blk.id : "" },
    });
    return b;
  });
  return { blocks: out, errors };
}

/**
 * Applies a fix to ONE pasted part (its JSON text). USE_THIS_TOPIC sets that block's node_id to the lesson's node;
 * STRIP_CITATIONS strips every text field. Returns the new JSON text, or null when the part is not JSON or the fix
 * does not apply to it (e.g. the block lives in another part).
 */
export function applyLessonFix(text: string, fix: LessonFix, lessonNodeId: string): string | null {
  const x = extractJson(text);
  if (!x.ok || !x.data || typeof x.data !== "object" || Array.isArray(x.data)) return null;
  const o = x.data as Record<string, unknown>;
  if (fix.kind === "USE_THIS_TOPIC") {
    if (!Array.isArray(o.blocks)) return null;
    let hit = false;
    const blocks = o.blocks.map((b) => {
      if (b && typeof b === "object" && !Array.isArray(b) && (b as Record<string, unknown>).id === fix.blockId && (b as Record<string, unknown>).type === "practice_link") {
        hit = true;
        return { ...(b as Record<string, unknown>), node_id: lessonNodeId };
      }
      return b;
    });
    return hit ? JSON.stringify({ ...o, blocks }, null, 2) : null;
  }
  const stripped = { ...o };
  for (const k of ["meta", "blocks", "uncertain_facts"]) if (k in stripped) stripped[k] = stripDeep(stripped[k]);
  const next = JSON.stringify(stripped, null, 2);
  return next === JSON.stringify(o, null, 2) ? null : next;
}
