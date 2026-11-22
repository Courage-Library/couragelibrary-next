/**
 * EXAM-UX-1 (owner spec 23 Nov 2026 §1.3 / §1.5) — pure palette rules, shared by the mock and live players and gated
 * offline (scripts/test_exam_ux1.cjs). Presentation only: the states themselves come from the player, unchanged.
 *   - the legend counts all 5 states for the CURRENT section
 *   - the filters: All · Not answered (no answer yet: not answered + not visited) · Marked (marked + answered & marked)
 */
export type QuestionStatus = "not_visited" | "not_answered" | "answered" | "marked" | "marked_answered";
export type PaletteFilter = "all" | "unanswered" | "marked";

export const PALETTE_STATES: ReadonlyArray<{ status: QuestionStatus; label: string }> = [
  { status: "answered", label: "Answered" },
  { status: "not_answered", label: "Not answered" },
  { status: "not_visited", label: "Not visited" },
  { status: "marked", label: "Marked for review" },
  { status: "marked_answered", label: "Answered & marked for review" },
];

export const PALETTE_FILTERS: ReadonlyArray<{ key: PaletteFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "unanswered", label: "Not answered" },
  { key: "marked", label: "Marked" },
];

export function stateCounts(items: ReadonlyArray<{ status: QuestionStatus }>): Record<QuestionStatus, number> {
  const out: Record<QuestionStatus, number> = { answered: 0, not_answered: 0, not_visited: 0, marked: 0, marked_answered: 0 };
  for (const i of items) out[i.status] += 1;
  return out;
}

export function matchesFilter(status: QuestionStatus, f: PaletteFilter): boolean {
  if (f === "unanswered") return status === "not_answered" || status === "not_visited";
  if (f === "marked") return status === "marked" || status === "marked_answered";
  return true;
}

export function filterCounts(items: ReadonlyArray<{ status: QuestionStatus }>): Record<PaletteFilter, number> {
  return {
    all: items.length,
    unanswered: items.filter((i) => matchesFilter(i.status, "unanswered")).length,
    marked: items.filter((i) => matchesFilter(i.status, "marked")).length,
  };
}

/** The palette button's accessible name: "Question 7, not answered". */
export function paletteButtonLabel(order: number, status: QuestionStatus): string {
  const label = PALETTE_STATES.find((s) => s.status === status)?.label ?? "";
  return `Question ${order}, ${label.charAt(0).toLowerCase()}${label.slice(1)}`;
}
