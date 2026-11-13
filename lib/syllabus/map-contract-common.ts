/**
 * SYLLABUS-MAP-1 B1: shared rules of the two new contracts (lib/syllabus/master-intake-contract.ts and
 * lib/syllabus/exam-map-contract.ts) — pure, dependency-free, safe in client components.
 * The outline rules mirror the database (migration 138 fn_outline_lines_valid): 1–30 lines, each 1–200 characters after
 * trimming, one line, no duplicate line (case-insensitive) — the validator trims, the database refuses untrimmed lines.
 */
import { isPlainText } from "@/lib/syllabus/import-contract";
import { normalizeTaxonomyName } from "@/lib/taxonomy/normalize";

export const MAP_MAX_BYTES = 256 * 1024;
export const MAP_MAX_ITEMS = 1000;
export const MAP_MAX_ERRORS = 100;
export const MAP_NAME_MAX = 200;
export const MAP_ALIAS_MAX = 160;
export const MAP_ALIASES_MAX = 10;
export const MAP_BASED_ON_MAX = 500;
/** owner 2026-11-12: outline lines are NOT items; their own caps */
export const OUTLINE_LINES_PER_NODE_MAX = 30;
export const OUTLINE_LINE_MAX = 200;
export const MASTER_OUTLINE_LINES_MAX = 6000;

/** "subject.topic" / "subject.topic.subtopic" — a master hierarchy_path (slugs joined by ".") */
export const MASTER_PATH_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*){0,3}$/;
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const pathDepth = (p: string) => p.split(".").length;

export interface ContractIssue {
  code: string;
  /** JSON path, e.g. papers[0].sections[2].map[5].ref */
  path: string;
  message: string;
}

export class IssueCollector {
  readonly errors: ContractIssue[] = [];
  readonly warnings: ContractIssue[] = [];
  error(code: string, path: string, message: string) {
    if (this.errors.length < MAP_MAX_ERRORS) this.errors.push({ code, path, message });
  }
  warn(code: string, path: string, message: string) {
    if (this.warnings.length < MAP_MAX_ERRORS) this.warnings.push({ code, path, message });
  }
}

export const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Unknown keys are errors that name the allowed ones. `special` keys get their own message first. */
export function checkKeys(c: IssueCollector, obj: Record<string, unknown>, allowed: readonly string[], path: string, special: Record<string, [string, string]> = {}) {
  for (const k of Object.keys(obj)) {
    if (allowed.includes(k)) continue;
    if (special[k]) c.error(special[k][0], `${path}.${k}`, special[k][1]);
    else c.error("UNKNOWN_KEY", `${path}.${k}`, `Unknown key "${k}". Allowed here: ${allowed.join(", ")}.`);
  }
}

/** A required / optional single-line plain-text value, trimmed. */
export function plainText(c: IssueCollector, v: unknown, path: string, { required = true, max = MAP_NAME_MAX, min = 1 } = {}): string | null {
  if (v === undefined || v === null) {
    if (required) c.error("MISSING", path, "Required.");
    return null;
  }
  if (typeof v !== "string") {
    c.error("INVALID_TYPE", path, "Must be text.");
    return null;
  }
  const t = v.trim();
  if (t.length < min || t.length > max) c.error("INVALID_LENGTH", path, `Must be ${min}–${max} characters.`);
  else if (/[\r\n\t]/.test(t)) c.error("INVALID_VALUE", path, "Must be on one line.");
  else if (!isPlainText(t)) c.error("NOT_PLAIN_TEXT", path, "Plain text only (no HTML, markdown or links).");
  else return t;
  return null;
}

export function wholeNumber(c: IssueCollector, v: unknown, path: string, { required = false, min = 0, max = 100000 } = {}): number | null {
  if (v === undefined || v === null) {
    if (required) c.error("MISSING", path, "Required.");
    return null;
  }
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) {
    c.error("INVALID_VALUE", path, `Must be a whole number from ${min} to ${max}.`);
    return null;
  }
  return v;
}

export function aliasList(c: IssueCollector, v: unknown, path: string): string[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) {
    c.error("INVALID_TYPE", path, "Must be a list of names.");
    return [];
  }
  if (v.length > MAP_ALIASES_MAX) c.error("TOO_MANY", path, `At most ${MAP_ALIASES_MAX} aliases.`);
  const out: string[] = [];
  const seen = new Set<string>();
  v.slice(0, MAP_ALIASES_MAX).forEach((a, i) => {
    const t = plainText(c, a, `${path}[${i}]`, { max: MAP_ALIAS_MAX });
    if (t && !seen.has(normalizeTaxonomyName(t))) {
      seen.add(normalizeTaxonomyName(t));
      out.push(t);
    }
  });
  return out;
}

/** An outline: 1–30 lines, each 1–200 characters after trimming, one line, plain text, no duplicate (case-insensitive). */
export function outlineLines(c: IssueCollector, v: unknown, path: string): string[] | null {
  if (!Array.isArray(v)) {
    c.error("INVALID_TYPE", path, "An outline is a list of short lines.");
    return null;
  }
  if (v.length < 1 || v.length > OUTLINE_LINES_PER_NODE_MAX) {
    c.error("OUTLINE_TOO_LONG", path, `An outline has 1–${OUTLINE_LINES_PER_NODE_MAX} lines (this one has ${v.length}).`);
    return null;
  }
  const out: string[] = [];
  const seen = new Set<string>();
  let ok = true;
  v.forEach((line, i) => {
    const t = plainText(c, line, `${path}[${i}]`, { max: OUTLINE_LINE_MAX });
    if (t === null) ok = false;
    else if (seen.has(t.toLowerCase())) {
      c.error("DUPLICATE_LINE", `${path}[${i}]`, `The line "${t}" appears twice.`);
      ok = false;
    } else {
      seen.add(t.toLowerCase());
      out.push(t);
    }
  });
  return ok ? out : null;
}

/** The raw text → JSON, with the byte cap. */
export function parseJsonText(c: IssueCollector, text: string): unknown {
  if (new TextEncoder().encode(text).length > MAP_MAX_BYTES) {
    c.error("TOO_LARGE", "$", `The file is larger than ${MAP_MAX_BYTES / 1024} KB.`);
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    c.error("INVALID_JSON", "$", "Not valid JSON (paste only the JSON object, no prose or code fences).");
    return null;
  }
}
