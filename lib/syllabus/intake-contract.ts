/**
 * CA-2: the SYLLABUS_INTAKE contract (what the owner pastes back from the AI) — pure, dependency-free, safe in client
 * components. Names, not paths: the server matches every name to the master tree (lib/syllabus/tree-matcher.ts) and the
 * database re-checks every structural claim (fn_syllabus_intake_create).
 *
 * v3 (SYLLABUS-PROMPT-2, current; strict JSON, unknown keys are errors):
 *   { contract_version: 3, exam: "<exam slug>", cycle_year: 2026 | null, tier: "tier-1" | null,
 *     based_on: "<which notification / PYQ years>", source_url?: "https://…", as_of?: "YYYY-MM-DD",
 *     papers: [{ name, name_hi?, marks?, questions?, duration_minutes?, negative_marking?, uncertain?, uncertain_reason?,
 *       subjects: [{ name, name_hi?, aliases?, marks?, questions?, weightage_tier?, uncertain?, uncertain_reason?,
 *         topics: [{ …same…, origin, avg_questions?, subtopics: [{ …same…, origin, avg_questions?,
 *           concepts: [{ …same…, origin, avg_questions?, headings? }] }] }] }] }] }
 *   origin (topics, subtopics, concepts; required): OFFICIAL | PYQ_TREND | EXPANDED.
 * v3.1 (SYLLABUS-CONTRACT-3.1, additive — contract_version stays 3; every valid v3 payload stays valid):
 *   subjects may carry sectional duration_minutes (whole number > 0) and negative_marking (a number ≥ 0 or the same short
 *   text as a paper) — stored in the session's raw payload only (the item columns stay paper-only); aliases are
 *   de-duplicated (case-insensitive); an unknown key names its path and the keys allowed there; NON-BLOCKING warnings
 *   when the subjects' timings / marks do not add up to the paper's. AI aliases are suggestions: they reach the master
 *   tree only through the owner's own action on the review screen.
 * v3.2 (INTAKE-CONCEPTS-AS-OUTLINE, additive — contract_version stays 3): a subtopic may carry "outline": [names] (≤ 30)
 *   INSTEAD of "concepts" (not both). Each outline line becomes an EXPANDED concept item, so v3 / v3.1 payloads and v3.2
 *   ones share one review flow; the owner keeps such concepts as the subtopic's lesson outline (no master-tree node).
 *   NON-BLOCKING warning when a subject's topics' avg_questions add up to more than 20 % away from its questions.
 * v2 (CA-2, still accepted for old pastes): no based_on / origin / avg_questions / duration / negative marking, and
 *   source_url + as_of are required.
 * Levels deeper than a concept go into "headings" (they become sections inside the L4 lesson, design L.1).
 */
import { isPlainText, WEIGHTAGE_TIERS, type WeightageTier } from "@/lib/syllabus/import-contract";

export const INTAKE_CONTRACT_VERSION = 3;
/** v2 stays accepted for pastes made with the CA-2 prompt. */
export const INTAKE_CONTRACT_VERSIONS = [2, 3] as const;
export type IntakeContractVersion = (typeof INTAKE_CONTRACT_VERSIONS)[number];
export const INTAKE_ORIGINS = ["OFFICIAL", "PYQ_TREND", "EXPANDED"] as const;
export type IntakeOrigin = (typeof INTAKE_ORIGINS)[number];
export const INTAKE_BASED_ON_MAX = 500;
export const INTAKE_NEGATIVE_MARKING_MAX = 200;
export const INTAKE_MAX_BYTES = 256 * 1024;
export const INTAKE_MAX_ITEMS = 1000;
export const INTAKE_MAX_ERRORS = 100;
export const INTAKE_NAME_MAX = 200;
export const INTAKE_ALIAS_MAX = 160;
export const INTAKE_ALIASES_MAX = 10;
export const INTAKE_HEADINGS_MAX = 50;
export const INTAKE_REASON_MAX = 500;
/** v3.2: lines of a subtopic's lesson outline */
export const INTAKE_OUTLINE_MAX = 30;
/** v3.2: a subject's Σ topic avg_questions may differ from its questions by at most this share before a warning */
export const WEIGHTAGE_TOLERANCE = 0.2;

export const INTAKE_LEVELS = ["PAPER", "SUBJECT", "TOPIC", "SUBTOPIC", "CONCEPT"] as const;
export type IntakeLevel = (typeof INTAKE_LEVELS)[number];

/** The list key holding each level's children. */
const CHILD_LIST: Record<IntakeLevel, string | null> = { PAPER: "subjects", SUBJECT: "topics", TOPIC: "subtopics", SUBTOPIC: "concepts", CONCEPT: null };
const CHILD_LEVEL: Record<IntakeLevel, IntakeLevel | null> = { PAPER: "SUBJECT", SUBJECT: "TOPIC", TOPIC: "SUBTOPIC", SUBTOPIC: "CONCEPT", CONCEPT: null };
const KEY_PREFIX: Record<IntakeLevel, string> = { PAPER: "p", SUBJECT: "s", TOPIC: "t", SUBTOPIC: "u", CONCEPT: "c" };
const ITEM_KEYS_V2: Record<IntakeLevel, readonly string[]> = {
  PAPER: ["name", "marks", "questions", "uncertain", "uncertain_reason", "subjects"],
  SUBJECT: ["name", "name_hi", "aliases", "marks", "questions", "weightage_tier", "uncertain", "uncertain_reason", "topics"],
  TOPIC: ["name", "name_hi", "aliases", "marks", "questions", "weightage_tier", "uncertain", "uncertain_reason", "subtopics"],
  SUBTOPIC: ["name", "name_hi", "aliases", "marks", "questions", "weightage_tier", "uncertain", "uncertain_reason", "concepts"],
  CONCEPT: ["name", "name_hi", "aliases", "marks", "questions", "weightage_tier", "uncertain", "uncertain_reason", "headings"],
};
const V3_EXTRA: Record<IntakeLevel, readonly string[]> = {
  PAPER: ["name_hi", "duration_minutes", "negative_marking"],
  SUBJECT: ["duration_minutes", "negative_marking"], // v3.1: sectionally-timed / -marked papers only
  TOPIC: ["origin", "avg_questions"],
  SUBTOPIC: ["origin", "avg_questions", "outline"], // v3.2: outline (instead of concepts)
  CONCEPT: ["origin", "avg_questions"],
};
const itemKeys = (version: IntakeContractVersion, level: IntakeLevel): readonly string[] =>
  version === 2 ? ITEM_KEYS_V2[level] : [...ITEM_KEYS_V2[level], ...V3_EXTRA[level]];
const ROOT_KEYS: Record<IntakeContractVersion, readonly string[]> = {
  2: ["contract_version", "exam", "cycle_year", "tier", "source_url", "as_of", "papers"],
  3: ["contract_version", "exam", "cycle_year", "tier", "based_on", "source_url", "as_of", "papers"],
};
/** Levels that carry an origin in v3. */
const HAS_ORIGIN: readonly IntakeLevel[] = ["TOPIC", "SUBTOPIC", "CONCEPT"];

export type IntakeErrorCode =
  | "INVALID_JSON"
  | "PAYLOAD_TOO_LARGE"
  | "INVALID_TYPE"
  | "UNKNOWN_KEY"
  | "REQUIRED"
  | "INVALID_VALUE"
  | "NOT_PLAIN_TEXT"
  | "UNSUPPORTED_CONTRACT_VERSION"
  | "CONTEXT_MISMATCH"
  | "DUPLICATE_NAME"
  | "TOO_MANY_ITEMS"
  | "TOO_MANY_ERRORS";

export interface IntakeError {
  code: IntakeErrorCode;
  path: string;
  message: string;
}

/** One item in pre-order (parents before children): what fn_syllabus_intake_create stores (before matching). */
export interface IntakeItemDraft {
  key: string;
  parent_key: string | null;
  level: IntakeLevel;
  position: number;
  name: string;
  name_hi: string | null;
  aliases: string[];
  marks: number | null;
  questions: number | null;
  weightage_tier: WeightageTier | null;
  uncertain: boolean;
  uncertain_reason: string | null;
  extra_headings: string[];
  /** v3: TOPIC / SUBTOPIC / CONCEPT (required there); null for v2 and for papers / subjects */
  origin: IntakeOrigin | null;
  /** v3: estimated questions per paper (topics / subtopics / concepts) */
  avg_questions: number | null;
  /** v3: papers only (the item columns are paper-only) */
  duration_minutes: number | null;
  negative_marking: string | null;
  /** v3.1: a subject's own (sectional) timing / marking — kept in the session's raw payload, shown on the review screen */
  sectional: { duration_minutes: number | null; negative_marking: string | null } | null;
}

/** v3.1: a consistency note that never blocks the intake. */
export interface IntakeWarning {
  path: string;
  message: string;
}

export interface IntakeHeader {
  contract_version: IntakeContractVersion;
  exam: string;
  cycle_year: number | null;
  tier: string | null;
  /** v3: required; null for v2 */
  based_on: string | null;
  /** v2: required; v3: optional */
  source_url: string | null;
  as_of: string | null;
}

export interface IntakeStats {
  papers: number;
  subjects: number;
  topics: number;
  subtopics: number;
  concepts: number;
  uncertain: number;
  /** v3: items per origin (topics + subtopics + concepts) */
  official: number;
  pyq_trend: number;
  expanded: number;
}

export type IntakeValidation =
  | { ok: true; header: IntakeHeader; items: IntakeItemDraft[]; stats: IntakeStats; payload: Record<string, unknown>; warnings: IntakeWarning[] }
  | { ok: false; errors: IntakeError[] };

export const TIER_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SOURCE_URL_RE = /^https:\/\/[^\s<>"]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The context the owner chose in the wizard; the payload must agree with it. */
export interface IntakeContext {
  examSlug: string;
  cycleYear: number | null;
  tier: string | null;
}

class Errors {
  readonly list: IntakeError[] = [];
  private capped = false;
  add(code: IntakeErrorCode, path: string, message: string) {
    if (this.capped) return;
    if (this.list.length >= INTAKE_MAX_ERRORS - 1) {
      this.list.push({ code: "TOO_MANY_ERRORS", path: "$", message: `More than ${INTAKE_MAX_ERRORS - 1} errors; fix these and check again.` });
      this.capped = true;
      return;
    }
    this.list.push({ code, path, message });
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function plain(e: Errors, value: unknown, path: string, max: number, required: boolean): string | null {
  if (value === undefined || value === null) {
    if (required) e.add("REQUIRED", path, "Required.");
    return null;
  }
  if (typeof value !== "string") {
    e.add("INVALID_TYPE", path, "Must be text.");
    return null;
  }
  const t = value.trim();
  if (!t) {
    if (required) e.add("REQUIRED", path, "Required.");
    return null;
  }
  if (t.length > max) e.add("INVALID_VALUE", path, `At most ${max} characters.`);
  if (!isPlainText(t)) e.add("NOT_PLAIN_TEXT", path, "Plain text only (no markup, links or control characters).");
  return t;
}

function count(e: Errors, value: unknown, path: string, max: number, integer: boolean): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > max || (integer && !Number.isInteger(value))) {
    e.add("INVALID_VALUE", path, `Must be ${integer ? "a whole number" : "a number"} from 0 to ${max}, or null.`);
    return null;
  }
  return value;
}

function textList(e: Errors, value: unknown, path: string, maxItems: number, maxLen: number): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    e.add("INVALID_TYPE", path, "Must be a list of text.");
    return [];
  }
  if (value.length > maxItems) e.add("INVALID_VALUE", path, `At most ${maxItems} entries.`);
  const out: string[] = [];
  const seen = new Set<string>();
  value.slice(0, maxItems).forEach((v, i) => {
    const t = plain(e, v, `${path}[${i}]`, maxLen, true);
    if (t && !seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase());
      out.push(t);
    }
  });
  return out;
}

/** v3.1: a subject's negative marking — a number ≥ 0, or the same short text a paper takes. */
function marking(e: Errors, value: unknown, path: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      e.add("INVALID_VALUE", path, "Must be a number from 0 to 100 (marks deducted per wrong answer), or short text.");
      return null;
    }
    return String(value);
  }
  return plain(e, value, path, INTAKE_NEGATIVE_MARKING_MAX, false);
}

/** Validates the pasted text (or an already parsed value) against v3 (or v2) and the wizard's context. */
export function validateIntakePayload(input: unknown, ctx?: IntakeContext): IntakeValidation {
  const e = new Errors();
  let data: unknown = input;
  if (typeof input === "string") {
    if (new TextEncoder().encode(input).length > INTAKE_MAX_BYTES) return { ok: false, errors: [{ code: "PAYLOAD_TOO_LARGE", path: "$", message: "The pasted text is larger than 256 KB." }] };
    try {
      data = JSON.parse(input);
    } catch {
      return { ok: false, errors: [{ code: "INVALID_JSON", path: "$", message: "This is not valid JSON. Paste only the JSON object the assistant returned." }] };
    }
  }
  if (!isObj(data)) return { ok: false, errors: [{ code: "INVALID_TYPE", path: "$", message: "The payload must be one JSON object." }] };
  if (JSON.stringify(data).length > INTAKE_MAX_BYTES) return { ok: false, errors: [{ code: "PAYLOAD_TOO_LARGE", path: "$", message: "The payload is larger than 256 KB." }] };

  if (!(INTAKE_CONTRACT_VERSIONS as readonly unknown[]).includes(data.contract_version)) {
    return { ok: false, errors: [{ code: "UNSUPPORTED_CONTRACT_VERSION", path: "$.contract_version", message: `"contract_version" must be ${INTAKE_CONTRACT_VERSION} (or 2 for an older paste).` }] };
  }
  const version = data.contract_version as IntakeContractVersion;
  for (const k of Object.keys(data)) if (!ROOT_KEYS[version].includes(k)) e.add("UNKNOWN_KEY", `$.${k}`, `Unknown key "${k}" at $. Allowed here: ${ROOT_KEYS[version].join(", ")}.`);
  const exam = plain(e, data.exam, "$.exam", 120, true);
  let cycleYear: number | null = null;
  if (data.cycle_year !== undefined && data.cycle_year !== null) {
    if (typeof data.cycle_year !== "number" || !Number.isInteger(data.cycle_year) || data.cycle_year < 2000 || data.cycle_year > 2100) e.add("INVALID_VALUE", "$.cycle_year", '"cycle_year" must be a year (2000-2100) or null.');
    else cycleYear = data.cycle_year;
  }
  let tier: string | null = null;
  if (data.tier !== undefined && data.tier !== null) {
    if (typeof data.tier !== "string" || !TIER_RE.test(data.tier) || data.tier.length > 40) e.add("INVALID_VALUE", "$.tier", '"tier" must be lower-case letters, digits and "-" (e.g. "tier-1"), or null.');
    else tier = data.tier;
  }
  const basedOn = version === 3 ? plain(e, data.based_on, "$.based_on", INTAKE_BASED_ON_MAX, true) : null;
  const sourceUrl = plain(e, data.source_url, "$.source_url", 500, version === 2);
  if (sourceUrl && !SOURCE_URL_RE.test(sourceUrl)) e.add("INVALID_VALUE", "$.source_url", '"source_url" must be the official https:// link.');
  const asOf = plain(e, data.as_of, "$.as_of", 10, version === 2);
  if (asOf && (!DATE_RE.test(asOf) || Number.isNaN(Date.parse(`${asOf}T00:00:00Z`)))) e.add("INVALID_VALUE", "$.as_of", '"as_of" must be a date (YYYY-MM-DD).');

  if (ctx) {
    if (exam && exam !== ctx.examSlug) e.add("CONTEXT_MISMATCH", "$.exam", `The payload is for "${exam}", but the selected exam is "${ctx.examSlug}".`);
    if (cycleYear !== ctx.cycleYear) e.add("CONTEXT_MISMATCH", "$.cycle_year", `The payload's cycle (${cycleYear ?? "none"}) differs from the selected cycle (${ctx.cycleYear ?? "none"}).`);
    if (tier !== ctx.tier) e.add("CONTEXT_MISMATCH", "$.tier", `The payload's tier (${tier ?? "none"}) differs from the selected tier (${ctx.tier ?? "none"}).`);
  }

  const items: IntakeItemDraft[] = [];
  const stats: IntakeStats = { papers: 0, subjects: 0, topics: 0, subtopics: 0, concepts: 0, uncertain: 0, official: 0, pyq_trend: 0, expanded: 0 };
  const statKey: Record<IntakeLevel, keyof IntakeStats> = { PAPER: "papers", SUBJECT: "subjects", TOPIC: "topics", SUBTOPIC: "subtopics", CONCEPT: "concepts" };

  const walk = (list: unknown, level: IntakeLevel, path: string, parentKey: string | null) => {
    if (!Array.isArray(list)) {
      e.add(list === undefined || list === null ? "REQUIRED" : "INVALID_TYPE", path, "Must be a list.");
      return;
    }
    if (level !== "PAPER" && list.length === 0) return;
    const seen = new Set<string>();
    list.forEach((raw, i) => {
      const p = `${path}[${i}]`;
      if (items.length >= INTAKE_MAX_ITEMS) {
        if (items.length === INTAKE_MAX_ITEMS) e.add("TOO_MANY_ITEMS", p, `More than ${INTAKE_MAX_ITEMS} items.`);
        return;
      }
      if (!isObj(raw)) {
        e.add("INVALID_TYPE", p, "Must be an object.");
        return;
      }
      for (const k of Object.keys(raw)) if (!itemKeys(version, level).includes(k)) e.add("UNKNOWN_KEY", `${p}.${k}`, `Unknown key "${k}" at ${p} (a ${level.toLowerCase()}). Allowed here: ${itemKeys(version, level).join(", ")}.`);
      const name = plain(e, raw.name, `${p}.name`, INTAKE_NAME_MAX, true);
      if (name) {
        const lower = name.toLowerCase();
        if (seen.has(lower)) e.add("DUPLICATE_NAME", `${p}.name`, `"${name}" appears twice here.`);
        seen.add(lower);
      }
      const uncertain = raw.uncertain === undefined || raw.uncertain === null ? false : raw.uncertain;
      if (typeof uncertain !== "boolean") e.add("INVALID_TYPE", `${p}.uncertain`, '"uncertain" must be true or false.');
      const reason = plain(e, raw.uncertain_reason, `${p}.uncertain_reason`, INTAKE_REASON_MAX, uncertain === true);
      let tierValue: WeightageTier | null = null;
      if (raw.weightage_tier !== undefined && raw.weightage_tier !== null) {
        if (!(WEIGHTAGE_TIERS as readonly unknown[]).includes(raw.weightage_tier)) e.add("INVALID_VALUE", `${p}.weightage_tier`, `"weightage_tier" must be one of ${WEIGHTAGE_TIERS.join(", ")}.`);
        else tierValue = raw.weightage_tier as WeightageTier;
      }
      let origin: IntakeOrigin | null = null;
      if (version === 3 && HAS_ORIGIN.includes(level)) {
        if (raw.origin === undefined || raw.origin === null) e.add("REQUIRED", `${p}.origin`, `"origin" is required: one of ${INTAKE_ORIGINS.join(", ")}.`);
        else if (!(INTAKE_ORIGINS as readonly unknown[]).includes(raw.origin)) e.add("INVALID_VALUE", `${p}.origin`, `"origin" must be one of ${INTAKE_ORIGINS.join(", ")}.`);
        else origin = raw.origin as IntakeOrigin;
      }
      const key = `${parentKey ? `${parentKey}.` : ""}${KEY_PREFIX[level]}${i}`;
      const item: IntakeItemDraft = {
        key,
        parent_key: parentKey,
        level,
        position: i,
        name: name ?? "",
        name_hi: plain(e, raw.name_hi, `${p}.name_hi`, INTAKE_NAME_MAX, false),
        aliases: textList(e, raw.aliases, `${p}.aliases`, INTAKE_ALIASES_MAX, INTAKE_ALIAS_MAX),
        marks: count(e, raw.marks, `${p}.marks`, 10000, false),
        questions: count(e, raw.questions, `${p}.questions`, 1000, true),
        weightage_tier: tierValue,
        uncertain: uncertain === true,
        uncertain_reason: reason,
        extra_headings: level === "CONCEPT" ? textList(e, raw.headings, `${p}.headings`, INTAKE_HEADINGS_MAX, INTAKE_NAME_MAX) : [],
        origin,
        avg_questions: version === 3 && HAS_ORIGIN.includes(level) ? count(e, raw.avg_questions, `${p}.avg_questions`, 1000, false) : null,
        duration_minutes: version === 3 && level === "PAPER" ? count(e, raw.duration_minutes, `${p}.duration_minutes`, 1440, true) : null,
        negative_marking: version === 3 && level === "PAPER" ? plain(e, raw.negative_marking, `${p}.negative_marking`, INTAKE_NEGATIVE_MARKING_MAX, false) : null,
        sectional: null,
      };
      if (version === 3 && level === "SUBJECT" && (raw.duration_minutes !== undefined || raw.negative_marking !== undefined)) {
        const d = count(e, raw.duration_minutes, `${p}.duration_minutes`, 1440, true);
        if (d === 0) e.add("INVALID_VALUE", `${p}.duration_minutes`, "A subject's own duration must be more than 0 minutes (leave it out when the paper has no sectional timing).");
        item.sectional = { duration_minutes: d, negative_marking: marking(e, raw.negative_marking, `${p}.negative_marking`) };
      }
      items.push(item);
      stats[statKey[level]] += 1;
      if (item.uncertain) stats.uncertain += 1;
      if (origin === "OFFICIAL") stats.official += 1;
      else if (origin === "PYQ_TREND") stats.pyq_trend += 1;
      else if (origin === "EXPANDED") stats.expanded += 1;
      // v3.2: a subtopic's outline lines become EXPANDED concept items (instead of "concepts", never both)
      if (version === 3 && level === "SUBTOPIC" && raw.outline !== undefined && raw.outline !== null) {
        if (Array.isArray(raw.concepts) && raw.concepts.length > 0) e.add("INVALID_VALUE", `${p}.outline`, 'Give either "outline" or "concepts" for a subtopic, not both.');
        const lines = textList(e, raw.outline, `${p}.outline`, INTAKE_OUTLINE_MAX, INTAKE_NAME_MAX);
        lines.forEach((line, j) => {
          if (items.length >= INTAKE_MAX_ITEMS) return;
          items.push({ ...item, key: `${key}.c${j}`, parent_key: key, level: "CONCEPT", position: j, name: line, name_hi: null, aliases: [], marks: null, questions: null,
            weightage_tier: null, uncertain: false, uncertain_reason: null, extra_headings: [], origin: "EXPANDED", avg_questions: null, duration_minutes: null, negative_marking: null, sectional: null });
          stats.concepts += 1;
          stats.expanded += 1;
        });
      }
      const childList = CHILD_LIST[level];
      const childLevel = CHILD_LEVEL[level];
      if (childList && childLevel) {
        const children = raw[childList];
        if (level === "PAPER" || level === "SUBJECT") {
          if (!Array.isArray(children) || children.length === 0) e.add("REQUIRED", `${p}.${childList}`, `A ${level.toLowerCase()} lists at least one ${childLevel.toLowerCase()}.`);
          else walk(children, childLevel, `${p}.${childList}`, key);
        } else if (children !== undefined && children !== null) {
          walk(children, childLevel, `${p}.${childList}`, key);
        }
      }
    });
  };
  if (!Array.isArray(data.papers) || data.papers.length === 0) e.add("REQUIRED", "$.papers", "At least one paper is required.");
  else walk(data.papers, "PAPER", "$.papers", null);

  if (e.list.length) return { ok: false, errors: e.list };
  return {
    ok: true,
    header: { contract_version: version, exam: exam as string, cycle_year: cycleYear, tier, based_on: basedOn, source_url: sourceUrl, as_of: asOf },
    items,
    stats,
    payload: data,
    warnings: intakeWarnings(items),
  };
}

/**
 * v3.1: NON-BLOCKING consistency notes per paper — the subjects' own timings / marks must add up to the paper's when
 * both are given (a paper without sectional timing should carry its duration at the paper level only).
 */
export function intakeWarnings(items: IntakeItemDraft[]): IntakeWarning[] {
  const out: IntakeWarning[] = [];
  // v3.2: each subject's Σ topic avg_questions against its own questions (> 20 % off → a note)
  weightageChecks(items.map((i) => ({ key: i.key, parentKey: i.parent_key, level: i.level, name: i.name, questions: i.questions, avgQuestions: i.avg_questions })))
    .filter((w) => w.off)
    .forEach((w) => out.push({ path: w.path, message: w.message }));
  items
    .filter((p) => p.level === "PAPER")
    .forEach((paper, pi) => {
      const subjects = items.filter((s) => s.level === "SUBJECT" && s.parent_key === paper.key);
      const timed = subjects.map((s) => s.sectional?.duration_minutes ?? null).filter((x): x is number => x !== null);
      if (timed.length > 0 && paper.duration_minutes !== null) {
        const sum = timed.reduce((a, b) => a + b, 0);
        if (timed.length !== subjects.length || sum !== paper.duration_minutes)
          out.push({ path: `$.papers[${pi}]`, message: `Subject timings don't add up to paper duration (${sum} of ${paper.duration_minutes} min${timed.length !== subjects.length ? `; ${subjects.length - timed.length} subject(s) have none` : ""}) — remove subject timings if the paper has no sectional timing.` });
      }
      const marked = subjects.map((s) => s.marks).filter((x): x is number => x !== null);
      if (marked.length > 0 && paper.marks !== null) {
        const sum = marked.reduce((a, b) => a + b, 0);
        if (marked.length !== subjects.length || Math.abs(sum - paper.marks) > 1e-9)
          out.push({ path: `$.papers[${pi}]`, message: `Subject marks don't add up to the paper's total marks (${sum} of ${paper.marks}${marked.length !== subjects.length ? `; ${subjects.length - marked.length} subject(s) have none` : ""}).` });
      }
    });
  return out;
}

export interface WeightageInput {
  key: string;
  parentKey: string | null;
  level: IntakeLevel;
  name: string;
  questions: number | null;
  avgQuestions: number | null;
}

export interface WeightageCheck {
  subject: string;
  path: string;
  questions: number;
  estimated: number;
  /** more than WEIGHTAGE_TOLERANCE away from the subject's questions */
  off: boolean;
  message: string;
}

/**
 * v3.2 / INTAKE-ASSIST-1 step 6: per subject with questions and ≥ 1 topic estimate, Σ topic avg_questions vs the
 * subject's questions (the estimates are the AI's, so this is a note, never a block).
 */
export function weightageChecks(items: WeightageInput[]): WeightageCheck[] {
  const out: WeightageCheck[] = [];
  items
    .filter((s) => s.level === "SUBJECT" && s.questions !== null && s.questions > 0)
    .forEach((s) => {
      const est = items.filter((t) => t.level === "TOPIC" && t.parentKey === s.key && t.avgQuestions !== null).map((t) => t.avgQuestions as number);
      if (!est.length) return;
      const sum = Math.round(est.reduce((a, b) => a + b, 0) * 10) / 10;
      const q = s.questions as number;
      const off = Math.abs(sum - q) > q * WEIGHTAGE_TOLERANCE;
      const pct = Math.round(((sum - q) / q) * 100);
      out.push({
        subject: s.name,
        path: pathOfKey(s.key),
        questions: q,
        estimated: sum,
        off,
        message: `${s.name}: the topics' estimates add up to about ${sum} questions, the subject has ${q} (${pct > 0 ? "+" : ""}${pct} %)${off ? " — check the weightage." : "."}`,
      });
    });
  return out;
}

/** "p0.s1" → "$.papers[0].subjects[1]" */
function pathOfKey(key: string): string {
  const names: Record<string, string> = { p: "papers", s: "subjects", t: "topics", u: "subtopics", c: "concepts" };
  return "$" + key.split(".").map((part) => `.${names[part[0]]}[${part.slice(1)}]`).join("");
}
