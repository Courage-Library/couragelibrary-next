/**
 * CA-4: the LESSON prompt (paste-in / paste-out, no API key). The server builds the context of ONE master-tree node
 * (path, level, subject, every published exam syllabus that maps it with its weightage, child nodes, aliases, existing
 * lessons) and renders the ACTIVE LESSON template (prompt_templates; v1 = LESSON_TEMPLATE_V1). The owner pastes the
 * answer back: parseLessonPaste → validateLesson (the same rules the DB enforces) → the completeness checklist →
 * DRAFT → review → publish. Pure; safe in client components.
 * LESSON-PROMPT-2: template v2 slots (CHILDREN, EXAM_LINES, EXAMPLE_FOR_SUBJECT_TYPE, one true subject-type section), the
 * SIZE rule by the highest weightage, meta.suggested_subtopics (taken out of meta, shown to the owner) and multi-part
 * answers ({"part", "total_parts"}, merged in order, validated only when complete).
 * LESSON-NODE-ID-1: the merge refuses assistant citation markers and (given the lesson's allowed node ids) resolves
 * practice_link "THIS_TOPIC" and refuses any other id — each error carries a one-click fix (lib/prompts/lesson-node-ids).
 */
import { textProblem, validateLesson, type BlockError, type LessonBlock, type LessonMeta } from "@/lib/lessons/blocks";
import { LESSON_MAX_EXAMPLES, LESSON_MIN_EXAMPLES, LESSON_MIN_QUICK_CHECKS } from "@/lib/lessons/completeness";
import { LESSON_PASTE_CONTRACT } from "@/lib/prompts/lesson-contract";
import { EXAMPLE_SUBJECT_TYPES, lessonExampleFor, sectionForSubjectType } from "@/lib/prompts/lesson-examples";
import { citationProblems, resolveLessonNodeIds, THIS_TOPIC, type AllowedNode, type FixableError, type NodeIdContext } from "@/lib/prompts/lesson-node-ids";
import { describeBlockPath, extractJson } from "@/lib/prompts/paste-extract";

export { LESSON_PASTE_CONTRACT };
export const UNCERTAIN_FACTS_MAX = 20;
export const SUGGESTED_SUBTOPICS_MAX = 30;
export const LESSON_PARTS_MAX = 10;

export interface LessonExamCoverage {
  exam: string;
  cycleYear: number | null;
  tier: string | null;
  /** the syllabus path inside that exam, e.g. "Tier 1 › Quantitative Aptitude › Percentage" */
  syllabusPath: string;
  weightageTier: string | null;
  questionsMin: number | null;
  questionsMax: number | null;
  /** SYLLABUS-PROMPT-2 intake: the syllabus unit's average questions per paper, when known */
  avgQuestions?: number | null;
}

export interface LessonPromptContext {
  nodeId: string;
  nodeName: string;
  nodePath: string;
  nodeLevel: string;
  subjectName: string | null;
  subjectType: string | null;
  coverage: LessonExamCoverage[];
  childNodes: string[];
  aliases: string[];
  existingLessons: string[];
  /** INTAKE-CONCEPTS-AS-OUTLINE: the subtopic's outline from its exam syllabus (concepts kept as outline lines) */
  mustCover?: string[];
  /** LESSON-NODE-ID-1: the ids a practice_link may use — this node first, then the nodes below it */
  allowedNodes?: AllowedNode[];
}

export const MUST_COVER_MAX = 50;
export const MUST_COVER_HEADING = "MUST COVER (the exam syllabus outline for this subtopic — teach every line, in this order):";

/** The block appended after the rendered LESSON template (no placeholder, like PREFERRED NAMES); empty → nothing. */
export function mustCoverBlock(lines: string[] | undefined): string {
  const xs = (lines || []).slice(0, MUST_COVER_MAX);
  return xs.length ? `\n\n${MUST_COVER_HEADING}\n${xs.map((x) => `- ${x}`).join("\n")}` : "";
}

const list = (xs: string[], none: string) => (xs.length ? xs.map((x) => `- ${x}`).join("\n") : none);

export function coverageLines(coverage: LessonExamCoverage[]): string {
  if (!coverage.length) return "- No published exam syllabus maps this node yet: cover it at the depth of the main central government exams (SSC, Banking, Railways).";
  return coverage
    .map((c) => {
      const q = c.questionsMin !== null || c.questionsMax !== null ? `, about ${c.questionsMin ?? c.questionsMax}${c.questionsMax !== null && c.questionsMax !== c.questionsMin ? `–${c.questionsMax}` : ""} question(s)` : "";
      return `- ${c.exam}${c.cycleYear ? ` ${c.cycleYear}` : ""}${c.tier ? ` (${c.tier})` : ""}: ${c.syllabusPath}${c.weightageTier ? `, weightage ${c.weightageTier}` : ""}${q}`;
    })
    .join("\n");
}

/** The exact block JSON the answer must use (every type the validator accepts, except image). */
export const LESSON_BLOCK_SPEC = `Every block is an object with a unique "id" (lower-case letters, digits and "-", at most 40 characters) and a "type":
- heading: { "level": 2 or 3, "text" }
- paragraph: { "text" }  (rich text)
- list: { "ordered": true/false, "items": ["…"] }  (1–30 items, rich text)
- formula: { "name"?, "latex", "reading" }  (LaTeX with standard commands only; "reading" = how it is read aloud, plain text)
- solved_example: { "difficulty": "EASY" | "MEDIUM" | "HARD", "question", "steps": [{ "text", "math"? }], "answer", "shortcut"?, "mistake"? }
- callout: { "variant": "TIP" | "WARNING" | "INFO" | "MEMORY_HOOK", "title"?, "text" }  (TIP = a shortcut)
- trap: { "kind"?: "CALCULATION_SLIP" | "MISREAD_KEYWORD" | "FORMULA_CONFUSION" | "DISTRACTOR_TRAP", "text", "why" }
- table: { "caption"?, "headers": ["…"], "rows": [["…"]] }  (one cell per header, plain text)
- practice_link: { "node_id", "mode": "PRACTICE" | "PYQ" | "MOCK", "label"? }  (node_id: one of the ALLOWED NODE IDS at the end of this prompt, or "${THIS_TOPIC}"; never invent one)
- quick_check: { "prompt", "options": [{ "id", "text", "correct": true/false, "feedback"? }] }  (2–6 options, at least one correct)
- revision_summary: { "bullets": ["…"], "formulas"?: ["LaTeX"], "speed_rules"?: ["…"] }  (exactly one, near the end)
- memory_lock_points: { "points": ["…"] }  (3–10 short points to remember)
Do NOT output image blocks.
Rich text allows only **bold**, *italic*, \`code\` and inline math between $…$ (e.g. $\\frac{a}{b}$). No HTML, no Markdown links, no URLs, no emojis.
Text may contain "<" and ">" as maths signs (e.g. x < 5) but never a tag.`;

/** A small, VALID example of the envelope (the gate validates it); the node id is the real one. */
export function lessonExample(nodeId: string) {
  return {
    contract: LESSON_PASTE_CONTRACT,
    meta: { title: "Successive Percentage Change", summary: "How two or more percentage changes combine.", estimated_minutes: 25 },
    blocks: [
      { id: "intro", type: "heading", level: 2, text: "What it means" },
      { id: "intro-p", type: "paragraph", text: "When a value changes by **a%** and then by **b%**, the second change acts on the new value." },
      { id: "f-net", type: "formula", name: "Net change", latex: "a + b + \\frac{ab}{100}", reading: "a plus b plus a times b over 100" },
      { id: "ex-1", type: "solved_example", difficulty: "EASY", question: "A price rises by 10% and then by 20%. Find the net change.", steps: [{ text: "Use the net change formula.", math: "10 + 20 + \\frac{10 \\times 20}{100}" }, { text: "Add: 30 + 2 = 32." }], answer: "32% increase", shortcut: "Remember $a + b + ab/100$." },
      { id: "tip-1", type: "callout", variant: "TIP", title: "Decrease", text: "Use a negative value for a decrease, e.g. $-10$." },
      { id: "trap-1", type: "trap", kind: "FORMULA_CONFUSION", text: "Adding 10% and 20% to get 30%.", why: "The second change acts on the new value, not the original." },
      { id: "qc-1", type: "quick_check", prompt: "A value falls by 10% and then rises by 10%. The net change is…", options: [{ id: "a", text: "0%", correct: false }, { id: "b", text: "1% decrease", correct: true, feedback: "$-10 + 10 - 1 = -1$" }] },
      { id: "practice", type: "practice_link", node_id: nodeId, mode: "PRACTICE", label: "Practice this topic" },
      { id: "summary", type: "revision_summary", bullets: ["Net change = a + b + ab/100."], formulas: ["a + b + \\frac{ab}{100}"], speed_rules: ["Use a negative value for a decrease."] },
      { id: "memory", type: "memory_lock_points", points: ["a + b + ab/100", "A decrease is negative", "The order of the changes does not matter"] },
    ],
    uncertain_facts: [] as string[],
  };
}

/** LESSON-PROMPT-2 EXAM_LINES: "exam · tier/section · weightage tier · avg questions" per exam unit. */
export function examLines(coverage: LessonExamCoverage[]): string {
  if (!coverage.length) return "- No published exam syllabus maps this node yet: write at the depth of the main central government exams (SSC, Banking, Railways).";
  return coverage
    .map((c) => {
      const q = c.avgQuestions != null ? `avg ${c.avgQuestions} question(s)` : c.questionsMax != null ? `up to ${c.questionsMax} question(s)` : "avg questions not known";
      return `- ${c.exam}${c.cycleYear ? ` ${c.cycleYear}` : ""} · ${c.tier ? `${c.tier} › ` : ""}${c.syllabusPath} · ${c.weightageTier ?? "weightage not set"} · ${q}`;
    })
    .join("\n");
}

/** SIZE by the highest weightage among the exams (template v2): solved examples + quick checks. */
export const WEIGHTAGE_ORDER = ["HIGH_YIELD", "CORE", "MODERATE", "LOW", "OPTIONAL"] as const;
export function lessonSize(coverage: Pick<LessonExamCoverage, "weightageTier">[]): { tier: string; minExamples: number; maxExamples: number; quickChecks: number } {
  const tiers = coverage.map((c) => c.weightageTier).filter((t): t is string => Boolean(t)).sort((a, b) => WEIGHTAGE_ORDER.indexOf(a as never) - WEIGHTAGE_ORDER.indexOf(b as never));
  const top = tiers[0] ?? "MODERATE";
  if (top === "HIGH_YIELD") return { tier: top, minExamples: 15, maxExamples: 20, quickChecks: 10 };
  if (top === "CORE") return { tier: top, minExamples: 12, maxExamples: 15, quickChecks: 8 };
  return { tier: top, minExamples: 8, maxExamples: 10, quickChecks: 5 };
}

export function lessonPromptValues(ctx: LessonPromptContext): Record<string, string> {
  const section = sectionForSubjectType(ctx.subjectType);
  return {
    // LESSON-PROMPT-2 (v2): exactly one subject-type section is true
    ...Object.fromEntries(EXAMPLE_SUBJECT_TYPES.map((t) => [t, t === section ? "1" : ""])),
    CHILDREN: ctx.childNodes.length ? ctx.childNodes.join(", ") : "none listed",
    EXAM_LINES: examLines(ctx.coverage),
    EXAMPLE_FOR_SUBJECT_TYPE: JSON.stringify(section ? lessonExampleFor(section, ctx.nodeId) : lessonExample(ctx.nodeId), null, 2),
    NODE_NAME: ctx.nodeName,
    NODE_PATH: ctx.nodePath,
    NODE_LEVEL: ctx.nodeLevel,
    SUBJECT_NAME: ctx.subjectName || "not set",
    SUBJECT_TYPE: ctx.subjectType || "not set",
    EXAM_COVERAGE: coverageLines(ctx.coverage),
    CHILD_NODES: list(ctx.childNodes, "- none"),
    ALIASES: ctx.aliases.length ? ctx.aliases.join(", ") : "none",
    EXISTING_LESSONS: list(ctx.existingLessons, "- none"),
    BLOCK_SPEC: LESSON_BLOCK_SPEC,
    EXAMPLE_JSON: JSON.stringify(lessonExample(ctx.nodeId), null, 2),
    MIN_EXAMPLES: String(LESSON_MIN_EXAMPLES),
    MAX_EXAMPLES: String(LESSON_MAX_EXAMPLES),
    MIN_QUICK_CHECKS: String(LESSON_MIN_QUICK_CHECKS),
  };
}

/** LESSON template v1 (seeded by migration 119; the gates prove the seed equals this constant). */
export const LESSON_TEMPLATE_V1 = `You are a senior teacher for Indian government competitive exams writing ONE complete lesson for a coaching platform.

LESSON: "{{NODE_NAME}}" ({{NODE_LEVEL}})
Place in the syllabus tree: {{NODE_PATH}}
Subject: {{SUBJECT_NAME}} (type {{SUBJECT_TYPE}})
Other names: {{ALIASES}}
Parts below this node (cover them inside this lesson):
{{CHILD_NODES}}
Lessons that already exist (do not repeat them; link the idea in one line if needed):
{{EXISTING_LESSONS}}

EXAMS THAT ASK THIS (cover every one of them, at each exam's depth and weightage):
{{EXAM_COVERAGE}}

WRITE THE LESSON IN THIS ORDER
1. The concept from the basics: what it is, why it works, in simple exam English. Assume the student starts from zero.
2. Every formula and rule, each as a formula block with its plain reading; a table where it helps comparison.
3. ALL the question types these exams ask on this node, each named with a level-3 heading and explained.
4. {{MIN_EXAMPLES}} to {{MAX_EXAMPLES}} solved examples, ordered from EASY to HARD, each with clear numbered steps, the answer, and a
   shortcut where one exists. Cover every question type above at least once.
5. Shortcuts and speed methods (TIP callouts).
6. Common traps: at least two trap blocks (what students do wrong and why it fails).
7. At least {{MIN_QUICK_CHECKS}} quick checks in the style of previous year questions, each with the correct option marked and a
   one-line feedback.
8. One practice link block (mode PRACTICE) near the end.
9. A one-page revision summary (key bullets, the formulas, speed rules).
10. Memory Lock points: 3 to 10 short facts the student must never forget.

RULES
- Original writing only: never copy text, examples or questions from books, coaching material or publishers.
- Accuracy first: if you are not sure of a fact, figure or exam detail, add it to "uncertain_facts" (plain text, one per
  fact). Better flagged than wrong. Never invent exam statistics.
- English only in this lesson. Numbers as digits (12, 3.5).
- Plain text values; the only formatting is described below.

BLOCKS (the exact JSON the platform accepts):
{{BLOCK_SPEC}}

OUTPUT: ONE strict JSON object, nothing else — no prose, no code fences. "contract" exactly "LESSON_BLOCKS v2". Example of the
shape (much shorter than the real lesson):
{{EXAMPLE_JSON}}`;

export type LessonPaste =
  | { ok: true; meta: LessonMeta; blocks: LessonBlock[]; uncertainFacts: string[]; suggestedSubtopics: string[] }
  | { ok: false; errors: FixableError[] };

/** LESSON-NODE-ID-1: with the lesson's node ids, practice links are resolved / checked against them. */
export interface LessonMergeOptions {
  nodeIds?: NodeIdContext;
}

/** One pasted part (or a whole single answer): parsed but NOT validated as a lesson yet. */
export type LessonPart =
  | { ok: true; part: number; totalParts: number; meta: unknown; blocks: unknown[]; uncertainFacts: unknown[]; notice: string | null }
  | { ok: false; errors: BlockError[] };

const ROOT_KEYS = ["contract", "meta", "blocks", "uncertain_facts", "part", "total_parts"];

/** Parses ONE pasted JSON object (a single surrounding code fence is tolerated); a single answer is part 1 of 1. */
export function parseLessonPart(text: string): LessonPart {
  const err = (path: string, code: string, message: string): LessonPart => ({ ok: false, errors: [{ path, code, message }] });
  // GEN-CHECK-1: fences / prose around the JSON are removed (with a notice); cut-off and syntax errors are precise
  const x = extractJson(text);
  if (!x.ok) return err(x.line ? `line ${x.line}:${x.column}` : "$", x.code, `${x.message}${x.snippet ? ` Near: ${x.snippet}` : ""}`);
  const data = x.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return err("$", "TYPE", "The answer must be one JSON object.");
  const o = data as Record<string, unknown>;
  for (const k of Object.keys(o)) if (!ROOT_KEYS.includes(k)) return err(`$.${k}`, "UNKNOWN_KEY", `Unknown key "${k}".`);
  if (o.contract !== LESSON_PASTE_CONTRACT) return err("$.contract", "CONTRACT", `"contract" must be "${LESSON_PASTE_CONTRACT}".`);
  const multi = o.part !== undefined || o.total_parts !== undefined;
  const part = multi ? o.part : 1;
  const total = multi ? o.total_parts : 1;
  if (typeof total !== "number" || !Number.isInteger(total) || total < 1 || total > LESSON_PARTS_MAX) return err("$.total_parts", "VALUE", `"total_parts" must be a whole number from 1 to ${LESSON_PARTS_MAX}.`);
  if (typeof part !== "number" || !Number.isInteger(part) || part < 1 || part > total) return err("$.part", "VALUE", `"part" must be a whole number from 1 to ${total}.`);
  if (!Array.isArray(o.blocks)) return err("$.blocks", "TYPE", "Each part has a list of blocks.");
  if (o.uncertain_facts !== undefined && !Array.isArray(o.uncertain_facts)) return err("$.uncertain_facts", "TYPE", "A list of facts.");
  return { ok: true, part, totalParts: total, meta: o.meta, blocks: o.blocks, uncertainFacts: (o.uncertain_facts as unknown[]) ?? [], notice: x.notice };
}

export type LessonMerge =
  | { state: "INCOMPLETE"; totalParts: number; have: number[]; missing: number[] }
  | { state: "COMPLETE"; result: LessonPaste }
  | { state: "ERROR"; errors: FixableError[] };

/**
 * Merges parsed parts in order (1..N, each exactly once, the same total) — the meta from part 1 (later parts may omit it),
 * blocks concatenated, facts concatenated — and validates the WHOLE lesson only when every part is in (ids must be
 * unique across parts: the block validator refuses a duplicate id).
 */
export function mergeLessonParts(parts: LessonPart[], opts: LessonMergeOptions = {}): LessonMerge {
  const errors = parts.flatMap((p) => (p.ok ? [] : p.errors));
  if (errors.length) return { state: "ERROR", errors };
  const ok = parts.filter((p): p is Extract<LessonPart, { ok: true }> => p.ok);
  if (!ok.length) return { state: "ERROR", errors: [{ path: "$", code: "EMPTY", message: "Paste the assistant's JSON answer." }] };
  const total = ok[0].totalParts;
  if (ok.some((p) => p.totalParts !== total)) return { state: "ERROR", errors: [{ path: "$.total_parts", code: "PARTS", message: "The parts disagree on total_parts: paste the parts of ONE answer." }] };
  const seen = new Set<number>();
  for (const p of ok) {
    if (seen.has(p.part)) return { state: "ERROR", errors: [{ path: "$.part", code: "PARTS", message: `Part ${p.part} was pasted twice.` }] };
    seen.add(p.part);
  }
  const missing = Array.from({ length: total }, (_, i) => i + 1).filter((n) => !seen.has(n));
  if (missing.length) return { state: "INCOMPLETE", totalParts: total, have: [...seen].sort((a, b) => a - b), missing };
  const ordered = [...ok].sort((a, b) => a.part - b.part);
  const first = ordered[0];
  // LESSON-NODE-ID-1: assistant citation markers anywhere in the text, then the practice-link node ids — fixable errors
  const rawBlocks = ordered.flatMap((p) => p.blocks);
  const pre: FixableError[] = citationProblems(first.meta, rawBlocks, ordered.flatMap((p) => p.uncertainFacts));
  let resolved: unknown[] = rawBlocks;
  if (opts.nodeIds) {
    const r = resolveLessonNodeIds(rawBlocks, opts.nodeIds);
    resolved = r.blocks;
    pre.push(...r.errors);
  }
  if (pre.length) return { state: "COMPLETE", result: { ok: false, errors: pre.map((e) => ({ ...e, path: describeBlockPath(e.path, rawBlocks) })) } };
  // suggested subtopics travel in meta but are NOT lesson meta: taken out, checked, shown to the owner
  const metaIn = first.meta && typeof first.meta === "object" && !Array.isArray(first.meta) ? { ...(first.meta as Record<string, unknown>) } : first.meta;
  const suggested: string[] = [];
  if (metaIn && typeof metaIn === "object" && !Array.isArray(metaIn) && "suggested_subtopics" in metaIn) {
    const raw = (metaIn as Record<string, unknown>).suggested_subtopics;
    delete (metaIn as Record<string, unknown>).suggested_subtopics;
    if (!Array.isArray(raw) || raw.length > SUGGESTED_SUBTOPICS_MAX) return { state: "ERROR", errors: [{ path: "$.meta.suggested_subtopics", code: "VALUE", message: `A list of at most ${SUGGESTED_SUBTOPICS_MAX} names.` }] };
    for (const [i, n] of raw.entries()) {
      if (typeof n !== "string" || !n.trim() || n.length > 120 || textProblem(n)) return { state: "ERROR", errors: [{ path: `$.meta.suggested_subtopics[${i}]`, code: "VALUE", message: "Plain names, at most 120 characters." }] };
      if (!suggested.some((x) => x.toLowerCase() === n.trim().toLowerCase())) suggested.push(n.trim());
    }
  }
  const facts: string[] = [];
  for (const [i, f] of ordered.flatMap((p) => p.uncertainFacts).entries()) {
    if (typeof f !== "string" || !f.trim() || f.length > 300 || textProblem(f)) return { state: "ERROR", errors: [{ path: `$.uncertain_facts[${i}]`, code: "VALUE", message: "Plain text, at most 300 characters." }] };
    facts.push(f.trim());
  }
  if (facts.length > UNCERTAIN_FACTS_MAX) return { state: "ERROR", errors: [{ path: "$.uncertain_facts", code: "VALUE", message: `At most ${UNCERTAIN_FACTS_MAX} facts.` }] };
  const blocks = resolved;
  const v = validateLesson(metaIn, blocks);
  return {
    state: "COMPLETE",
    result: v.ok
      ? { ok: true, meta: v.meta, blocks: v.blocks, uncertainFacts: facts, suggestedSubtopics: suggested }
      : { ok: false, errors: v.errors.map((e) => ({ ...e, path: describeBlockPath(e.path, blocks) })) },
  };
}

/** A single pasted answer (one part, or a complete one-part lesson) → the lesson; an incomplete multi-part is an error here. */
export function parseLessonPaste(text: string, opts: LessonMergeOptions = {}): LessonPaste {
  const m = mergeLessonParts([parseLessonPart(text)], opts);
  if (m.state === "COMPLETE") return m.result;
  if (m.state === "ERROR") return { ok: false, errors: m.errors };
  return { ok: false, errors: [{ path: "$.part", code: "PARTS_MISSING", message: `Part ${m.missing.join(", ")} of ${m.totalParts} is missing.` }] };
}
