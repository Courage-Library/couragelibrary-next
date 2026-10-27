/**
 * CA-4: the LESSON prompt (paste-in / paste-out, no API key). The server builds the context of ONE master-tree node
 * (path, level, subject, every published exam syllabus that maps it with its weightage, child nodes, aliases, existing
 * lessons) and renders the ACTIVE LESSON template (prompt_templates; v1 = LESSON_TEMPLATE_V1). The owner pastes the
 * answer back: parseLessonPaste → validateLesson (the same rules the DB enforces) → the completeness checklist →
 * DRAFT → review → publish. Pure; safe in client components.
 */
import { textProblem, validateLesson, type BlockError, type LessonBlock, type LessonMeta } from "@/lib/lessons/blocks";
import { LESSON_MAX_EXAMPLES, LESSON_MIN_EXAMPLES, LESSON_MIN_QUICK_CHECKS } from "@/lib/lessons/completeness";

export const LESSON_PASTE_CONTRACT = "LESSON_BLOCKS v2";
export const UNCERTAIN_FACTS_MAX = 20;

export interface LessonExamCoverage {
  exam: string;
  cycleYear: number | null;
  tier: string | null;
  /** the syllabus path inside that exam, e.g. "Tier 1 › Quantitative Aptitude › Percentage" */
  syllabusPath: string;
  weightageTier: string | null;
  questionsMin: number | null;
  questionsMax: number | null;
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
- practice_link: { "node_id", "mode": "PRACTICE" | "PYQ" | "MOCK", "label"? }  (use only the node id given above)
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

export function lessonPromptValues(ctx: LessonPromptContext): Record<string, string> {
  return {
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
  | { ok: true; meta: LessonMeta; blocks: LessonBlock[]; uncertainFacts: string[] }
  | { ok: false; errors: BlockError[] };

/** Parses the pasted answer: one JSON object (a single surrounding code fence is tolerated), then the block rules. */
export function parseLessonPaste(text: string): LessonPaste {
  const err = (path: string, code: string, message: string): LessonPaste => ({ ok: false, errors: [{ path, code, message }] });
  let raw = (text || "").trim();
  const fence = /^```[a-z]*\n([\s\S]*)\n```$/i.exec(raw);
  if (fence) raw = fence[1].trim();
  if (!raw) return err("$", "EMPTY", "Paste the assistant's JSON answer.");
  if (raw.length > 300 * 1024) return err("$", "TOO_LARGE", "The answer is larger than 300 KB.");
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return err("$", "INVALID_JSON", "This is not valid JSON. Paste only the JSON object the assistant returned.");
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return err("$", "TYPE", "The answer must be one JSON object.");
  const o = data as Record<string, unknown>;
  for (const k of Object.keys(o)) if (!["contract", "meta", "blocks", "uncertain_facts"].includes(k)) return err(`$.${k}`, "UNKNOWN_KEY", `Unknown key "${k}".`);
  if (o.contract !== LESSON_PASTE_CONTRACT) return err("$.contract", "CONTRACT", `"contract" must be "${LESSON_PASTE_CONTRACT}".`);
  const facts: string[] = [];
  if (o.uncertain_facts !== undefined) {
    if (!Array.isArray(o.uncertain_facts) || o.uncertain_facts.length > UNCERTAIN_FACTS_MAX) return err("$.uncertain_facts", "VALUE", `A list of at most ${UNCERTAIN_FACTS_MAX} facts.`);
    for (const [i, f] of o.uncertain_facts.entries()) {
      if (typeof f !== "string" || !f.trim() || f.length > 300 || textProblem(f)) return err(`$.uncertain_facts[${i}]`, "VALUE", "Plain text, at most 300 characters.");
      facts.push(f.trim());
    }
  }
  const v = validateLesson(o.meta, o.blocks);
  return v.ok ? { ok: true, meta: v.meta, blocks: v.blocks, uncertainFacts: facts } : { ok: false, errors: v.errors };
}
