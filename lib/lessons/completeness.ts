/**
 * CA-4 / LESSON-PROMPT-2: the COMPLETENESS CHECKLIST for a generated lesson. Pure. Errors block publishing (the admin
 * action refuses to publish an English node lesson that fails); warnings are shown. The DB validator already guarantees
 * the blocks are SAFE; this checks they are COMPLETE as a study lesson. Weightage- and type-aware (template v2):
 *   - solved examples / quick checks: the SIZE minimums of the highest weightage (lessonSize in the prompt module)
 *   - every quick check: EXACTLY 4 options, exactly one correct, feedback on every option
 *   - at least 3 traps; an exam-strategy list (a "strategy" heading followed by a list); 5–10 Memory Lock points
 *   - formula blocks: REQUIRED for APTITUDE, FORBIDDEN for LANGUAGE (a warning when the subject type is unknown)
 */
import type { LessonBlock } from "@/lib/lessons/blocks";
import { lessonQualityWarnings, type LessonQualityContext } from "@/lib/lessons/quality";

/** The defaults when no weightage is known (template v1 sizes). */
export const LESSON_MIN_EXAMPLES = 10;
export const LESSON_MAX_EXAMPLES = 15;
export const LESSON_MIN_QUICK_CHECKS = 5;
export const LESSON_MIN_TRAPS = 3;
export const LESSON_MIN_MEMORY_POINTS = 5;

export interface LessonSizeRule {
  minExamples: number;
  maxExamples: number;
  quickChecks: number;
}

export interface ChecklistItem {
  key: string;
  label: string;
  ok: boolean;
  severity: "error" | "warning";
  detail: string;
}

/**
 * subjectType: the node's subject type; size: the SIZE rule of the highest weightage (defaults when unknown);
 * quality (LESSON-PROMPT-QUALITY-1): the lesson meta + node + exam names → the quality WARNINGS (lib/lessons/quality.ts).
 */
export function lessonChecklist(
  blocks: LessonBlock[],
  subjectType: string | null,
  size: LessonSizeRule = { minExamples: LESSON_MIN_EXAMPLES, maxExamples: LESSON_MAX_EXAMPLES, quickChecks: LESSON_MIN_QUICK_CHECKS },
  quality?: LessonQualityContext,
): ChecklistItem[] {
  const count = (t: LessonBlock["type"]) => blocks.filter((b) => b.type === t).length;
  const examples = blocks.filter((b): b is Extract<LessonBlock, { type: "solved_example" }> => b.type === "solved_example");
  const checks = blocks.filter((b): b is Extract<LessonBlock, { type: "quick_check" }> => b.type === "quick_check");
  const order = { EASY: 0, MEDIUM: 1, HARD: 2 } as const;
  const easyToHard = examples.every((ex, i) => i === 0 || order[examples[i - 1].difficulty] <= order[ex.difficulty]);
  const formulas = count("formula");
  const tips = blocks.filter((b) => b.type === "callout" && b.variant === "TIP").length;
  const shortcuts = examples.filter((e) => e.shortcut).length;
  const badChecks = checks.filter((q) => q.options.length !== 4 || q.options.filter((o) => o.correct).length !== 1 || q.options.some((o) => !o.feedback || !o.feedback.trim()));
  const strategyAt = blocks.findIndex((b) => b.type === "heading" && /strategy/i.test(b.text));
  const hasStrategy = strategyAt >= 0 && blocks.slice(strategyAt + 1, strategyAt + 3).some((b) => b.type === "list" && b.items.length >= 2);
  const memory = blocks.find((b): b is Extract<LessonBlock, { type: "memory_lock_points" }> => b.type === "memory_lock_points");
  const formulaItem: ChecklistItem =
    subjectType === "LANGUAGE"
      ? { key: "formulas", label: "No formula blocks (a language topic)", ok: formulas === 0, severity: "error", detail: `${formulas} formula block(s)` }
      : subjectType === "APTITUDE"
        ? { key: "formulas", label: "Formulas (required for an aptitude subject)", ok: formulas > 0, severity: "error", detail: `${formulas} formula block(s)` }
        : { key: "formulas", label: "Formulas where the topic has them", ok: subjectType !== null || formulas > 0, severity: "warning", detail: `${formulas} formula block(s)${subjectType ? "" : " — subject type not set"}` };
  const qualityItems: ChecklistItem[] = quality ? lessonQualityWarnings(blocks, quality).map((w) => ({ ...w, severity: "warning" as const })) : [];
  return [
    { key: "examples_min", label: `At least ${size.minExamples} solved examples`, ok: examples.length >= size.minExamples, severity: "error", detail: `${examples.length} found` },
    { key: "examples_max", label: `At most ${size.maxExamples} solved examples`, ok: examples.length <= size.maxExamples, severity: "warning", detail: `${examples.length} found` },
    { key: "examples_order", label: "Solved examples go from easy to hard", ok: easyToHard, severity: "error", detail: examples.map((e) => e.difficulty[0]).join("") || "none" },
    { key: "examples_steps", label: "Every solved example has at least two steps", ok: examples.every((e) => e.steps.length >= 2), severity: "error", detail: `${examples.filter((e) => e.steps.length < 2).length} with fewer` },
    formulaItem,
    { key: "shortcuts", label: "Shortcuts (a tip callout or an example shortcut)", ok: tips + shortcuts > 0, severity: "warning", detail: `${tips} tip(s), ${shortcuts} example shortcut(s)` },
    { key: "exceptions", label: "Exceptions and edge cases (a warning callout)", ok: blocks.some((b) => b.type === "callout" && b.variant === "WARNING"), severity: "warning", detail: "" },
    { key: "traps", label: `At least ${LESSON_MIN_TRAPS} common traps`, ok: count("trap") >= LESSON_MIN_TRAPS, severity: "error", detail: `${count("trap")} found` },
    { key: "quick_checks", label: `At least ${size.quickChecks} quick checks (PYQ-style practice)`, ok: checks.length >= size.quickChecks, severity: "error", detail: `${checks.length} found` },
    { key: "quick_check_shape", label: "Every quick check: exactly 4 options, one correct, feedback on every option", ok: badChecks.length === 0, severity: "error", detail: badChecks.length ? `fix: ${badChecks.map((q) => q.id).slice(0, 5).join(", ")}` : "" },
    { key: "strategy", label: "An exam-strategy list (a strategy heading followed by a list)", ok: hasStrategy, severity: "error", detail: "" },
    { key: "summary", label: "A one-page revision summary", ok: count("revision_summary") === 1, severity: "error", detail: `${count("revision_summary")} found` },
    { key: "memory_lock", label: `${LESSON_MIN_MEMORY_POINTS} to 10 Memory Lock points`, ok: Boolean(memory) && memory!.points.length >= LESSON_MIN_MEMORY_POINTS, severity: "error", detail: memory ? `${memory.points.length} point(s)` : "none" },
    {
      key: "basics_first",
      label: "Starts with the basics (a heading and an explanation before the first example)",
      ok: (() => {
        const firstEx = blocks.findIndex((b) => b.type === "solved_example");
        const head = firstEx === -1 ? blocks : blocks.slice(0, firstEx);
        return head.some((b) => b.type === "heading") && head.some((b) => b.type === "paragraph");
      })(),
      severity: "error",
      detail: "",
    },
    ...qualityItems,
  ];
}

export const checklistPasses = (items: ChecklistItem[]) => items.every((i) => i.ok || i.severity === "warning");
