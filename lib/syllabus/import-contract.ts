/**
 * SYL-IMPORT-1 — syllabus draft import contract (contract_version 1): the ONE TypeScript validator.
 *
 * Used by the /admin/syllabus server actions (preview + import) and by scripts/test_syl_import1.cjs. The RPC
 * fn_syllabus_import_draft (migration 086) re-validates everything server-side and is the authority; this module
 * gives the admin the full, path-addressed error list before anything is sent. Contract: docs/syllabus/IMPORT_CONTRACT.md.
 *
 * Rules (architect ruling): input is `unknown` and narrowed with explicit guards (no casts before validation passes);
 * unknown keys rejected at every level; contract_version checked first; errors collected (capped at 200) with JSON
 * paths; payload size and node count checked before the deep pass; depth fixed (PAPER → SECTION → UNIT). Topics are
 * referenced by their taxonomy hierarchy path and are only RESOLVED against a catalog (never created, never fuzzy-
 * matched): unresolved → MISSING_TOPIC with the requested identifier. Pure module: no imports, no I/O.
 */

export const IMPORT_CONTRACT_VERSION = 1;
export const IMPORT_MAX_BYTES = 256 * 1024;
export const IMPORT_MAX_NODES = 500;
export const IMPORT_MAX_ERRORS = 200;
export const IMPORT_TITLE_MAX = 200;
export const IMPORT_DESCRIPTION_MAX = 2000;
export const IMPORT_NOTE_MAX = 500;
export const IMPORT_CODE_MAX = 80;
export const IMPORT_TAG_MAX = 80;
export const IMPORT_MAX_TOPICS_PER_UNIT = 20;
export const IMPORT_QUESTIONS_MAX = 1000;

export const WEIGHTAGE_TIERS = ["HIGH_YIELD", "CORE", "MODERATE", "LOW", "OPTIONAL"] as const;
export const COGNITIVE_DEPTHS = ["RECALL", "UNDERSTANDING", "APPLICATION", "ANALYSIS", "COMPLEX_PROBLEM_SOLVING"] as const;
export type WeightageTier = (typeof WEIGHTAGE_TIERS)[number];
export type CognitiveDepth = (typeof COGNITIVE_DEPTHS)[number];

export type ImportErrorCode =
  | "INVALID_JSON"
  | "PAYLOAD_TOO_LARGE"
  | "TOO_MANY_NODES"
  | "UNSUPPORTED_CONTRACT_VERSION"
  | "INVALID_TYPE"
  | "UNKNOWN_KEY"
  | "REQUIRED"
  | "INVALID_VALUE"
  | "TOO_LONG"
  | "NOT_PLAIN_TEXT"
  | "INVALID_CODE"
  | "DUPLICATE_CODE"
  | "ORDER_NOT_CONTIGUOUS"
  | "EMPTY_LIST"
  | "BAD_DEPTH"
  | "MAPPING_NOT_UNIT"
  | "RANGE_INVALID"
  | "DUPLICATE_TOPIC"
  | "DUPLICATE_TOPIC_IN_SECTION"
  | "WEIGHTS_INVALID"
  | "MISSING_TOPIC"
  | "TOPIC_INACTIVE"
  | "EXAM_MISMATCH"
  | "CYCLE_NOT_FOUND"
  | "DRAFT_EXISTS"
  | "TOO_MANY_ERRORS";

export interface ImportError {
  code: ImportErrorCode;
  /** JSON path, e.g. $.papers[0].sections[2].units[1].title */
  path: string;
  message: string;
}

export interface ImportTopicRef {
  topic: string;
  weight: number | null;
}
interface ImportNodeBase {
  code: string;
  title: string;
  description: string | null;
  is_mandatory: boolean;
}
export interface ImportUnit extends ImportNodeBase {
  weightage_tier: WeightageTier | null;
  expected_questions_min: number | null;
  expected_questions_max: number | null;
  required_cognitive_depth: CognitiveDepth | null;
  topics: ImportTopicRef[];
}
export interface ImportSection extends ImportNodeBase {
  weightage_tier: WeightageTier | null;
  expected_questions_min: number | null;
  expected_questions_max: number | null;
  units: ImportUnit[];
}
export interface ImportPaper extends ImportNodeBase {
  expected_questions_min: number | null;
  expected_questions_max: number | null;
  sections: ImportSection[];
}
export interface SyllabusImportPayload {
  contract_version: 1;
  exam: string;
  cycle_year: number | null;
  version_tag: string | null;
  source_note: string | null;
  papers: ImportPaper[];
}
export interface ImportStats {
  papers: number;
  sections: number;
  units: number;
  nodes: number;
  mappings: number;
  topics: string[];
}
export type ImportValidation =
  | { ok: true; payload: SyllabusImportPayload; stats: ImportStats; errors: [] }
  | { ok: false; payload: null; stats: null; errors: ImportError[] };

/** A taxonomy TOPIC node as the resolver needs it (hierarchy_path is the stable identifier). */
export interface ImportCatalogTopic {
  id: string;
  path: string;
  name: string;
  is_active: boolean;
}
export interface ImportResolution {
  errors: ImportError[];
  /** topic path → topic id for every resolved (active) topic */
  resolved: Record<string, string>;
  missing: string[];
  inactive: string[];
}

// ---------------------------------------------------------------- guards (no casts)
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
const isArray = (v: unknown): v is unknown[] => Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const isTier = (v: unknown): v is WeightageTier => typeof v === "string" && WEIGHTAGE_TIERS.some((t) => t === v);
const isDepth = (v: unknown): v is CognitiveDepth => typeof v === "string" && COGNITIVE_DEPTHS.some((d) => d === v);

export const CODE_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const TOPIC_PATH_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)+$/;
const TAG_RE = /^[a-z0-9]+(?:[-.][a-z0-9]+)*$/;

/**
 * Plain text only: no HTML / script (< >), no markdown links, emphasis, code or headings / quotes, no control
 * characters except newline. The RPC applies the same rule (docs/syllabus/IMPORT_CONTRACT.md §4).
 */
export function isPlainText(s: string): boolean {
  if (/[<>`]/.test(s)) return false;
  if (/\]\(/.test(s) || /\*\*|__/.test(s)) return false;
  if (/(^|\n)[ \t]*[#>]/.test(s)) return false;
  if (/javascript:/i.test(s)) return false;
  if (/[\u0000-\u0009\u000b-\u001f\u007f]/.test(s)) return false;
  return true;
}

// ---------------------------------------------------------------- collector
class Collector {
  readonly errors: ImportError[] = [];
  private capped = false;
  add(code: ImportErrorCode, path: string, message: string) {
    if (this.capped) return;
    if (this.errors.length >= IMPORT_MAX_ERRORS - 1) {
      this.errors.push({ code: "TOO_MANY_ERRORS", path: "$", message: `More than ${IMPORT_MAX_ERRORS - 1} errors; fix these and validate again.` });
      this.capped = true;
      return;
    }
    this.errors.push({ code, path, message });
  }
}

const KEYS = {
  root: ["contract_version", "exam", "cycle_year", "version_tag", "source_note", "papers"],
  paper: ["code", "title", "order", "description", "is_mandatory", "expected_questions_min", "expected_questions_max", "sections"],
  section: ["code", "title", "order", "description", "is_mandatory", "weightage_tier", "expected_questions_min", "expected_questions_max", "units"],
  unit: ["code", "title", "order", "description", "is_mandatory", "weightage_tier", "expected_questions_min", "expected_questions_max", "required_cognitive_depth", "topics"],
  topic: ["topic", "weight"],
} as const;
type Level = "paper" | "section" | "unit";
const CHILD_KEYS = new Set(["papers", "sections", "units"]);

function checkKeys(c: Collector, obj: Record<string, unknown>, allowed: readonly string[], path: string, level: Level | "root" | "topic") {
  for (const k of Object.keys(obj)) {
    if (allowed.includes(k)) continue;
    if (k === "topics" && (level === "paper" || level === "section")) c.add("MAPPING_NOT_UNIT", `${path}.topics`, "Topic mappings are allowed on UNIT nodes only.");
    else if (CHILD_KEYS.has(k) && level !== "root" && level !== "topic") c.add("BAD_DEPTH", `${path}.${k}`, `"${k}" is not allowed under a ${level}: the tree is papers → sections → units.`);
    else c.add("UNKNOWN_KEY", `${path}.${k}`, `Unknown key "${k}".`);
  }
}

function text(c: Collector, obj: Record<string, unknown>, key: string, path: string, max: number, required: boolean): string | null {
  const v = obj[key];
  const p = `${path}.${key}`;
  if (v === undefined || v === null) {
    if (required) c.add("REQUIRED", p, `"${key}" is required.`);
    return null;
  }
  if (typeof v !== "string") {
    c.add("INVALID_TYPE", p, `"${key}" must be a string.`);
    return null;
  }
  const t = v.trim();
  if (required && t.length === 0) {
    c.add("REQUIRED", p, `"${key}" must not be empty.`);
    return null;
  }
  if (t.length > max) c.add("TOO_LONG", p, `"${key}" is longer than ${max} characters.`);
  if (!isPlainText(t)) c.add("NOT_PLAIN_TEXT", p, `"${key}" must be plain text (no HTML, markdown links / formatting or code).`);
  return t.length === 0 ? null : t;
}

function questions(c: Collector, obj: Record<string, unknown>, path: string): { min: number | null; max: number | null } {
  const read = (k: "expected_questions_min" | "expected_questions_max"): number | null => {
    const v = obj[k];
    if (v === undefined || v === null) return null;
    if (!isInt(v) || v < 0 || v > IMPORT_QUESTIONS_MAX) {
      c.add("INVALID_VALUE", `${path}.${k}`, `"${k}" must be a whole number between 0 and ${IMPORT_QUESTIONS_MAX}, or null when unknown.`);
      return null;
    }
    return v;
  };
  const min = read("expected_questions_min");
  const max = read("expected_questions_max");
  if (min !== null && max !== null && min > max) c.add("RANGE_INVALID", `${path}.expected_questions_min`, "expected_questions_min must not exceed expected_questions_max.");
  return { min, max };
}

function base(c: Collector, obj: Record<string, unknown>, path: string, index: number, codes: Map<string, string>): ImportNodeBase {
  const codeRaw = obj.code;
  let code = "";
  if (codeRaw === undefined || codeRaw === null) c.add("REQUIRED", `${path}.code`, '"code" is required.');
  else if (typeof codeRaw !== "string") c.add("INVALID_TYPE", `${path}.code`, '"code" must be a string.');
  else if (!CODE_RE.test(codeRaw) || codeRaw.length > IMPORT_CODE_MAX) c.add("INVALID_CODE", `${path}.code`, `"code" must be lower-case letters, digits and single hyphens (max ${IMPORT_CODE_MAX}).`);
  else {
    code = codeRaw;
    const first = codes.get(codeRaw);
    if (first !== undefined) c.add("DUPLICATE_CODE", `${path}.code`, `Code "${codeRaw}" is already used at ${first}.`);
    else codes.set(codeRaw, `${path}.code`);
  }
  const order = obj.order;
  if (order !== undefined && order !== null && (!isInt(order) || order !== index + 1)) {
    c.add("ORDER_NOT_CONTIGUOUS", `${path}.order`, `"order" must be ${index + 1} (its position in the list), or be omitted.`);
  }
  const mandatory = obj.is_mandatory;
  if (mandatory !== undefined && mandatory !== null && typeof mandatory !== "boolean") c.add("INVALID_TYPE", `${path}.is_mandatory`, '"is_mandatory" must be true or false.');
  return {
    code,
    title: text(c, obj, "title", path, IMPORT_TITLE_MAX, true) ?? "",
    description: text(c, obj, "description", path, IMPORT_DESCRIPTION_MAX, false),
    is_mandatory: typeof mandatory === "boolean" ? mandatory : true,
  };
}

function tier(c: Collector, obj: Record<string, unknown>, path: string): WeightageTier | null {
  const v = obj.weightage_tier;
  if (v === undefined || v === null) return null;
  if (!isTier(v)) {
    c.add("INVALID_VALUE", `${path}.weightage_tier`, `"weightage_tier" must be one of ${WEIGHTAGE_TIERS.join(", ")} or null.`);
    return null;
  }
  return v;
}

function list(c: Collector, obj: Record<string, unknown>, key: string, path: string, what: string): unknown[] {
  const v = obj[key];
  if (v === undefined || v === null) {
    c.add("REQUIRED", `${path}.${key}`, `"${key}" is required.`);
    return [];
  }
  if (!isArray(v)) {
    c.add("INVALID_TYPE", `${path}.${key}`, `"${key}" must be a list.`);
    return [];
  }
  if (v.length === 0) c.add("EMPTY_LIST", `${path}.${key}`, `At least one ${what} is required.`);
  return v;
}

/** Cheap shape-tolerant count of papers + sections + units (before the deep pass). */
export function countImportNodes(input: unknown): number {
  if (!isRecord(input) || !isArray(input.papers)) return 0;
  let n = 0;
  for (const p of input.papers) {
    n++;
    if (n > IMPORT_MAX_NODES) return n;
    if (!isRecord(p) || !isArray(p.sections)) continue;
    for (const s of p.sections) {
      n++;
      if (n > IMPORT_MAX_NODES) return n;
      if (!isRecord(s) || !isArray(s.units)) continue;
      n += s.units.length;
      if (n > IMPORT_MAX_NODES) return n;
    }
  }
  return n;
}

/** Structural validation of an already-parsed value. */
export function validateImportPayload(input: unknown): ImportValidation {
  const c = new Collector();
  const fail = (): ImportValidation => ({ ok: false, payload: null, stats: null, errors: c.errors });
  if (!isRecord(input)) {
    c.add("INVALID_TYPE", "$", "The payload must be a JSON object.");
    return fail();
  }
  if (input.contract_version !== IMPORT_CONTRACT_VERSION) {
    c.add("UNSUPPORTED_CONTRACT_VERSION", "$.contract_version", `"contract_version" must be ${IMPORT_CONTRACT_VERSION}.`);
    return fail();
  }
  const nodeCount = countImportNodes(input);
  if (nodeCount > IMPORT_MAX_NODES) {
    c.add("TOO_MANY_NODES", "$.papers", `More than ${IMPORT_MAX_NODES} nodes (papers + sections + units).`);
    return fail();
  }
  checkKeys(c, input, KEYS.root, "$", "root");

  let exam = "";
  if (typeof input.exam !== "string" || !CODE_RE.test(input.exam)) c.add(input.exam === undefined ? "REQUIRED" : "INVALID_VALUE", "$.exam", '"exam" must be the exam slug (e.g. "ssc-cgl").');
  else exam = input.exam;

  let cycleYear: number | null = null;
  if (input.cycle_year !== undefined && input.cycle_year !== null) {
    if (!isInt(input.cycle_year) || input.cycle_year < 2000 || input.cycle_year > 2100) c.add("INVALID_VALUE", "$.cycle_year", '"cycle_year" must be a year (2000–2100) or null.');
    else cycleYear = input.cycle_year;
  }
  let versionTag: string | null = null;
  if (input.version_tag !== undefined && input.version_tag !== null) {
    if (typeof input.version_tag !== "string" || !TAG_RE.test(input.version_tag) || input.version_tag.length > IMPORT_TAG_MAX) {
      c.add("INVALID_VALUE", "$.version_tag", `"version_tag" must be lower-case letters, digits, "-" or "." (max ${IMPORT_TAG_MAX}).`);
    } else versionTag = input.version_tag;
  }
  const sourceNote = text(c, input, "source_note", "$", IMPORT_NOTE_MAX, false);

  const codes = new Map<string, string>();
  const topicsSeen = new Set<string>();
  let sections = 0;
  let units = 0;
  let mappings = 0;
  const papers: ImportPaper[] = [];
  list(c, input, "papers", "$", "paper").forEach((rawPaper, pi) => {
    const pp = `$.papers[${pi}]`;
    if (!isRecord(rawPaper)) {
      c.add("INVALID_TYPE", pp, "A paper must be an object.");
      return;
    }
    checkKeys(c, rawPaper, KEYS.paper, pp, "paper");
    const pq = questions(c, rawPaper, pp);
    const paper: ImportPaper = { ...base(c, rawPaper, pp, pi, codes), expected_questions_min: pq.min, expected_questions_max: pq.max, sections: [] };
    list(c, rawPaper, "sections", pp, "section").forEach((rawSection, si) => {
      const sp = `${pp}.sections[${si}]`;
      if (!isRecord(rawSection)) {
        c.add("INVALID_TYPE", sp, "A section must be an object.");
        return;
      }
      checkKeys(c, rawSection, KEYS.section, sp, "section");
      const sq = questions(c, rawSection, sp);
      const section: ImportSection = {
        ...base(c, rawSection, sp, si, codes),
        weightage_tier: tier(c, rawSection, sp),
        expected_questions_min: sq.min,
        expected_questions_max: sq.max,
        units: [],
      };
      const sectionTopics = new Map<string, string>();
      list(c, rawSection, "units", sp, "unit").forEach((rawUnit, ui) => {
        const up = `${sp}.units[${ui}]`;
        if (!isRecord(rawUnit)) {
          c.add("INVALID_TYPE", up, "A unit must be an object.");
          return;
        }
        checkKeys(c, rawUnit, KEYS.unit, up, "unit");
        const uq = questions(c, rawUnit, up);
        let depth: CognitiveDepth | null = null;
        if (rawUnit.required_cognitive_depth !== undefined && rawUnit.required_cognitive_depth !== null) {
          if (isDepth(rawUnit.required_cognitive_depth)) depth = rawUnit.required_cognitive_depth;
          else c.add("INVALID_VALUE", `${up}.required_cognitive_depth`, `"required_cognitive_depth" must be one of ${COGNITIVE_DEPTHS.join(", ")} or null.`);
        }
        const unitTopics: ImportTopicRef[] = [];
        const rawTopics = rawUnit.topics;
        if (rawTopics !== undefined && rawTopics !== null) {
          if (!isArray(rawTopics)) c.add("INVALID_TYPE", `${up}.topics`, '"topics" must be a list.');
          else {
            if (rawTopics.length > IMPORT_MAX_TOPICS_PER_UNIT) c.add("INVALID_VALUE", `${up}.topics`, `At most ${IMPORT_MAX_TOPICS_PER_UNIT} topics per unit.`);
            const inUnit = new Set<string>();
            rawTopics.forEach((rawTopic, ti) => {
              const tp = `${up}.topics[${ti}]`;
              if (!isRecord(rawTopic)) {
                c.add("INVALID_TYPE", tp, 'A topic reference must be an object {"topic": "subject.topic", "weight": null}.');
                return;
              }
              checkKeys(c, rawTopic, KEYS.topic, tp, "topic");
              let path = "";
              if (typeof rawTopic.topic !== "string" || !TOPIC_PATH_RE.test(rawTopic.topic)) {
                c.add(rawTopic.topic === undefined ? "REQUIRED" : "INVALID_VALUE", `${tp}.topic`, '"topic" must be a taxonomy path such as "quantitative-aptitude.percentage".');
              } else {
                path = rawTopic.topic;
                if (inUnit.has(path)) c.add("DUPLICATE_TOPIC", `${tp}.topic`, `Topic "${path}" is listed twice in this unit.`);
                else {
                  const other = sectionTopics.get(path);
                  if (other !== undefined) c.add("DUPLICATE_TOPIC_IN_SECTION", `${tp}.topic`, `Topic "${path}" is already mapped in this section (${other}).`);
                  inUnit.add(path);
                  sectionTopics.set(path, `${up}.code`);
                }
              }
              let weight: number | null = null;
              if (rawTopic.weight !== undefined && rawTopic.weight !== null) {
                if (typeof rawTopic.weight !== "number" || !Number.isFinite(rawTopic.weight)) c.add("WEIGHTS_INVALID", `${tp}.weight`, '"weight" must be a number in (0, 1] or null.');
                else weight = rawTopic.weight;
              }
              if (path) {
                unitTopics.push({ topic: path, weight });
                topicsSeen.add(path);
              }
            });
            // weights are stored as numeric(5,4): check the values as they will be stored
            const weighted = unitTopics.filter((t) => t.weight !== null);
            if (weighted.length > 0) {
              const stored = (w: number | null) => Math.round((w ?? 0) * 10000) / 10000;
              const all = weighted.length === unitTopics.length;
              const inRange = weighted.every((t) => stored(t.weight) > 0 && stored(t.weight) <= 1);
              const sum = weighted.reduce((a, t) => a + stored(t.weight), 0);
              if (!all || !inRange || Math.abs(sum - 1) > 0.0001) {
                c.add("WEIGHTS_INVALID", `${up}.topics`, "Weights are optional; when used, every topic of the unit needs one, each in (0, 1], summing to 1.");
              }
            }
          }
        }
        mappings += unitTopics.length;
        units++;
        section.units.push({
          ...base(c, rawUnit, up, ui, codes),
          weightage_tier: tier(c, rawUnit, up),
          expected_questions_min: uq.min,
          expected_questions_max: uq.max,
          required_cognitive_depth: depth,
          topics: unitTopics,
        });
      });
      sections++;
      paper.sections.push(section);
    });
    papers.push(paper);
  });

  if (c.errors.length > 0) return fail();
  return {
    ok: true,
    payload: { contract_version: 1, exam, cycle_year: cycleYear, version_tag: versionTag, source_note: sourceNote, papers },
    stats: { papers: papers.length, sections, units, nodes: papers.length + sections + units, mappings, topics: [...topicsSeen].sort() },
    errors: [],
  };
}

/** Size check + JSON parse + structural validation of the raw text (what the admin pasted or uploaded). */
export function validateImportText(raw: string): ImportValidation {
  const bytes = new TextEncoder().encode(raw).length;
  if (bytes > IMPORT_MAX_BYTES) {
    return { ok: false, payload: null, stats: null, errors: [{ code: "PAYLOAD_TOO_LARGE", path: "$", message: `The file is ${bytes} bytes; the limit is ${IMPORT_MAX_BYTES} bytes (256 KB).` }] };
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, payload: null, stats: null, errors: [{ code: "INVALID_JSON", path: "$", message: "The text is not valid JSON." }] };
  }
  return validateImportPayload(value);
}

/** Resolves every referenced topic path against the taxonomy catalog. Never creates or guesses topics. */
export function resolveImportTopics(payload: SyllabusImportPayload, catalog: readonly ImportCatalogTopic[], examSlug?: string): ImportResolution {
  const errors: ImportError[] = [];
  const byPath = new Map(catalog.map((t) => [t.path, t]));
  const resolved: Record<string, string> = {};
  const missing = new Set<string>();
  const inactive = new Set<string>();
  if (examSlug !== undefined && payload.exam !== examSlug) {
    errors.push({ code: "EXAM_MISMATCH", path: "$.exam", message: `The file is for "${payload.exam}" but the selected exam is "${examSlug}".` });
  }
  payload.papers.forEach((p, pi) =>
    p.sections.forEach((s, si) =>
      s.units.forEach((u, ui) =>
        u.topics.forEach((t, ti) => {
          const path = `$.papers[${pi}].sections[${si}].units[${ui}].topics[${ti}].topic`;
          const hit = byPath.get(t.topic);
          if (!hit) {
            missing.add(t.topic);
            if (errors.length < IMPORT_MAX_ERRORS) errors.push({ code: "MISSING_TOPIC", path, message: `Topic "${t.topic}" does not exist in the taxonomy. Create it in /admin/taxonomy first.` });
          } else if (!hit.is_active) {
            inactive.add(t.topic);
            if (errors.length < IMPORT_MAX_ERRORS) errors.push({ code: "TOPIC_INACTIVE", path, message: `Topic "${t.topic}" is inactive.` });
          } else resolved[t.topic] = hit.id;
        }),
      ),
    ),
  );
  return { errors, resolved, missing: [...missing].sort(), inactive: [...inactive].sort() };
}

/** A JSON value (structurally compatible with the generated database Json type). */
export type ImportJsonValue = string | number | boolean | null | ImportJsonValue[] | { [key: string]: ImportJsonValue };

/** The validated payload as the plain JSON object sent to fn_syllabus_import_draft (normalised: trimmed, defaults filled). */
export function importPayloadToJson(p: SyllabusImportPayload): { [key: string]: ImportJsonValue } {
  return {
    contract_version: p.contract_version,
    exam: p.exam,
    cycle_year: p.cycle_year,
    version_tag: p.version_tag,
    source_note: p.source_note,
    papers: p.papers.map((paper) => ({
      code: paper.code,
      title: paper.title,
      description: paper.description,
      is_mandatory: paper.is_mandatory,
      expected_questions_min: paper.expected_questions_min,
      expected_questions_max: paper.expected_questions_max,
      sections: paper.sections.map((s) => ({
        code: s.code,
        title: s.title,
        description: s.description,
        is_mandatory: s.is_mandatory,
        weightage_tier: s.weightage_tier,
        expected_questions_min: s.expected_questions_min,
        expected_questions_max: s.expected_questions_max,
        units: s.units.map((u) => ({
          code: u.code,
          title: u.title,
          description: u.description,
          is_mandatory: u.is_mandatory,
          weightage_tier: u.weightage_tier,
          expected_questions_min: u.expected_questions_min,
          expected_questions_max: u.expected_questions_max,
          required_cognitive_depth: u.required_cognitive_depth,
          topics: u.topics.map((t) => ({ topic: t.topic, weight: t.weight })),
        })),
      })),
    })),
  };
}

const RPC_ERROR_RE = /^SYLLABUS_IMPORT_INVALID: ([A-Z_]+) at (\$[A-Za-z0-9_[\].]*): /;
const RPC_MESSAGES: Partial<Record<ImportErrorCode, string>> = {
  MISSING_TOPIC: "A referenced topic does not exist in the taxonomy. Create it in /admin/taxonomy first.",
  TOPIC_INACTIVE: "A referenced topic is inactive.",
  DRAFT_EXISTS: "This exam already has a DRAFT for this cycle. Publish, archive or delete it first.",
  EXAM_MISMATCH: "The file is for a different exam than the one selected.",
  CYCLE_NOT_FOUND: "The exam has no cycle for this cycle_year.",
};
const isImportErrorCode = (v: string): v is ImportErrorCode =>
  [
    "INVALID_JSON", "PAYLOAD_TOO_LARGE", "TOO_MANY_NODES", "UNSUPPORTED_CONTRACT_VERSION", "INVALID_TYPE", "UNKNOWN_KEY", "REQUIRED",
    "INVALID_VALUE", "TOO_LONG", "NOT_PLAIN_TEXT", "INVALID_CODE", "DUPLICATE_CODE", "ORDER_NOT_CONTIGUOUS", "EMPTY_LIST", "BAD_DEPTH",
    "MAPPING_NOT_UNIT", "RANGE_INVALID", "DUPLICATE_TOPIC", "DUPLICATE_TOPIC_IN_SECTION", "WEIGHTS_INVALID", "MISSING_TOPIC",
    "TOPIC_INACTIVE", "EXAM_MISMATCH", "CYCLE_NOT_FOUND", "DRAFT_EXISTS", "TOO_MANY_ERRORS",
  ].includes(v);

/**
 * Parses an error raised by fn_syllabus_import_draft ('SYLLABUS_IMPORT_INVALID: <CODE> at <path>: …') into a typed
 * error with a curated message; only the known code and the JSON path are taken from the database text.
 */
export function parseImportRpcError(message: unknown): ImportError | null {
  if (typeof message !== "string") return null;
  const m = RPC_ERROR_RE.exec(message);
  if (!m || !isImportErrorCode(m[1])) return null;
  return { code: m[1], path: m[2], message: RPC_MESSAGES[m[1]] ?? `The server rejected the file (${m[1]}).` };
}
