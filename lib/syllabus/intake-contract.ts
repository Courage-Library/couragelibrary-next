/**
 * CA-2: the SYLLABUS_INTAKE v2 contract (what the owner pastes back from the AI) — pure, dependency-free, safe in
 * client components. Names, not paths: the server matches every name to the master tree (lib/syllabus/tree-matcher.ts)
 * and the database re-checks every structural claim (fn_syllabus_intake_create).
 *
 * Shape (strict JSON, unknown keys are errors):
 *   { contract_version: 2, exam: "<exam slug>", cycle_year: 2026 | null, tier: "tier-1" | null,
 *     source_url: "https://…", as_of: "YYYY-MM-DD",
 *     papers: [{ name, marks?, questions?, uncertain?, uncertain_reason?,
 *       subjects: [{ name, name_hi?, aliases?, marks?, questions?, weightage_tier?, uncertain?, uncertain_reason?,
 *         topics: [{ …same…, subtopics: [{ …same…, concepts: [{ …same…, headings? }] }] }] }] }] }
 * Levels deeper than a concept go into "headings" (they become sections inside the L4 lesson, design L.1).
 */
import { isPlainText, WEIGHTAGE_TIERS, type WeightageTier } from "@/lib/syllabus/import-contract";

export const INTAKE_CONTRACT_VERSION = 2;
export const INTAKE_MAX_BYTES = 256 * 1024;
export const INTAKE_MAX_ITEMS = 1000;
export const INTAKE_MAX_ERRORS = 100;
export const INTAKE_NAME_MAX = 200;
export const INTAKE_ALIAS_MAX = 160;
export const INTAKE_ALIASES_MAX = 10;
export const INTAKE_HEADINGS_MAX = 50;
export const INTAKE_REASON_MAX = 500;

export const INTAKE_LEVELS = ["PAPER", "SUBJECT", "TOPIC", "SUBTOPIC", "CONCEPT"] as const;
export type IntakeLevel = (typeof INTAKE_LEVELS)[number];

/** The list key holding each level's children. */
const CHILD_LIST: Record<IntakeLevel, string | null> = { PAPER: "subjects", SUBJECT: "topics", TOPIC: "subtopics", SUBTOPIC: "concepts", CONCEPT: null };
const CHILD_LEVEL: Record<IntakeLevel, IntakeLevel | null> = { PAPER: "SUBJECT", SUBJECT: "TOPIC", TOPIC: "SUBTOPIC", SUBTOPIC: "CONCEPT", CONCEPT: null };
const KEY_PREFIX: Record<IntakeLevel, string> = { PAPER: "p", SUBJECT: "s", TOPIC: "t", SUBTOPIC: "u", CONCEPT: "c" };
const ITEM_KEYS: Record<IntakeLevel, readonly string[]> = {
  PAPER: ["name", "marks", "questions", "uncertain", "uncertain_reason", "subjects"],
  SUBJECT: ["name", "name_hi", "aliases", "marks", "questions", "weightage_tier", "uncertain", "uncertain_reason", "topics"],
  TOPIC: ["name", "name_hi", "aliases", "marks", "questions", "weightage_tier", "uncertain", "uncertain_reason", "subtopics"],
  SUBTOPIC: ["name", "name_hi", "aliases", "marks", "questions", "weightage_tier", "uncertain", "uncertain_reason", "concepts"],
  CONCEPT: ["name", "name_hi", "aliases", "marks", "questions", "weightage_tier", "uncertain", "uncertain_reason", "headings"],
};
const ROOT_KEYS = ["contract_version", "exam", "cycle_year", "tier", "source_url", "as_of", "papers"] as const;

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
}

export interface IntakeHeader {
  exam: string;
  cycle_year: number | null;
  tier: string | null;
  source_url: string;
  as_of: string;
}

export interface IntakeStats {
  papers: number;
  subjects: number;
  topics: number;
  subtopics: number;
  concepts: number;
  uncertain: number;
}

export type IntakeValidation =
  | { ok: true; header: IntakeHeader; items: IntakeItemDraft[]; stats: IntakeStats; payload: Record<string, unknown> }
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
  value.slice(0, maxItems).forEach((v, i) => {
    const t = plain(e, v, `${path}[${i}]`, maxLen, true);
    if (t) out.push(t);
  });
  return out;
}

/** Validates the pasted text (or an already parsed value) against v2 and the wizard's context. */
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

  for (const k of Object.keys(data)) if (!(ROOT_KEYS as readonly string[]).includes(k)) e.add("UNKNOWN_KEY", `$.${k}`, `Unknown key "${k}".`);
  if (data.contract_version !== INTAKE_CONTRACT_VERSION) e.add("UNSUPPORTED_CONTRACT_VERSION", "$.contract_version", `"contract_version" must be ${INTAKE_CONTRACT_VERSION}.`);
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
  const sourceUrl = plain(e, data.source_url, "$.source_url", 500, true);
  if (sourceUrl && !SOURCE_URL_RE.test(sourceUrl)) e.add("INVALID_VALUE", "$.source_url", '"source_url" must be the official https:// link.');
  const asOf = plain(e, data.as_of, "$.as_of", 10, true);
  if (asOf && (!DATE_RE.test(asOf) || Number.isNaN(Date.parse(`${asOf}T00:00:00Z`)))) e.add("INVALID_VALUE", "$.as_of", '"as_of" must be a date (YYYY-MM-DD).');

  if (ctx) {
    if (exam && exam !== ctx.examSlug) e.add("CONTEXT_MISMATCH", "$.exam", `The payload is for "${exam}", but the selected exam is "${ctx.examSlug}".`);
    if (cycleYear !== ctx.cycleYear) e.add("CONTEXT_MISMATCH", "$.cycle_year", `The payload's cycle (${cycleYear ?? "none"}) differs from the selected cycle (${ctx.cycleYear ?? "none"}).`);
    if (tier !== ctx.tier) e.add("CONTEXT_MISMATCH", "$.tier", `The payload's tier (${tier ?? "none"}) differs from the selected tier (${ctx.tier ?? "none"}).`);
  }

  const items: IntakeItemDraft[] = [];
  const stats: IntakeStats = { papers: 0, subjects: 0, topics: 0, subtopics: 0, concepts: 0, uncertain: 0 };
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
      for (const k of Object.keys(raw)) if (!ITEM_KEYS[level].includes(k)) e.add("UNKNOWN_KEY", `${p}.${k}`, `Unknown key "${k}" for a ${level.toLowerCase()}.`);
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
      };
      items.push(item);
      stats[statKey[level]] += 1;
      if (item.uncertain) stats.uncertain += 1;
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
  return { ok: true, header: { exam: exam as string, cycle_year: cycleYear, tier, source_url: sourceUrl as string, as_of: asOf as string }, items, stats, payload: data };
}
