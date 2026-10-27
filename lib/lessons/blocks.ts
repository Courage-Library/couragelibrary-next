/**
 * CA-3: LessonBlocksSpec v2 — a lesson is an ordered array of typed blocks stored in the DB (document_versions.blocks)
 * plus a small meta object (document_versions.lesson_meta). Pure and dependency-free: used by the reader, the admin
 * editor, the v1 converter and the gates. The database enforces the SAME rules (fn_lesson_blocks_errors, migration 117);
 * the DB smoke compares both on shared vectors.
 *
 * Safety by construction: every text is plain text with a tiny inline subset (**bold**, *italic*, `code`, $math$,
 * [[node:<uuid>|label]]). No HTML, no markup links, no external URLs, no control characters. Formulas are LaTeX limited
 * to an allow-list of commands. Images are asset ids (never URLs); practice links are node ids (resolved at render).
 */

export const BLOCKS_SCHEMA_VERSION = "2.0.0";
export const MAX_BLOCKS = 300;
export const MAX_TEXT = 4000;
export const MAX_SHORT = 300;
export const MAX_LATEX = 500;
export const MAX_JSON_BYTES = 256 * 1024;

export const BLOCK_TYPES = [
  "heading",
  "paragraph",
  "list",
  "formula",
  "solved_example",
  "callout",
  "trap",
  "table",
  "image",
  "practice_link",
  "quick_check",
  "revision_summary",
  "memory_lock_points",
] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

export const CALLOUT_VARIANTS = ["TIP", "WARNING", "INFO", "MEMORY_HOOK"] as const;
export const DIFFICULTIES = ["EASY", "MEDIUM", "HARD"] as const;
export const PRACTICE_MODES = ["PRACTICE", "PYQ", "MOCK"] as const;
export const TRAP_KINDS = ["CALCULATION_SLIP", "MISREAD_KEYWORD", "FORMULA_CONFUSION", "DISTRACTOR_TRAP"] as const;

/** LaTeX commands a formula may use (anything else is refused: no \href, \url, \input, \def, \html…, \style…). */
export const LATEX_COMMANDS = [
  "frac", "dfrac", "tfrac", "sqrt", "times", "div", "cdot", "pm", "mp", "le", "leq", "ge", "geq", "ne", "neq", "approx", "equiv",
  "left", "right", "text", "mathrm", "mathbf", "overline", "underline", "hat", "bar", "vec", "sum", "prod", "int", "lim", "infty",
  "log", "ln", "sin", "cos", "tan", "cot", "sec", "csc", "circ", "degree", "angle", "triangle", "parallel", "perp", "therefore",
  "because", "rightarrow", "leftarrow", "Rightarrow", "Leftrightarrow", "to", "in", "notin", "subset", "cup", "cap", "ldots", "cdots",
  "quad", "qquad", "percent", "alpha", "beta", "gamma", "delta", "Delta", "theta", "lambda", "mu", "pi", "rho", "sigma", "Sigma",
  "phi", "omega", "Omega", "binom", "pmod", "mod", "max", "min", "lfloor", "rfloor", "lceil", "rceil", "{", "}", "%", "$", "&", ",", ";", "!",
] as const;
const LATEX_SET = new Set<string>(LATEX_COMMANDS);

export type RichText = string;
export interface HeadingBlock { id: string; type: "heading"; level: 2 | 3; text: string }
export interface ParagraphBlock { id: string; type: "paragraph"; text: RichText }
export interface ListBlock { id: string; type: "list"; ordered: boolean; items: RichText[] }
export interface FormulaBlock { id: string; type: "formula"; name?: string; latex: string; reading: string }
export interface SolvedExampleBlock {
  id: string;
  type: "solved_example";
  difficulty: (typeof DIFFICULTIES)[number];
  question: RichText;
  steps: { text: RichText; math?: string }[];
  answer?: RichText;
  shortcut?: RichText;
  mistake?: RichText;
}
export interface CalloutBlock { id: string; type: "callout"; variant: (typeof CALLOUT_VARIANTS)[number]; title?: string; text: RichText }
export interface TrapBlock { id: string; type: "trap"; kind?: (typeof TRAP_KINDS)[number]; text: RichText; why: RichText }
export interface TableBlock { id: string; type: "table"; caption?: string; headers: string[]; rows: string[][] }
export interface ImageBlock { id: string; type: "image"; asset_id: string; alt: string; caption?: string }
export interface PracticeLinkBlock { id: string; type: "practice_link"; node_id: string; mode: (typeof PRACTICE_MODES)[number]; label?: string }
export interface QuickCheckBlock { id: string; type: "quick_check"; prompt: RichText; options: { id: string; text: RichText; correct: boolean; feedback?: RichText }[] }
export interface RevisionSummaryBlock { id: string; type: "revision_summary"; bullets: RichText[]; formulas?: string[]; speed_rules?: RichText[] }
export interface MemoryLockPointsBlock { id: string; type: "memory_lock_points"; points: string[] }

export type LessonBlock =
  | HeadingBlock
  | ParagraphBlock
  | ListBlock
  | FormulaBlock
  | SolvedExampleBlock
  | CalloutBlock
  | TrapBlock
  | TableBlock
  | ImageBlock
  | PracticeLinkBlock
  | QuickCheckBlock
  | RevisionSummaryBlock
  | MemoryLockPointsBlock;

export interface LessonMeta {
  title: string;
  summary?: string;
  estimated_minutes?: number;
  seo?: { meta_title?: string; meta_description?: string; focus_keywords?: string[] };
}

/** Server-resolved targets for a lesson's node links / practice links and images (see lesson-blocks-renderer). */
export interface LessonLinkMap {
  /** node id → where a node link / practice link goes (resolved on the server; absent = render as text) */
  nodes: Record<string, { topicHref: string; practiceHref: string }>;
  /** asset id → short-lived signed URL (absent = the image is shown as its alt text) */
  images: Record<string, string>;
}

/** How a renderer draws math (students: server KaTeX; the admin preview: a plain-text stand-in). */
export interface LessonMathProps {
  latex: string;
  /** the author's plain-text reading (block formulas; required there) */
  reading?: string;
  display: boolean;
}

export interface BlockError {
  path: string;
  code: string;
  message: string;
}

const ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ASSET_RE = /^[a-z0-9][a-z0-9_.-]*(\/[a-z0-9][a-z0-9_.-]*){0,4}$/;

/**
 * The text safety rule shared with SQL (fn_lesson__text_problem): no HTML tag start ("<" + letter, "/", "!" or "?";
 * a lone "<" / ">" as in "x < 5" is fine — text is always rendered as escaped text), no markup link "](", no
 * http(s):// or javascript: / data: schemes, no control characters except newline / tab. Returns a code or null.
 */
export function textProblem(s: string): string | null {
  if (/<[a-zA-Z!/?]/.test(s)) return "HTML";
  if (s.includes("](")) return "MARKUP_LINK";
  if (/(https?:\/\/|javascript:|data:|vbscript:)/i.test(s)) return "URL";
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/.test(s)) return "CONTROL_CHAR";
  return null;
}

/** LaTeX allow-list rule shared with SQL: every \command must be listed; no angle brackets / URLs. */
export function latexProblem(s: string): string | null {
  const t = textProblem(s);
  if (t) return t;
  for (const m of s.matchAll(/\\([a-zA-Z]+|.)/g)) if (!LATEX_SET.has(m[1])) return `LATEX_COMMAND:${m[1]}`;
  return null;
}

// ---------------------------------------------------------------- rich text (parsed to an AST; never HTML)
export type RichNode =
  | { t: "text"; v: string }
  | { t: "bold"; c: RichNode[] }
  | { t: "italic"; c: RichNode[] }
  | { t: "code"; v: string }
  | { t: "math"; v: string }
  | { t: "node_link"; node_id: string; label: string };

/** Parses the inline subset; unmatched markers stay literal text. Pure; the renderer maps nodes to React elements. */
export function parseRichText(s: string): RichNode[] {
  const out: RichNode[] = [];
  let buf = "";
  const flush = () => {
    if (buf) out.push({ t: "text", v: buf });
    buf = "";
  };
  let i = 0;
  while (i < s.length) {
    const rest = s.slice(i);
    let m: RegExpMatchArray | null;
    if ((m = rest.match(/^\[\[node:([0-9a-f-]{36})\|([^\]\n]{1,120})\]\]/i)) && UUID_RE.test(m[1])) {
      flush();
      out.push({ t: "node_link", node_id: m[1].toLowerCase(), label: m[2] });
      i += m[0].length;
    } else if ((m = rest.match(/^\*\*([^*\n]+)\*\*/))) {
      flush();
      out.push({ t: "bold", c: parseRichText(m[1]) });
      i += m[0].length;
    } else if ((m = rest.match(/^\*([^*\n]+)\*/))) {
      flush();
      out.push({ t: "italic", c: parseRichText(m[1]) });
      i += m[0].length;
    } else if ((m = rest.match(/^`([^`\n]+)`/))) {
      flush();
      out.push({ t: "code", v: m[1] });
      i += m[0].length;
    } else if ((m = rest.match(/^\$([^$\n]+)\$/)) && !latexProblem(m[1])) {
      flush();
      out.push({ t: "math", v: m[1] });
      i += m[0].length;
    } else {
      buf += s[i];
      i += 1;
    }
  }
  flush();
  return out;
}

/** Plain text of a rich string (for search, coverage and the screen-reader-friendly formula fallback). */
export function richToPlain(s: string): string {
  const walk = (ns: RichNode[]): string => ns.map((n) => (n.t === "text" || n.t === "code" || n.t === "math" ? n.v : n.t === "node_link" ? n.label : walk(n.c))).join("");
  return walk(parseRichText(s));
}

// ---------------------------------------------------------------- validation
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

class Errs {
  readonly list: BlockError[] = [];
  add(path: string, code: string, message: string) {
    if (this.list.length < 100) this.list.push({ path, code, message });
  }
}

function keys(e: Errs, o: Obj, allowed: readonly string[], p: string) {
  for (const k of Object.keys(o)) if (!allowed.includes(k)) e.add(`${p}.${k}`, "UNKNOWN_KEY", `Unknown key "${k}".`);
}
/** One text value at `path` (the SQL twin is fn_lesson__str). */
function strVal(e: Errs, v: unknown, path: string, max: number, required: boolean, latex = false): string | null {
  if (v === undefined || v === null) {
    if (required) e.add(path, "REQUIRED", "Required.");
    return null;
  }
  if (typeof v !== "string") {
    e.add(path, "TYPE", "Must be text.");
    return null;
  }
  if (!v.trim()) {
    if (required) e.add(path, "REQUIRED", "Required.");
    return null;
  }
  if (v.length > max) e.add(path, "TOO_LONG", `At most ${max} characters.`);
  const problem = latex ? latexProblem(v) : textProblem(v);
  if (problem) e.add(path, problem.startsWith("LATEX") ? "LATEX" : "UNSAFE_TEXT", `Not allowed here (${problem}).`);
  return v;
}
function str(e: Errs, o: Obj, k: string, p: string, max: number, required: boolean, latex = false): string | null {
  return strVal(e, o[k], `${p}.${k}`, max, required, latex);
}
function strList(e: Errs, o: Obj, k: string, p: string, min: number, max: number, itemMax: number, required: boolean): string[] {
  const v = o[k];
  if (v === undefined || v === null) {
    if (required) e.add(`${p}.${k}`, "REQUIRED", "Required.");
    return [];
  }
  if (!Array.isArray(v)) {
    e.add(`${p}.${k}`, "TYPE", "Must be a list.");
    return [];
  }
  if (v.length < min || v.length > max) e.add(`${p}.${k}`, "COUNT", `Needs ${min}–${max} entries.`);
  v.forEach((item, i) => strVal(e, item, `${p}.${k}.${i}`, itemMax, true));
  return v.filter((x): x is string => typeof x === "string");
}
function oneOf(e: Errs, o: Obj, k: string, p: string, allowed: readonly string[], required: boolean) {
  const v = o[k];
  if (v === undefined || v === null) {
    if (required) e.add(`${p}.${k}`, "REQUIRED", "Required.");
    return;
  }
  if (!allowed.includes(v as string)) e.add(`${p}.${k}`, "VALUE", `Must be one of ${allowed.join(", ")}.`);
}

const BLOCK_KEYS: Record<BlockType, readonly string[]> = {
  heading: ["id", "type", "level", "text"],
  paragraph: ["id", "type", "text"],
  list: ["id", "type", "ordered", "items"],
  formula: ["id", "type", "name", "latex", "reading"],
  solved_example: ["id", "type", "difficulty", "question", "steps", "answer", "shortcut", "mistake"],
  callout: ["id", "type", "variant", "title", "text"],
  trap: ["id", "type", "kind", "text", "why"],
  table: ["id", "type", "caption", "headers", "rows"],
  image: ["id", "type", "asset_id", "alt", "caption"],
  practice_link: ["id", "type", "node_id", "mode", "label"],
  quick_check: ["id", "type", "prompt", "options"],
  revision_summary: ["id", "type", "bullets", "formulas", "speed_rules"],
  memory_lock_points: ["id", "type", "points"],
};

function block(e: Errs, b: unknown, p: string) {
  if (!isObj(b)) {
    e.add(p, "TYPE", "A block must be an object.");
    return;
  }
  const type = b.type as BlockType;
  if (!BLOCK_TYPES.includes(type)) {
    e.add(`${p}.type`, "VALUE", `Unknown block type "${String(b.type)}".`);
    return;
  }
  keys(e, b, BLOCK_KEYS[type], p);
  switch (type) {
    case "heading":
      if (b.level !== 2 && b.level !== 3) e.add(`${p}.level`, "VALUE", "Level must be 2 or 3.");
      str(e, b, "text", p, MAX_SHORT, true);
      break;
    case "paragraph":
      str(e, b, "text", p, MAX_TEXT, true);
      break;
    case "list":
      if (typeof b.ordered !== "boolean") e.add(`${p}.ordered`, "TYPE", "Must be true or false.");
      strList(e, b, "items", p, 1, 30, MAX_TEXT, true);
      break;
    case "formula":
      str(e, b, "name", p, 120, false);
      str(e, b, "latex", p, MAX_LATEX, true, true);
      str(e, b, "reading", p, MAX_SHORT * 2, true);
      break;
    case "solved_example": {
      oneOf(e, b, "difficulty", p, DIFFICULTIES, true);
      str(e, b, "question", p, MAX_TEXT, true);
      for (const k of ["answer", "shortcut", "mistake"]) str(e, b, k, p, MAX_TEXT, false);
      const steps = b.steps;
      if (!Array.isArray(steps) || steps.length < 1 || steps.length > 20) e.add(`${p}.steps`, "COUNT", "Needs 1–20 steps.");
      else
        steps.forEach((s, i) => {
          const sp = `${p}.steps[${i}]`;
          if (!isObj(s)) return e.add(sp, "TYPE", "A step must be an object.");
          keys(e, s, ["text", "math"], sp);
          str(e, s, "text", sp, MAX_TEXT, true);
          str(e, s, "math", sp, MAX_LATEX, false, true);
        });
      break;
    }
    case "callout":
      oneOf(e, b, "variant", p, CALLOUT_VARIANTS, true);
      str(e, b, "title", p, 120, false);
      str(e, b, "text", p, MAX_TEXT, true);
      break;
    case "trap":
      oneOf(e, b, "kind", p, TRAP_KINDS, false);
      str(e, b, "text", p, MAX_TEXT, true);
      str(e, b, "why", p, MAX_TEXT, true);
      break;
    case "table": {
      str(e, b, "caption", p, MAX_SHORT, false);
      const headers = strList(e, b, "headers", p, 1, 8, 120, true);
      const rows = b.rows;
      if (!Array.isArray(rows) || rows.length < 1 || rows.length > 50) e.add(`${p}.rows`, "COUNT", "Needs 1–50 rows.");
      else
        rows.forEach((r, i) => {
          if (!Array.isArray(r) || r.length !== headers.length) return e.add(`${p}.rows[${i}]`, "SHAPE", "Each row has one cell per header.");
          r.forEach((cell, j) => strVal(e, cell, `${p}.rows[${i}].${j}`, MAX_SHORT, false));
        });
      break;
    }
    case "image": {
      const id = str(e, b, "asset_id", p, 200, true);
      if (id && (!ASSET_RE.test(id) || id.includes(".."))) e.add(`${p}.asset_id`, "VALUE", "An asset id from the lesson-images bucket (no URLs).");
      str(e, b, "alt", p, MAX_SHORT, true);
      str(e, b, "caption", p, MAX_SHORT, false);
      break;
    }
    case "practice_link":
      if (typeof b.node_id !== "string" || !UUID_RE.test(b.node_id)) e.add(`${p}.node_id`, "VALUE", "A master-tree node id.");
      oneOf(e, b, "mode", p, PRACTICE_MODES, true);
      str(e, b, "label", p, 120, false);
      break;
    case "quick_check": {
      str(e, b, "prompt", p, MAX_TEXT, true);
      const opts = b.options;
      if (!Array.isArray(opts) || opts.length < 2 || opts.length > 6) e.add(`${p}.options`, "COUNT", "Needs 2–6 options.");
      else {
        const ids = new Set<string>();
        opts.forEach((o, i) => {
          const op = `${p}.options[${i}]`;
          if (!isObj(o)) return e.add(op, "TYPE", "An option must be an object.");
          keys(e, o, ["id", "text", "correct", "feedback"], op);
          if (typeof o.id !== "string" || !ID_RE.test(o.id) || ids.has(o.id)) e.add(`${op}.id`, "VALUE", "A unique id (a-z, 0-9, -).");
          else ids.add(o.id);
          str(e, o, "text", op, MAX_SHORT * 2, true);
          if (typeof o.correct !== "boolean") e.add(`${op}.correct`, "TYPE", "Must be true or false.");
          str(e, o, "feedback", op, MAX_TEXT, false);
        });
        if (!opts.some((o) => isObj(o) && o.correct === true)) e.add(`${p}.options`, "NO_CORRECT", "At least one option is correct.");
      }
      break;
    }
    case "revision_summary":
      strList(e, b, "bullets", p, 1, 20, MAX_TEXT, true);
      if (b.formulas !== undefined) {
        const f = strList(e, b, "formulas", p, 0, 20, MAX_LATEX, false);
        f.forEach((x, i) => {
          const pr = latexProblem(x);
          if (pr) e.add(`${p}.formulas[${i}]`, "LATEX", `Not allowed here (${pr}).`);
        });
      }
      if (b.speed_rules !== undefined) strList(e, b, "speed_rules", p, 0, 20, MAX_TEXT, false);
      break;
    case "memory_lock_points":
      strList(e, b, "points", p, 3, 10, MAX_SHORT, true);
      break;
  }
}

export type BlocksValidation = { ok: true; blocks: LessonBlock[]; meta: LessonMeta } | { ok: false; errors: BlockError[] };

/** Validates { meta, blocks } (or the two separately). Same rules as fn_lesson_blocks_errors / fn_lesson_meta_errors. */
export function validateLesson(meta: unknown, blocks: unknown): BlocksValidation {
  const e = new Errs();
  if (!isObj(meta)) e.add("$.meta", "TYPE", "The lesson meta must be an object.");
  else {
    keys(e, meta, ["title", "summary", "estimated_minutes", "seo"], "$.meta");
    str(e, meta, "title", "$.meta", 200, true);
    str(e, meta, "summary", "$.meta", 500, false);
    if (meta.estimated_minutes !== undefined && (typeof meta.estimated_minutes !== "number" || !Number.isInteger(meta.estimated_minutes) || meta.estimated_minutes < 1 || meta.estimated_minutes > 240))
      e.add("$.meta.estimated_minutes", "VALUE", "Whole minutes, 1–240.");
    if (meta.seo !== undefined) {
      if (!isObj(meta.seo)) e.add("$.meta.seo", "TYPE", "Must be an object.");
      else {
        keys(e, meta.seo, ["meta_title", "meta_description", "focus_keywords"], "$.meta.seo");
        str(e, meta.seo, "meta_title", "$.meta.seo", 120, false);
        str(e, meta.seo, "meta_description", "$.meta.seo", 300, false);
        if (meta.seo.focus_keywords !== undefined) strList(e, meta.seo, "focus_keywords", "$.meta.seo", 0, 10, 60, false);
      }
    }
  }
  if (!Array.isArray(blocks)) e.add("$.blocks", "TYPE", "The blocks must be a list.");
  else {
    if (blocks.length < 1 || blocks.length > MAX_BLOCKS) e.add("$.blocks", "COUNT", `Needs 1–${MAX_BLOCKS} blocks.`);
    const ids = new Set<string>();
    blocks.forEach((b, i) => {
      const p = `$.blocks[${i}]`;
      if (isObj(b)) {
        if (typeof b.id !== "string" || !ID_RE.test(b.id)) e.add(`${p}.id`, "VALUE", "A block id: a-z, 0-9, -, at most 40.");
        else if (ids.has(b.id)) e.add(`${p}.id`, "DUPLICATE_ID", `Block id "${b.id}" is used twice.`);
        else ids.add(b.id);
      }
      block(e, b, p);
    });
  }
  if (JSON.stringify(blocks ?? null).length > MAX_JSON_BYTES) e.add("$.blocks", "TOO_LARGE", "The lesson is larger than 256 KB.");
  return e.list.length ? { ok: false, errors: e.list } : { ok: true, blocks: blocks as LessonBlock[], meta: meta as LessonMeta };
}

/** The validation vectors shared by the offline gate and the DB smoke (SQL must give the same verdict). */
export const VALIDATION_VECTORS: readonly { name: string; meta: unknown; blocks: unknown; ok: boolean }[] = [
  { name: "minimal", meta: { title: "T" }, blocks: [{ id: "a", type: "paragraph", text: "Hello **world** and $x^2$." }], ok: true },
  { name: "html", meta: { title: "T" }, blocks: [{ id: "a", type: "paragraph", text: "<script>x</script>" }], ok: false },
  { name: "url", meta: { title: "T" }, blocks: [{ id: "a", type: "paragraph", text: "see https://evil.test" }], ok: false },
  { name: "math-comparisons", meta: { title: "T" }, blocks: [{ id: "a", type: "paragraph", text: "If x < 5 and y > 3 then x - y < 2." }], ok: true },
  { name: "closing-tag", meta: { title: "T" }, blocks: [{ id: "a", type: "paragraph", text: "a </p> b" }], ok: false },
  { name: "markup-link", meta: { title: "T" }, blocks: [{ id: "a", type: "paragraph", text: "[x](y)" }], ok: false },
  { name: "unknown-type", meta: { title: "T" }, blocks: [{ id: "a", type: "iframe", src: "x" }], ok: false },
  { name: "unknown-key", meta: { title: "T" }, blocks: [{ id: "a", type: "paragraph", text: "x", html: "y" }], ok: false },
  { name: "dup-id", meta: { title: "T" }, blocks: [{ id: "a", type: "paragraph", text: "x" }, { id: "a", type: "paragraph", text: "y" }], ok: false },
  { name: "latex-ok", meta: { title: "T" }, blocks: [{ id: "f", type: "formula", latex: "\\frac{a}{b} \\times 100\\%", reading: "a over b times 100 percent" }], ok: true },
  { name: "latex-href", meta: { title: "T" }, blocks: [{ id: "f", type: "formula", latex: "\\href{x}{y}", reading: "r" }], ok: false },
  { name: "formula-no-reading", meta: { title: "T" }, blocks: [{ id: "f", type: "formula", latex: "a+b" }], ok: false },
  { name: "image-url", meta: { title: "T" }, blocks: [{ id: "i", type: "image", asset_id: "https://x/y.png", alt: "a" }], ok: false },
  { name: "image-no-alt", meta: { title: "T" }, blocks: [{ id: "i", type: "image", asset_id: "lessons/a.png" }], ok: false },
  { name: "image-ok", meta: { title: "T" }, blocks: [{ id: "i", type: "image", asset_id: "lessons/a.png", alt: "A triangle" }], ok: true },
  { name: "quick-check-no-correct", meta: { title: "T" }, blocks: [{ id: "q", type: "quick_check", prompt: "p", options: [{ id: "a", text: "x", correct: false }, { id: "b", text: "y", correct: false }] }], ok: false },
  { name: "memory-lock-2", meta: { title: "T" }, blocks: [{ id: "m", type: "memory_lock_points", points: ["a", "b"] }], ok: false },
  { name: "table-shape", meta: { title: "T" }, blocks: [{ id: "t", type: "table", headers: ["a", "b"], rows: [["1"]] }], ok: false },
  { name: "heading-level-1", meta: { title: "T" }, blocks: [{ id: "h", type: "heading", level: 1, text: "x" }], ok: false },
  { name: "no-title", meta: {}, blocks: [{ id: "a", type: "paragraph", text: "x" }], ok: false },
  { name: "control-char", meta: { title: "T" }, blocks: [{ id: "a", type: "paragraph", text: "a\u0007b" }], ok: false },
  { name: "empty", meta: { title: "T" }, blocks: [], ok: false },
];
