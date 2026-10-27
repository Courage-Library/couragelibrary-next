/**
 * CA-4: STRUCTURE PARITY between an English lesson and its Hindi translation — pure; the database enforces the same
 * rules (fn_lesson_parity_errors, migration 119) at Hindi draft save and publish. A translation may change WORDS only:
 *   - the same blocks: ids, types, order; the same heading levels, list order flags + item counts, callout variants,
 *     trap kinds, table shapes, solved-example difficulty + step counts, summary counts, Memory Lock point counts
 *   - the same formulas (LaTeX), step math and summary formulas, character for character
 *   - the same answers: quick-check option ids, order and correct flags
 *   - the same images (asset id) and practice links (node + mode)
 *   - the same numbers: the ASCII numbers (e.g. 12, 3.5) in each block, as a sorted list
 */
import type { LessonBlock } from "@/lib/lessons/blocks";

export interface ParityError {
  index: number;
  id: string;
  code: string;
  message: string;
}

type B = Record<string, unknown>;
const len = (v: unknown) => (Array.isArray(v) ? v.length : -1);

/** Every ASCII number in the string values of a block (ids and types included — they must be equal anyway). */
export function blockNumbers(b: unknown): string[] {
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") for (const m of v.matchAll(/[0-9]+(?:\.[0-9]+)?/g)) out.push(m[0]);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(b);
  return out.sort();
}

export function parityErrors(en: LessonBlock[], hi: LessonBlock[]): ParityError[] {
  const errs: ParityError[] = [];
  if (en.length !== hi.length) {
    errs.push({ index: -1, id: "", code: "BLOCK_COUNT", message: `The translation has ${hi.length} blocks; the English lesson has ${en.length}.` });
    return errs;
  }
  en.forEach((eb, i) => {
    const e: B = { ...eb };
    const h: B = { ...hi[i] };
    const add = (code: string, message: string) => errs.push({ index: i, id: String(e.id), code, message });
    if (h.id !== e.id || h.type !== e.type) return add("BLOCK_MISMATCH", `Block ${i + 1} must be "${e.id}" (${e.type}); found "${String(h.id)}" (${String(h.type)}).`);
    const same = (k: string) => JSON.stringify(e[k] ?? null) === JSON.stringify(h[k] ?? null);
    switch (e.type) {
      case "heading":
        if (!same("level")) add("HEADING_LEVEL", "Heading level changed.");
        break;
      case "list":
        if (!same("ordered") || len(e.items) !== len(h.items)) add("LIST_SHAPE", "List type or item count changed.");
        break;
      case "formula":
        if (!same("latex")) add("FORMULA", "The formula changed (formulas are never translated).");
        break;
      case "solved_example": {
        const es = (e.steps as B[]) || [];
        const hs = (h.steps as B[]) || [];
        if (!same("difficulty") || es.length !== hs.length) add("EXAMPLE_SHAPE", "Difficulty or number of steps changed.");
        else if (es.some((s, j) => JSON.stringify(s.math ?? null) !== JSON.stringify(hs[j].math ?? null))) add("STEP_MATH", "Step math changed.");
        break;
      }
      case "callout":
        if (!same("variant")) add("CALLOUT_VARIANT", "Callout type changed.");
        break;
      case "trap":
        if (!same("kind")) add("TRAP_KIND", "Trap kind changed.");
        break;
      case "table": {
        const er = (e.rows as unknown[][]) || [];
        const hr = (h.rows as unknown[][]) || [];
        if (len(e.headers) !== len(h.headers) || er.length !== hr.length || er.some((r, j) => len(r) !== len(hr[j]))) add("TABLE_SHAPE", "Table shape changed.");
        break;
      }
      case "image":
        if (!same("asset_id")) add("IMAGE", "Image changed.");
        break;
      case "practice_link":
        if (!same("node_id") || !same("mode")) add("PRACTICE_LINK", "Practice link changed.");
        break;
      case "quick_check": {
        const key = (o: B) => `${String(o.id)}:${o.correct === true}`;
        const eo = ((e.options as B[]) || []).map(key).join(",");
        const ho = ((h.options as B[]) || []).map(key).join(",");
        if (eo !== ho) add("ANSWERS", "Quick-check options or correct answers changed.");
        break;
      }
      case "revision_summary":
        if (len(e.bullets) !== len(h.bullets) || !same("formulas") || len(e.speed_rules) !== len(h.speed_rules)) add("SUMMARY_SHAPE", "Summary bullets, formulas or speed rules changed.");
        break;
      case "memory_lock_points":
        if (len(e.points) !== len(h.points)) add("MEMORY_LOCK_COUNT", "Number of Memory Lock points changed.");
        break;
    }
    if (JSON.stringify(blockNumbers(e)) !== JSON.stringify(blockNumbers(h))) add("NUMBERS", "The numbers in this block changed (keep every number as in English).");
  });
  return errs;
}
