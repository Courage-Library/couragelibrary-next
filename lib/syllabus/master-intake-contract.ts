/**
 * SYLLABUS-MAP-1 B1: the MASTER_INTAKE v1 contract — adds or extends master nodes (exam-neutral) for ONE subject per
 * file (owner Q8). Pure, dependency-free, safe in client components; the importer (B2) and the database re-check it.
 *   { contract: "MASTER_INTAKE", contract_version: 1, subject: "<subject slug>", based_on?: "…",
 *     nodes: [
 *       { ref: "<subject>.<topic>[.<subtopic>]", outline?: [lines], aliases?: [names], name_hi?: "…" },     // existing
 *       { new: true, level: "TOPIC" | "SUBTOPIC", parent_ref: "<path>", name: "…", name_hi?, aliases?, outline?,
 *         subtopics?: [{ name, name_hi?, aliases?, outline? }] }                                               // proposed
 *     ] }
 * Items = nodes (incl. the subtopics of a new topic), ≤ 1000. Outline lines are NOT items (owner 2026-11-12): ≤ 30
 * per node and ≤ 6,000 per file. A new node is a proposal for the owner's review — never created by the validator.
 * Exam data (pattern, marks, weightage, exam names) has no place here.
 */
import { normalizeTaxonomyName } from "@/lib/taxonomy/normalize";
import {
  IssueCollector,
  MAP_BASED_ON_MAX,
  MAP_MAX_ITEMS,
  MASTER_OUTLINE_LINES_MAX,
  MASTER_PATH_RE,
  SLUG_RE,
  aliasList,
  checkKeys,
  isObject,
  outlineLines,
  parseJsonText,
  pathDepth,
  plainText,
  type ContractIssue,
} from "@/lib/syllabus/map-contract-common";

export const MASTER_INTAKE_CONTRACT = "MASTER_INTAKE";
export const MASTER_INTAKE_VERSION = 1;

const ROOT_KEYS = ["contract", "contract_version", "subject", "based_on", "nodes"] as const;
const EXISTING_KEYS = ["ref", "outline", "aliases", "name_hi"] as const;
const NEW_KEYS = ["new", "level", "parent_ref", "name", "name_hi", "aliases", "outline", "subtopics"] as const;
const NEW_SUB_KEYS = ["name", "name_hi", "aliases", "outline"] as const;
const EXAM_DATA: Record<string, [string, string]> = Object.fromEntries(
  ["questions", "marks", "weightage_tier", "avg_questions", "duration_minutes", "negative_marking", "exam", "papers"].map((k) => [k, ["EXAM_DATA_IN_MASTER", `"${k}" is exam data: it belongs in an EXAM_MAP file, not in the master.`]]),
);

export type MasterLevel = "TOPIC" | "SUBTOPIC";

export interface MasterIntakeItem {
  /** stable key inside the file: "n3" or "n3.s1" */
  key: string;
  kind: "EXISTING" | "NEW";
  level: MasterLevel;
  /** EXISTING: the node's path */
  ref: string | null;
  /** NEW: the parent path (a new subtopic of a new topic has parentKey instead) */
  parentRef: string | null;
  parentKey: string | null;
  name: string | null;
  nameHi: string | null;
  aliases: string[];
  outline: string[] | null;
}

export interface MasterIntake {
  subject: string;
  basedOn: string | null;
  items: MasterIntakeItem[];
  stats: { items: number; outlineLines: number; existing: number; new: number };
}

export type MasterIntakeResult = { ok: true; value: MasterIntake; warnings: ContractIssue[] } | { ok: false; errors: ContractIssue[]; warnings: ContractIssue[] };

export function validateMasterIntake(input: unknown): MasterIntakeResult {
  const c = new IssueCollector();
  const raw = typeof input === "string" ? parseJsonText(c, input) : input;
  if (c.errors.length) return { ok: false, errors: c.errors, warnings: c.warnings };
  if (!isObject(raw)) return { ok: false, errors: [{ code: "INVALID_TYPE", path: "$", message: "The file must be one JSON object." }], warnings: [] };

  checkKeys(c, raw, ROOT_KEYS, "$", EXAM_DATA);
  if (raw.contract !== MASTER_INTAKE_CONTRACT) c.error("WRONG_CONTRACT", "$.contract", `Must be "${MASTER_INTAKE_CONTRACT}".`);
  if (raw.contract_version !== MASTER_INTAKE_VERSION) c.error("WRONG_VERSION", "$.contract_version", `Must be ${MASTER_INTAKE_VERSION}.`);
  const subject = typeof raw.subject === "string" && SLUG_RE.test(raw.subject) ? raw.subject : null;
  if (!subject) c.error("INVALID_VALUE", "$.subject", "The subject's slug (one file per subject), e.g. \"english-comprehension\".");
  const basedOn = plainText(c, raw.based_on, "$.based_on", { required: false, max: MAP_BASED_ON_MAX });
  if (!Array.isArray(raw.nodes) || raw.nodes.length === 0) {
    c.error("MISSING", "$.nodes", "At least one node.");
    return { ok: false, errors: c.errors, warnings: c.warnings };
  }

  const items: MasterIntakeItem[] = [];
  let count = 0; // nodes seen, incl. the ones past the cap
  /** false once the file has more than MAP_MAX_ITEMS nodes (reported once) */
  const room = (path: string) => {
    count += 1;
    if (count === MAP_MAX_ITEMS + 1) c.error("TOO_MANY_ITEMS", path, `More than ${MAP_MAX_ITEMS} nodes in one file (outline lines do not count).`);
    return count <= MAP_MAX_ITEMS;
  };
  const refs = new Set<string>();
  const newNames = new Map<string, string>(); // parent + normalized name → path of the first one
  let lines = 0;
  const countLines = (o: string[] | null) => (lines += o ? o.length : 0);
  const underSubject = (p: string) => !!subject && (p === subject || p.startsWith(`${subject}.`));

  raw.nodes.forEach((n, i) => {
    const p = `$.nodes[${i}]`;
    if (!room(p)) return;
    if (!isObject(n)) {
      c.error("INVALID_TYPE", p, "Each node is an object.");
      return;
    }
    if (n.new === true) {
      checkKeys(c, n, NEW_KEYS, p, EXAM_DATA);
      const level = n.level === "TOPIC" || n.level === "SUBTOPIC" ? (n.level as MasterLevel) : null;
      if (!level) c.error("INVALID_VALUE", `${p}.level`, 'A new node is a "TOPIC" or a "SUBTOPIC".');
      const parentRef = typeof n.parent_ref === "string" && MASTER_PATH_RE.test(n.parent_ref) ? n.parent_ref : null;
      if (!parentRef) c.error("INVALID_VALUE", `${p}.parent_ref`, "The parent's path, e.g. \"english-comprehension\" or \"english-comprehension.antonyms\".");
      else if (!underSubject(parentRef)) c.error("OTHER_SUBJECT", `${p}.parent_ref`, `Must be under "${subject}" (one file per subject).`);
      else if (level === "TOPIC" && pathDepth(parentRef) !== 1) c.error("WRONG_PARENT", `${p}.parent_ref`, "A new topic's parent is the subject itself.");
      else if (level === "SUBTOPIC" && pathDepth(parentRef) !== 2) c.error("WRONG_PARENT", `${p}.parent_ref`, "A new subtopic's parent is a topic (subject.topic).");
      const name = plainText(c, n.name, `${p}.name`);
      const nameHi = plainText(c, n.name_hi, `${p}.name_hi`, { required: false });
      const aliases = aliasList(c, n.aliases, `${p}.aliases`);
      const outline = n.outline === undefined ? null : outlineLines(c, n.outline, `${p}.outline`);
      countLines(outline);
      if (name && parentRef) {
        const k = `${parentRef}|${normalizeTaxonomyName(name)}`;
        if (newNames.has(k)) c.error("DUPLICATE_NEW", `${p}.name`, `"${name}" is proposed twice under ${parentRef} (first at ${newNames.get(k)}).`);
        else newNames.set(k, p);
      }
      const key = `n${i}`;
      items.push({ key, kind: "NEW", level: level ?? "TOPIC", ref: null, parentRef, parentKey: null, name, nameHi, aliases, outline });
      if (n.subtopics !== undefined) {
        if (level !== "TOPIC") c.error("INVALID_VALUE", `${p}.subtopics`, "Only a new topic lists new subtopics.");
        else if (!Array.isArray(n.subtopics)) c.error("INVALID_TYPE", `${p}.subtopics`, "A list of subtopics.");
        else {
          const subNames = new Set<string>();
          n.subtopics.forEach((s, j) => {
            const sp = `${p}.subtopics[${j}]`;
            if (!room(sp)) return;
            if (!isObject(s)) {
              c.error("INVALID_TYPE", sp, "Each subtopic is an object.");
              return;
            }
            checkKeys(c, s, NEW_SUB_KEYS, sp, EXAM_DATA);
            const sName = plainText(c, s.name, `${sp}.name`);
            if (sName && subNames.has(normalizeTaxonomyName(sName))) c.error("DUPLICATE_NEW", `${sp}.name`, `"${sName}" appears twice in this topic.`);
            if (sName) subNames.add(normalizeTaxonomyName(sName));
            const sOutline = s.outline === undefined ? null : outlineLines(c, s.outline, `${sp}.outline`);
            countLines(sOutline);
            items.push({ key: `${key}.s${j}`, kind: "NEW", level: "SUBTOPIC", ref: null, parentRef: null, parentKey: key, name: sName, nameHi: plainText(c, s.name_hi, `${sp}.name_hi`, { required: false }), aliases: aliasList(c, s.aliases, `${sp}.aliases`), outline: sOutline });
          });
        }
      }
      return;
    }

    // an existing node, addressed by its path
    checkKeys(c, n, EXISTING_KEYS, p, { ...EXAM_DATA, new: ["INVALID_VALUE", '"new" must be exactly true for a proposed node (omit it for an existing one).'], name: ["INVALID_VALUE", 'An existing node is addressed by "ref" only; renaming is not done through an intake.'] });
    const ref = typeof n.ref === "string" && MASTER_PATH_RE.test(n.ref) ? n.ref : null;
    if (!ref) c.error("INVALID_VALUE", `${p}.ref`, "The node's path, e.g. \"english-comprehension.antonyms\".");
    else if (!underSubject(ref)) c.error("OTHER_SUBJECT", `${p}.ref`, `Must be under "${subject}" (one file per subject).`);
    else if (pathDepth(ref) < 2 || pathDepth(ref) > 3) c.error("WRONG_LEVEL", `${p}.ref`, "A topic (subject.topic) or a subtopic (subject.topic.subtopic).");
    else if (refs.has(ref)) c.error("DUPLICATE_REF", `${p}.ref`, `${ref} appears twice in this file.`);
    if (ref) refs.add(ref);
    const outline = n.outline === undefined ? null : outlineLines(c, n.outline, `${p}.outline`);
    countLines(outline);
    const aliases = aliasList(c, n.aliases, `${p}.aliases`);
    const nameHi = plainText(c, n.name_hi, `${p}.name_hi`, { required: false });
    if (n.outline === undefined && n.aliases === undefined && n.name_hi === undefined) c.warn("NOTHING_TO_CHANGE", p, `${ref ?? "This node"} brings no outline, alias or Hindi name.`);
    items.push({ key: `n${i}`, kind: "EXISTING", level: ref && pathDepth(ref) === 3 ? "SUBTOPIC" : "TOPIC", ref, parentRef: null, parentKey: null, name: null, nameHi, aliases, outline });
  });

  if (lines > MASTER_OUTLINE_LINES_MAX) c.error("TOO_MANY_OUTLINE_LINES", "$.nodes", `${lines} outline lines in one file; at most ${MASTER_OUTLINE_LINES_MAX}. Split the subject's topics into two files.`);
  if (c.errors.length) return { ok: false, errors: c.errors, warnings: c.warnings };
  return {
    ok: true,
    value: {
      subject: subject as string,
      basedOn,
      items,
      stats: { items: items.length, outlineLines: lines, existing: items.filter((x) => x.kind === "EXISTING").length, new: items.filter((x) => x.kind === "NEW").length },
    },
    warnings: c.warnings,
  };
}
