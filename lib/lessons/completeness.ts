/**
 * CA-4: the COMPLETENESS CHECKLIST for a generated lesson (architect ruling). Pure. Errors block publishing (the admin
 * service refuses to publish an EN node lesson that fails); warnings are shown. The DB validator already guarantees
 * the blocks are SAFE; this checks they are COMPLETE as a study lesson.
 */
import type { LessonBlock } from "@/lib/lessons/blocks";

export const LESSON_MIN_EXAMPLES = 10;
export const LESSON_MAX_EXAMPLES = 15;
export const LESSON_MIN_QUICK_CHECKS = 5;
export const LESSON_MIN_TRAPS = 2;

export interface ChecklistItem {
  key: string;
  label: string;
  ok: boolean;
  severity: "error" | "warning";
  detail: string;
}

/** subjectType: the node's subject type (APTITUDE needs formulas); null when unknown → formulas only a warning. */
export function lessonChecklist(blocks: LessonBlock[], subjectType: string | null): ChecklistItem[] {
  const count = (t: LessonBlock["type"]) => blocks.filter((b) => b.type === t).length;
  const examples = blocks.filter((b): b is Extract<LessonBlock, { type: "solved_example" }> => b.type === "solved_example");
  const order = { EASY: 0, MEDIUM: 1, HARD: 2 } as const;
  const easyToHard = examples.every((ex, i) => i === 0 || order[examples[i - 1].difficulty] <= order[ex.difficulty]);
  const formulas = count("formula");
  const tips = blocks.filter((b) => b.type === "callout" && b.variant === "TIP").length;
  const shortcuts = examples.filter((e) => e.shortcut).length;
  const formulasRequired = subjectType === "APTITUDE";
  const items: ChecklistItem[] = [
    { key: "examples_min", label: `At least ${LESSON_MIN_EXAMPLES} solved examples`, ok: examples.length >= LESSON_MIN_EXAMPLES, severity: "error", detail: `${examples.length} found` },
    { key: "examples_max", label: `At most ${LESSON_MAX_EXAMPLES} solved examples`, ok: examples.length <= LESSON_MAX_EXAMPLES, severity: "warning", detail: `${examples.length} found` },
    { key: "examples_order", label: "Solved examples go from easy to hard", ok: easyToHard, severity: "error", detail: examples.map((e) => e.difficulty[0]).join("") || "none" },
    { key: "examples_steps", label: "Every solved example has at least two steps", ok: examples.every((e) => e.steps.length >= 2), severity: "error", detail: `${examples.filter((e) => e.steps.length < 2).length} with fewer` },
    { key: "formulas", label: formulasRequired ? "Formulas (required for an aptitude subject)" : "Formulas where the topic has them", ok: formulas > 0, severity: formulasRequired ? "error" : "warning", detail: `${formulas} formula block(s)` },
    { key: "shortcuts", label: "Shortcuts (a tip callout or an example shortcut)", ok: tips + shortcuts > 0, severity: "warning", detail: `${tips} tip(s), ${shortcuts} example shortcut(s)` },
    { key: "traps", label: `At least ${LESSON_MIN_TRAPS} common traps`, ok: count("trap") >= LESSON_MIN_TRAPS, severity: "error", detail: `${count("trap")} found` },
    { key: "quick_checks", label: `At least ${LESSON_MIN_QUICK_CHECKS} quick checks (PYQ-style practice)`, ok: count("quick_check") >= LESSON_MIN_QUICK_CHECKS, severity: "error", detail: `${count("quick_check")} found` },
    { key: "summary", label: "A one-page revision summary", ok: count("revision_summary") === 1, severity: "error", detail: `${count("revision_summary")} found` },
    { key: "memory_lock", label: "Memory Lock points", ok: count("memory_lock_points") >= 1, severity: "error", detail: `${count("memory_lock_points")} found` },
    { key: "basics_first", label: "Starts with the basics (a heading and an explanation before the first example)", ok: (() => {
      const firstEx = blocks.findIndex((b) => b.type === "solved_example");
      const head = firstEx === -1 ? blocks : blocks.slice(0, firstEx);
      return head.some((b) => b.type === "heading") && head.some((b) => b.type === "paragraph");
    })(), severity: "error", detail: "" },
  ];
  return items;
}

export const checklistPasses = (items: ChecklistItem[]) => items.every((i) => i.ok || i.severity === "warning");
