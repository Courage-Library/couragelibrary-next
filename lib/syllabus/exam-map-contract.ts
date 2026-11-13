/**
 * SYLLABUS-MAP-1 B1: the EXAM_MAP v1 contract — ONE exam's pattern + its map onto the shared master tree + per-exam
 * weightage + the selection process. No outlines, no lesson content (those live once on the master: MASTER_INTAKE).
 * Pure, dependency-free, safe in client components; the importer (B2) and the database re-check it.
 *   { contract: "EXAM_MAP", contract_version: 1, exam: "<slug>", cycle_year: 2026 | null, tier: "<slug>" | null,
 *     based_on: "…", source_url: "https://…", as_of: "YYYY-MM-DD",
 *     papers: [{ name, name_hi?, questions, marks, duration_minutes?, negative_marking?,
 *       choice_groups?: [{ id, label, pick }],
 *       sections: [{ name, name_hi?, questions, marks, duration_minutes?, choice_group?,
 *         map: [ { ref } | { name, aliases? } | { new: true, level, parent_ref, name, name_hi?, name_en?, aliases? }
 *                + weightage_tier?, avg_questions?, origin? ] }] }],
 *     selection_process?: [{ stage, name, nature, paper?, details?, uncertain?, uncertain_reason? }] }
 * HARD errors (the SSC GD 2026 failures, design §2.B):
 *   (a) sections outside groups + `pick` members of each group must add up to the paper's questions AND marks
 *   (b) the members of one group have equal questions, marks and time; a group has more members than it picks
 *   (c) a non-written stage (PET, PST, medical, document verification, interview, typing / skill test) is never a paper
 *   (d) every paper has a section, every section a map entry
 *   (e) an "outline" anywhere → error (outlines belong to MASTER_INTAKE)
 * WARNING: (f) a section's Σ avg_questions more than 20 % away from its questions; sectional times that do not add up.
 * Items = sections + map entries, ≤ 1000.
 */
import { WEIGHTAGE_TIERS } from "@/lib/syllabus/import-contract";
import {
  IssueCollector,
  MAP_BASED_ON_MAX,
  MAP_MAX_ITEMS,
  MASTER_PATH_RE,
  SLUG_RE,
  aliasList,
  checkKeys,
  isObject,
  parseJsonText,
  pathDepth,
  plainText,
  wholeNumber,
  type ContractIssue,
} from "@/lib/syllabus/map-contract-common";

export const EXAM_MAP_CONTRACT = "EXAM_MAP";
export const EXAM_MAP_VERSION = 1;
export const EXAM_MAP_ORIGINS = ["OFFICIAL", "PYQ_TREND", "EXPANDED"] as const;
/** = exam_selection_stages.stage_kind (migration 138) */
export const SELECTION_STAGE_KINDS = ["CBT", "WRITTEN", "TYPING", "SKILL", "PET", "PST", "MEDICAL", "DV", "INTERVIEW", "OTHER"] as const;
export const SELECTION_NATURES = ["QUALIFYING", "MERIT"] as const;
export const SELECTION_STAGES_MAX = 20;
export const AVG_QUESTIONS_TOLERANCE = 0.2;
/** A paper with one of these names is a selection stage, not a written paper (rule c). */
export const NON_WRITTEN_PAPER_RE =
  /\b(PET|PST|PMT|physical\s+(efficiency|standard|endurance|measurement)|medical|document\s+verification|DV|interview|personality\s+test|typing|skill\s+test|trade\s+test)\b/i;

export type SelectionStageKind = (typeof SELECTION_STAGE_KINDS)[number];
export type SelectionNature = (typeof SELECTION_NATURES)[number];

export interface ExamMapEntry {
  key: string;
  kind: "REF" | "NAME" | "NEW";
  ref: string | null;
  name: string | null;
  aliases: string[];
  level: "TOPIC" | "SUBTOPIC" | null;
  parentRef: string | null;
  nameHi: string | null;
  nameEn: string | null;
  weightageTier: (typeof WEIGHTAGE_TIERS)[number] | null;
  avgQuestions: number | null;
  origin: (typeof EXAM_MAP_ORIGINS)[number] | null;
}
export interface ExamMapSection {
  key: string;
  name: string;
  nameHi: string | null;
  questions: number;
  marks: number;
  durationMinutes: number | null;
  choiceGroup: string | null;
  map: ExamMapEntry[];
}
export interface ExamMapPaper {
  key: string;
  name: string;
  nameHi: string | null;
  questions: number;
  marks: number;
  durationMinutes: number | null;
  negativeMarking: number | string | null;
  choiceGroups: { id: string; label: string; pick: number }[];
  sections: ExamMapSection[];
}
export interface ExamMapStage {
  position: number;
  stage: SelectionStageKind;
  name: string;
  nature: SelectionNature;
  paper: string | null;
  details: Record<string, string | number | boolean>;
  uncertain: boolean;
  uncertainReason: string | null;
}
export interface ExamMap {
  exam: string;
  cycleYear: number | null;
  tier: string | null;
  basedOn: string;
  sourceUrl: string;
  asOf: string;
  papers: ExamMapPaper[];
  selectionProcess: ExamMapStage[];
  stats: { items: number; papers: number; sections: number; entries: number; newEntries: number };
}
export type ExamMapResult = { ok: true; value: ExamMap; warnings: ContractIssue[] } | { ok: false; errors: ContractIssue[]; warnings: ContractIssue[] };

const ROOT_KEYS = ["contract", "contract_version", "exam", "cycle_year", "tier", "based_on", "source_url", "as_of", "papers", "selection_process"] as const;
const PAPER_KEYS = ["name", "name_hi", "questions", "marks", "duration_minutes", "negative_marking", "choice_groups", "sections"] as const;
const GROUP_KEYS = ["id", "label", "pick"] as const;
const SECTION_KEYS = ["name", "name_hi", "questions", "marks", "duration_minutes", "choice_group", "map"] as const;
const ENTRY_KEYS = ["ref", "name", "aliases", "new", "level", "parent_ref", "name_hi", "name_en", "weightage_tier", "avg_questions", "origin"] as const;
const STAGE_KEYS = ["stage", "name", "nature", "paper", "details", "uncertain", "uncertain_reason"] as const;
const NO_OUTLINE: Record<string, [string, string]> = {
  outline: ["OUTLINE_IN_EXAM_MAP", "Outlines belong to the master (a MASTER_INTAKE file), never to an exam map."],
  subtopics: ["OUTLINE_IN_EXAM_MAP", "An exam map lists master refs, not a tree: list each subtopic as its own map entry (or a new node)."],
  concepts: ["OUTLINE_IN_EXAM_MAP", "Concepts and outlines belong to the master, never to an exam map."],
};

function negativeMarking(c: IssueCollector, v: unknown, path: string): number | string | null {
  if (v === undefined || v === null) return null;
  if (typeof v === "number" && v >= 0 && v <= 10) return v;
  if (typeof v === "string") return plainText(c, v, path);
  c.error("INVALID_VALUE", path, 'A number of marks (e.g. 0.25) or a short text (e.g. "0.25 per wrong answer").');
  return null;
}

export function validateExamMap(input: unknown): ExamMapResult {
  const c = new IssueCollector();
  const raw = typeof input === "string" ? parseJsonText(c, input) : input;
  if (c.errors.length) return { ok: false, errors: c.errors, warnings: c.warnings };
  if (!isObject(raw)) return { ok: false, errors: [{ code: "INVALID_TYPE", path: "$", message: "The file must be one JSON object." }], warnings: [] };

  checkKeys(c, raw, ROOT_KEYS, "$", NO_OUTLINE);
  if (raw.contract !== EXAM_MAP_CONTRACT) c.error("WRONG_CONTRACT", "$.contract", `Must be "${EXAM_MAP_CONTRACT}".`);
  if (raw.contract_version !== EXAM_MAP_VERSION) c.error("WRONG_VERSION", "$.contract_version", `Must be ${EXAM_MAP_VERSION}.`);
  const exam = typeof raw.exam === "string" && SLUG_RE.test(raw.exam) ? raw.exam : null;
  if (!exam) c.error("INVALID_VALUE", "$.exam", 'The exam\'s slug, e.g. "ssc-gd-constable".');
  const cycleYear = raw.cycle_year === null ? null : wholeNumber(c, raw.cycle_year, "$.cycle_year", { required: true, min: 2000, max: 2100 });
  const tier = raw.tier === null || raw.tier === undefined ? null : typeof raw.tier === "string" && SLUG_RE.test(raw.tier) && raw.tier.length <= 40 ? raw.tier : (c.error("INVALID_VALUE", "$.tier", 'A short slug such as "tier-1", or null.'), null);
  const basedOn = plainText(c, raw.based_on, "$.based_on", { max: MAP_BASED_ON_MAX });
  const sourceUrl = typeof raw.source_url === "string" && /^https:\/\/[^\s<>"]+$/.test(raw.source_url) && raw.source_url.length <= 500 ? raw.source_url : null;
  if (!sourceUrl) c.error("INVALID_VALUE", "$.source_url", "The official notice / syllabus link (https://…).");
  const asOf = typeof raw.as_of === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.as_of) && !Number.isNaN(Date.parse(`${raw.as_of}T00:00:00Z`)) ? raw.as_of : null;
  if (!asOf) c.error("INVALID_VALUE", "$.as_of", "The date the source was read (YYYY-MM-DD).");

  let items = 0;
  const room = (path: string) => {
    items += 1;
    if (items === MAP_MAX_ITEMS + 1) c.error("TOO_MANY_ITEMS", path, `More than ${MAP_MAX_ITEMS} sections and map entries in one file.`);
    return items <= MAP_MAX_ITEMS;
  };

  const papers: ExamMapPaper[] = [];
  if (!Array.isArray(raw.papers) || raw.papers.length === 0) c.error("MISSING", "$.papers", "At least one written paper.");
  const refSeen = new Map<string, string>();
  (Array.isArray(raw.papers) ? raw.papers : []).forEach((pp, pi) => {
    const p = `$.papers[${pi}]`;
    if (!isObject(pp)) return c.error("INVALID_TYPE", p, "Each paper is an object.");
    checkKeys(c, pp, PAPER_KEYS, p, NO_OUTLINE);
    const name = plainText(c, pp.name, `${p}.name`);
    // (c) a physical / medical / document / interview stage is never a written paper
    if (name && NON_WRITTEN_PAPER_RE.test(name))
      c.error("STAGE_AS_PAPER", `${p}.name`, `"${name}" is a selection stage, not a written paper: list it under selection_process.`);
    const questions = wholeNumber(c, pp.questions, `${p}.questions`, { required: true, min: 1, max: 1000 });
    const marks = wholeNumber(c, pp.marks, `${p}.marks`, { required: true, min: 1, max: 10000 });
    const duration = wholeNumber(c, pp.duration_minutes, `${p}.duration_minutes`, { min: 1, max: 1440 });

    const groups: { id: string; label: string; pick: number }[] = [];
    if (pp.choice_groups !== undefined) {
      if (!Array.isArray(pp.choice_groups)) c.error("INVALID_TYPE", `${p}.choice_groups`, "A list of groups.");
      else
        pp.choice_groups.forEach((g, gi) => {
          const gp = `${p}.choice_groups[${gi}]`;
          if (!isObject(g)) return c.error("INVALID_TYPE", gp, "Each group is an object.");
          checkKeys(c, g, GROUP_KEYS, gp);
          const id = typeof g.id === "string" && SLUG_RE.test(g.id) && g.id.length <= 40 ? g.id : (c.error("INVALID_VALUE", `${gp}.id`, 'A short slug, e.g. "language".'), null);
          const label = plainText(c, g.label, `${gp}.label`, { max: 120 });
          const pick = wholeNumber(c, g.pick, `${gp}.pick`, { required: true, min: 1, max: 10 });
          if (id && groups.some((x) => x.id === id)) c.error("DUPLICATE_GROUP", `${gp}.id`, `Group "${id}" is declared twice.`);
          if (id && label && pick) groups.push({ id, label, pick });
        });
    }

    const sections: ExamMapSection[] = [];
    if (!Array.isArray(pp.sections) || pp.sections.length === 0) c.error("EMPTY_PAPER", `${p}.sections`, "A paper has at least one section."); // (d)
    (Array.isArray(pp.sections) ? pp.sections : []).forEach((ss, si) => {
      const s = `${p}.sections[${si}]`;
      if (!room(s)) return;
      if (!isObject(ss)) return c.error("INVALID_TYPE", s, "Each section is an object.");
      checkKeys(c, ss, SECTION_KEYS, s, NO_OUTLINE);
      const sName = plainText(c, ss.name, `${s}.name`);
      const sq = wholeNumber(c, ss.questions, `${s}.questions`, { required: true, min: 1, max: 1000 });
      const sm = wholeNumber(c, ss.marks, `${s}.marks`, { required: true, min: 1, max: 10000 });
      const sd = wholeNumber(c, ss.duration_minutes, `${s}.duration_minutes`, { min: 1, max: 1440 });
      let group: string | null = null;
      if (ss.choice_group !== undefined && ss.choice_group !== null) {
        if (typeof ss.choice_group === "string" && groups.some((g) => g.id === ss.choice_group)) group = ss.choice_group;
        else c.error("UNKNOWN_GROUP", `${s}.choice_group`, `Declare the group in this paper's choice_groups first (got ${JSON.stringify(ss.choice_group)}).`);
      }
      const map: ExamMapEntry[] = [];
      if (!Array.isArray(ss.map) || ss.map.length === 0) c.error("EMPTY_SECTION", `${s}.map`, "A section maps to at least one master topic or subtopic."); // (d)
      const localRefs = new Set<string>();
      (Array.isArray(ss.map) ? ss.map : []).forEach((ee, ei) => {
        const e = `${s}.map[${ei}]`;
        if (!room(e)) return;
        if (!isObject(ee)) return c.error("INVALID_TYPE", e, "Each map entry is an object.");
        checkKeys(c, ee, ENTRY_KEYS, e, NO_OUTLINE);
        const tierV = ee.weightage_tier === undefined || ee.weightage_tier === null ? null : (WEIGHTAGE_TIERS as readonly string[]).includes(ee.weightage_tier as string) ? (ee.weightage_tier as ExamMapEntry["weightageTier"]) : (c.error("INVALID_VALUE", `${e}.weightage_tier`, `One of ${WEIGHTAGE_TIERS.join(", ")}.`), null);
        const avg = ee.avg_questions === undefined || ee.avg_questions === null ? null : typeof ee.avg_questions === "number" && ee.avg_questions >= 0 && ee.avg_questions <= 1000 ? ee.avg_questions : (c.error("INVALID_VALUE", `${e}.avg_questions`, "A number of questions from 0 to 1000."), null);
        const origin = ee.origin === undefined || ee.origin === null ? null : (EXAM_MAP_ORIGINS as readonly string[]).includes(ee.origin as string) ? (ee.origin as ExamMapEntry["origin"]) : (c.error("INVALID_VALUE", `${e}.origin`, `One of ${EXAM_MAP_ORIGINS.join(", ")}.`), null);
        const base = { key: `p${pi}.s${si}.e${ei}`, weightageTier: tierV, avgQuestions: avg, origin, aliases: [] as string[], level: null, parentRef: null, nameHi: null, nameEn: null, ref: null, name: null };
        if (ee.new === true) {
          const level = ee.level === "TOPIC" || ee.level === "SUBTOPIC" ? ee.level : (c.error("INVALID_VALUE", `${e}.level`, 'A new node is a "TOPIC" or a "SUBTOPIC".'), null);
          const parentRef = typeof ee.parent_ref === "string" && MASTER_PATH_RE.test(ee.parent_ref) ? ee.parent_ref : (c.error("INVALID_VALUE", `${e}.parent_ref`, "The master parent's path (a subject for a topic, subject.topic for a subtopic)."), null);
          if (level && parentRef && pathDepth(parentRef) !== (level === "TOPIC" ? 1 : 2)) c.error("WRONG_PARENT", `${e}.parent_ref`, level === "TOPIC" ? "A new topic's parent is a subject." : "A new subtopic's parent is a topic (subject.topic).");
          map.push({ ...base, kind: "NEW", level, parentRef, name: plainText(c, ee.name, `${e}.name`), nameHi: plainText(c, ee.name_hi, `${e}.name_hi`, { required: false }), nameEn: plainText(c, ee.name_en, `${e}.name_en`, { required: false }), aliases: aliasList(c, ee.aliases, `${e}.aliases`) });
        } else if (ee.ref !== undefined) {
          if (ee.new !== undefined) c.error("INVALID_VALUE", `${e}.new`, '"new" is exactly true, or left out.');
          if (ee.name !== undefined) c.error("INVALID_VALUE", `${e}.name`, 'Give "ref" OR "name", not both.');
          const ref = typeof ee.ref === "string" && MASTER_PATH_RE.test(ee.ref) && pathDepth(ee.ref) >= 2 && pathDepth(ee.ref) <= 3 ? ee.ref : null;
          if (!ref) c.error("INVALID_VALUE", `${e}.ref`, 'A master topic or subtopic path, e.g. "english-comprehension.antonyms".');
          else if (localRefs.has(ref)) c.error("DUPLICATE_REF", `${e}.ref`, `${ref} is listed twice in this section.`);
          else {
            localRefs.add(ref);
            if (refSeen.has(ref) && !group) c.warn("REF_IN_TWO_SECTIONS", `${e}.ref`, `${ref} is also mapped at ${refSeen.get(ref)}.`);
            refSeen.set(ref, e);
          }
          map.push({ ...base, kind: "REF", ref });
        } else {
          if (ee.new !== undefined) c.error("INVALID_VALUE", `${e}.new`, '"new" is exactly true, or left out.');
          const nm = plainText(c, ee.name, `${e}.name`);
          if (!nm && ee.name === undefined) c.error("MISSING", e, 'Each entry has "ref" (preferred), "name", or "new": true.');
          map.push({ ...base, kind: "NAME", name: nm, aliases: aliasList(c, ee.aliases, `${e}.aliases`) });
        }
      });
      // (f) weightage spread vs the section's questions — a warning
      const avgs = map.map((m) => m.avgQuestions).filter((x): x is number => x !== null);
      if (sq && avgs.length === map.length && map.length > 0) {
        const total = avgs.reduce((a, b) => a + b, 0);
        if (Math.abs(total - sq) > sq * AVG_QUESTIONS_TOLERANCE) c.warn("AVG_QUESTIONS_SPREAD", `${s}.map`, `Σ avg_questions ${total} is more than ${AVG_QUESTIONS_TOLERANCE * 100} % away from the section's ${sq} questions.`);
      }
      if (sName && sq && sm) sections.push({ key: `p${pi}.s${si}`, name: sName, nameHi: plainText(c, ss.name_hi, `${s}.name_hi`, { required: false }), questions: sq, marks: sm, durationMinutes: sd, choiceGroup: group, map });
    });

    // (b) groups: members alike, more members than picked, every declared group used
    for (const g of groups) {
      const members = sections.filter((x) => x.choiceGroup === g.id);
      if (members.length <= g.pick) c.error("GROUP_TOO_SMALL", `${p}.choice_groups`, `Group "${g.id}" picks ${g.pick} but has ${members.length} member section(s): an alternative needs more members than it picks.`);
      const differs = (k: "questions" | "marks" | "durationMinutes") => new Set(members.map((m) => m[k])).size > 1;
      if (members.length > 1 && (differs("questions") || differs("marks") || differs("durationMinutes")))
        c.error("GROUP_MEMBERS_DIFFER", `${p}.sections`, `The sections of group "${g.id}" (${members.map((m) => m.name).join(" / ")}) must have the same questions, marks and time — a candidate takes any ${g.pick} of them.`);
    }
    // (a) the pattern adds up: sections outside groups + `pick` members of each group
    if (questions && marks && sections.length) {
      const plain = sections.filter((x) => !x.choiceGroup);
      const sum = (k: "questions" | "marks") => plain.reduce((a, x) => a + x[k], 0) + groups.reduce((a, g) => a + g.pick * (sections.find((x) => x.choiceGroup === g.id)?.[k] ?? 0), 0);
      if (sum("questions") !== questions) c.error("SUM_MISMATCH", `${p}.questions`, `The sections add up to ${sum("questions")} questions (alternatives counted ${groups.length ? "once per pick" : "—"}), the paper says ${questions}.`);
      if (sum("marks") !== marks) c.error("SUM_MISMATCH", `${p}.marks`, `The sections add up to ${sum("marks")} marks, the paper says ${marks}.`);
      if (duration && sections.every((x) => x.durationMinutes !== null)) {
        const t = plain.reduce((a, x) => a + (x.durationMinutes ?? 0), 0) + groups.reduce((a, g) => a + g.pick * (sections.find((x) => x.choiceGroup === g.id)?.durationMinutes ?? 0), 0);
        if (t !== duration) c.warn("TIME_MISMATCH", `${p}.duration_minutes`, `The sectional times add up to ${t} minutes, the paper says ${duration}.`);
      }
    }
    if (name && questions && marks) papers.push({ key: `p${pi}`, name, nameHi: plainText(c, pp.name_hi, `${p}.name_hi`, { required: false }), questions, marks, durationMinutes: duration, negativeMarking: negativeMarking(c, pp.negative_marking, `${p}.negative_marking`), choiceGroups: groups, sections });
  });
  const paperNames = new Set(papers.map((x) => x.name.toLowerCase()));
  if (papers.length !== new Set(papers.map((x) => x.name.toLowerCase())).size) c.error("DUPLICATE_PAPER", "$.papers", "Two papers have the same name.");

  // selection process — the non-written stages live here (rule c)
  const stages: ExamMapStage[] = [];
  if (raw.selection_process === undefined) c.warn("NO_SELECTION_PROCESS", "$.selection_process", "No selection process: the exam info page will not show the stages.");
  else if (!Array.isArray(raw.selection_process) || raw.selection_process.length === 0 || raw.selection_process.length > SELECTION_STAGES_MAX)
    c.error("INVALID_VALUE", "$.selection_process", `1–${SELECTION_STAGES_MAX} stages, in order.`);
  else
    raw.selection_process.forEach((st, i) => {
      const sp = `$.selection_process[${i}]`;
      if (!isObject(st)) return c.error("INVALID_TYPE", sp, "Each stage is an object.");
      checkKeys(c, st, STAGE_KEYS, sp);
      const kind = (SELECTION_STAGE_KINDS as readonly string[]).includes(st.stage as string) ? (st.stage as SelectionStageKind) : (c.error("INVALID_VALUE", `${sp}.stage`, `One of ${SELECTION_STAGE_KINDS.join(", ")}.`), null);
      const name = plainText(c, st.name, `${sp}.name`, { min: 2, max: 120 });
      const nature = (SELECTION_NATURES as readonly string[]).includes(st.nature as string) ? (st.nature as SelectionNature) : (c.error("INVALID_VALUE", `${sp}.nature`, `"QUALIFYING" or "MERIT".`), null);
      const paper = st.paper === undefined || st.paper === null ? null : plainText(c, st.paper, `${sp}.paper`);
      if (paper && kind && kind !== "CBT" && kind !== "WRITTEN") c.error("INVALID_VALUE", `${sp}.paper`, "Only a written stage (CBT / WRITTEN) points at a paper.");
      else if (paper && !paperNames.has(paper.toLowerCase())) c.error("UNKNOWN_PAPER", `${sp}.paper`, `No paper named "${paper}" in this file.`);
      const details: Record<string, string | number | boolean> = {};
      if (st.details !== undefined) {
        if (!isObject(st.details) || Object.keys(st.details).length > 20) c.error("INVALID_VALUE", `${sp}.details`, "An object of at most 20 plain values (e.g. { \"male\": \"5 km in 24 minutes\" }).");
        else
          for (const [k, v] of Object.entries(st.details)) {
            if (!/^[a-z0-9_]{1,40}$/.test(k)) c.error("INVALID_VALUE", `${sp}.details.${k}`, "Keys are short lower-case words (a–z, 0–9, _).");
            else if (typeof v === "number" || typeof v === "boolean") details[k] = v;
            else {
              const t = plainText(c, v, `${sp}.details.${k}`);
              if (t) details[k] = t;
            }
          }
      }
      const uncertain = st.uncertain === true;
      const reason = plainText(c, st.uncertain_reason, `${sp}.uncertain_reason`, { required: false, max: 500 });
      if (reason && !uncertain) c.error("INVALID_VALUE", `${sp}.uncertain_reason`, 'Give a reason only with "uncertain": true.');
      if (kind && name && nature) stages.push({ position: i + 1, stage: kind, name, nature, paper, details, uncertain, uncertainReason: reason });
    });

  if (c.errors.length) return { ok: false, errors: c.errors, warnings: c.warnings };
  const sections = papers.flatMap((x) => x.sections);
  const entries = sections.flatMap((x) => x.map);
  return {
    ok: true,
    value: {
      exam: exam as string,
      cycleYear,
      tier,
      basedOn: basedOn as string,
      sourceUrl: sourceUrl as string,
      asOf: asOf as string,
      papers,
      selectionProcess: stages,
      stats: { items, papers: papers.length, sections: sections.length, entries: entries.length, newEntries: entries.filter((x) => x.kind === "NEW").length },
    },
    warnings: c.warnings,
  };
}
