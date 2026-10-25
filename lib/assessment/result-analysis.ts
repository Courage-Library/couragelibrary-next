/**
 * F4 — result & analysis rules (pure; no I/O; unit-tested offline: scripts/test_f4_result.cjs).
 * Every number here is derived from server values the builder already holds (attempt_answers.evaluated_marks,
 * mock_questions.marks, test_results, section_results). Nothing is estimated (R12):
 *   buildTakeaways   2–3 task-focused "what to do next" items from THIS attempt (R3), deterministic order
 *   cohortStanding   rank / percentile only from ≥ RANK_MIN_COHORT real students' first submitted attempts; else null
 *   buildTrend       this user's scored attempts of the same exam (abandoned never included); null below 2
 *   filterReview     All / Wrong / Skipped / Marked
 */
import { RANK_MIN_COHORT } from "./display-rules";

export type ReviewFilter = "all" | "wrong" | "skipped" | "marked";
export const REVIEW_FILTERS: ReadonlyArray<{ value: ReviewFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "wrong", label: "Wrong" },
  { value: "skipped", label: "Skipped" },
  { value: "marked", label: "Marked" },
];

export type AnalysisQuestion = {
  questionOrder: number;
  sectionName: string;
  topicId: string | null;
  topicName: string | null;
  selectedOption: string | null;
  /** null = no valid answer key: not scored, never counted as wrong or skipped */
  correctOption: string | null;
  isCorrect: boolean;
  isMarked: boolean;
  /** full marks of the question (mock_questions.marks) */
  marks: number;
  /** server-evaluated marks (attempt_answers.evaluated_marks): +marks, −negative or 0 */
  marksAwarded: number;
};

const scored = (q: AnalysisQuestion) => q.correctOption !== null;
export const isWrong = (q: AnalysisQuestion) => scored(q) && q.selectedOption !== null && !q.isCorrect;
export const isSkipped = (q: AnalysisQuestion) => q.selectedOption === null;

/** "12", "2.5", "0.33" — at most two decimals, no trailing zeros */
export function fmtMarks(n: number): string {
  return String(Number((Number(n) || 0).toFixed(2)));
}

/** Marks deducted by negative marking on wrong answers (server evaluated marks). */
export function negativeMarksLost(qs: AnalysisQuestion[]): number {
  return Number(qs.filter(isWrong).reduce((s, q) => s + Math.max(0, -Number(q.marksAwarded || 0)), 0).toFixed(2));
}

export function filterReview<T extends AnalysisQuestion>(qs: T[], f: ReviewFilter): T[] {
  if (f === "wrong") return qs.filter(isWrong);
  if (f === "skipped") return qs.filter(isSkipped);
  if (f === "marked") return qs.filter((q) => q.isMarked);
  return qs;
}

export function reviewCounts(qs: AnalysisQuestion[]): Record<ReviewFilter, number> {
  return { all: qs.length, wrong: qs.filter(isWrong).length, skipped: qs.filter(isSkipped).length, marked: qs.filter((q) => q.isMarked).length };
}

// ---------------------------------------------------------------------------------------------------------------
// "What to do next"
// ---------------------------------------------------------------------------------------------------------------
export type TakeawayAction =
  | { kind: "practice"; href: string; label: string }
  | { kind: "filter"; filter: ReviewFilter; label: string };
export type Takeaway = { kind: "TOPIC" | "PACING" | "PENALTY" | "REVIEW" | "CLEAN"; text: string; action: TakeawayAction | null };

export const TAKEAWAY_RULES = {
  /** a topic needs at least this many wrong answers to be named (one slip is not a pattern) */
  topicMinWrong: 2,
  /** the "end of the paper" = the last 20% of questions by order (at least 5) */
  tailShare: 0.2,
  tailMin: 5,
  pacingMinSkipped: 3,
  /** time counts as "ran out" at ≥ 98% of the duration */
  timeRanOutShare: 0.98,
  penaltyMinWrong: 5,
  /** negative marks lost ≥ 5% of the maximum score */
  penaltyMinShare: 0.05,
  max: 3,
} as const;

export type TakeawayInput = {
  questions: AnalysisQuestion[];
  maxScore: number;
  accuracyPercentage: number;
  timeUsedSeconds: number;
  durationMinutes: number;
  /** exam slug for the practice link; null = no link */
  examSlug: string | null;
  /** topics that can be practiced now (practice on AND ≥ 1 servable question) */
  practiceTopicIds: ReadonlySet<string>;
};

export function practiceHref(topicId: string, examSlug: string | null): string {
  return `/practice/session?${new URLSearchParams({ topic: topicId, ...(examSlug ? { exam: examSlug } : {}), n: "10" })}`;
}

type TopicLoss = { topicId: string; topicName: string; sectionName: string; wrong: number; total: number; lost: number };

export function topicLosses(qs: AnalysisQuestion[]): TopicLoss[] {
  const by = new Map<string, TopicLoss>();
  for (const q of qs) {
    if (!q.topicId || !scored(q)) continue;
    const t = by.get(q.topicId) ?? { topicId: q.topicId, topicName: q.topicName || "This topic", sectionName: q.sectionName, wrong: 0, total: 0, lost: 0 };
    t.total += 1;
    if (isWrong(q)) {
      t.wrong += 1;
      t.lost += Number(q.marks || 0) - Number(q.marksAwarded || 0); // marks not earned + the negative mark
    }
    by.set(q.topicId, t);
  }
  return [...by.values()]
    .filter((t) => t.wrong >= TAKEAWAY_RULES.topicMinWrong)
    .map((t) => ({ ...t, lost: Number(t.lost.toFixed(2)) }))
    .sort((a, b) => b.lost - a.lost || b.wrong - a.wrong || a.topicName.localeCompare(b.topicName, "en") || a.topicId.localeCompare(b.topicId));
}

function topicTakeaway(t: TopicLoss, input: TakeawayInput): Takeaway {
  const canPractice = input.practiceTopicIds.has(t.topicId);
  return {
    kind: "TOPIC",
    text: `${t.topicName} (${t.sectionName}) cost you ${fmtMarks(t.lost)} marks: ${t.wrong} of ${t.total} wrong.`,
    action: canPractice
      ? { kind: "practice", href: practiceHref(t.topicId, input.examSlug), label: `Practice ${t.topicName}` }
      : { kind: "filter", filter: "wrong", label: "Review wrong answers" },
  };
}

export function pacingTakeaway(input: TakeawayInput): Takeaway | null {
  const R = TAKEAWAY_RULES;
  const ordered = [...input.questions].sort((a, b) => a.questionOrder - b.questionOrder);
  const skipped = ordered.filter((q) => scored(q) && isSkipped(q));
  if (skipped.length < R.pacingMinSkipped) return null;
  const tailSize = Math.min(ordered.length, Math.max(R.tailMin, Math.ceil(ordered.length * R.tailShare)));
  const tail = ordered.slice(ordered.length - tailSize);
  const tailSkipped = tail.filter((q) => scored(q) && isSkipped(q)).length;
  const endHeavy = tailSkipped >= R.pacingMinSkipped && tailSkipped * 2 >= skipped.length;
  const ranOut = input.durationMinutes > 0 && input.timeUsedSeconds >= input.durationMinutes * 60 * R.timeRanOutShare;
  if (!endHeavy && !ranOut) return null;
  const lead = endHeavy
    ? `You left ${tailSkipped} of the last ${tailSize} questions unanswered${ranOut ? " and used all the time" : ""}.`
    : `Time ran out with ${skipped.length} questions unanswered.`;
  return { kind: "PACING", text: `${lead} In your next mock, set a time limit for each section so you reach the end.`, action: { kind: "filter", filter: "skipped", label: "See skipped questions" } };
}

export function penaltyTakeaway(input: TakeawayInput): Takeaway | null {
  const R = TAKEAWAY_RULES;
  const wrong = input.questions.filter(isWrong).length;
  const lost = negativeMarksLost(input.questions);
  if (lost <= 0 || wrong < R.penaltyMinWrong || lost < input.maxScore * R.penaltyMinShare) return null;
  return {
    kind: "PENALTY",
    text: `Negative marking cost you ${fmtMarks(lost)} marks on ${wrong} wrong answers (accuracy ${fmtMarks(Number(input.accuracyPercentage.toFixed(1)))}%). Answer when you can rule out at least two options.`,
    action: { kind: "filter", filter: "wrong", label: "Review wrong answers" },
  };
}

/** Deterministic: same attempt → same takeaways, same order. Order: biggest topic loss, pacing, penalty, 2nd topic. */
export function buildTakeaways(input: TakeawayInput): Takeaway[] {
  const topics = topicLosses(input.questions);
  const out = [
    topics[0] ? topicTakeaway(topics[0], input) : null,
    pacingTakeaway(input),
    penaltyTakeaway(input),
    topics[1] ? topicTakeaway(topics[1], input) : null,
  ].filter((t): t is Takeaway => t !== null);
  if (out.length > 0) return out.slice(0, TAKEAWAY_RULES.max);
  const wrong = input.questions.filter(isWrong).length;
  const skipped = input.questions.filter((q) => scored(q) && isSkipped(q)).length;
  if (wrong > 0) return [{ kind: "REVIEW", text: `Read the explanation for each of your ${wrong} wrong ${wrong === 1 ? "answer" : "answers"}.`, action: { kind: "filter", filter: "wrong", label: "Review wrong answers" } }];
  if (skipped > 0) return [{ kind: "REVIEW", text: `You skipped ${skipped} ${skipped === 1 ? "question" : "questions"}. Try them now with the explanations.`, action: { kind: "filter", filter: "skipped", label: "See skipped questions" } }];
  return [{ kind: "CLEAN", text: "Every answer you gave was correct.", action: null }];
}

/** The ONE primary action: the top takeaway's action (its practice link when it has one). */
export function primaryAction(takeaways: Takeaway[]): TakeawayAction | null {
  return takeaways[0]?.action ?? null;
}

// ---------------------------------------------------------------------------------------------------------------
// Rank / percentile (R12): only from ≥ RANK_MIN_COHORT real students; never estimated
// ---------------------------------------------------------------------------------------------------------------
export type CohortRow = { userId: string; score: number; createdAt: string; isTestAccount: boolean };
export type Standing = { rank: number; percentile: number; n: number };

/** Each real student's FIRST submitted result of this mock (retakes would compare a student with themselves). */
export function firstAttemptCohort(rows: CohortRow[]): CohortRow[] {
  const first = new Map<string, CohortRow>();
  for (const r of [...rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    if (r.isTestAccount || !Number.isFinite(Number(r.score))) continue;
    if (!first.has(r.userId)) first.set(r.userId, r);
  }
  return [...first.values()];
}

/**
 * n = students in the cohort. Rank = 1 + others who scored higher; percentile = share of the OTHER students who
 * scored lower than this attempt (floored to a whole number). null when n < RANK_MIN_COHORT — the page omits it.
 */
export function cohortStanding(rows: CohortRow[], viewerId: string, score: number): Standing | null {
  const cohort = firstAttemptCohort(rows);
  const n = cohort.length;
  if (n < RANK_MIN_COHORT) return null;
  const others = cohort.filter((r) => r.userId !== viewerId);
  if (others.length === 0) return null;
  const higher = others.filter((r) => Number(r.score) > score).length;
  const lower = others.filter((r) => Number(r.score) < score).length;
  return { rank: higher + 1, percentile: Math.floor((lower * 100) / others.length), n };
}

/** Test / QA accounts use the reserved .test domain (RFC 2606); they never count as real students. */
export function isTestAccountEmail(email: string | null | undefined): boolean {
  return /\.test$/i.test(String(email ?? "").trim());
}

// ---------------------------------------------------------------------------------------------------------------
// Trend vs this user's previous attempts of the same exam
// ---------------------------------------------------------------------------------------------------------------
export type TrendRow = { attemptId: string; status: string; mockTitle: string; submittedAt: string; score: number; maxScore: number; accuracy: number };
export type TrendPoint = { attemptId: string; mockTitle: string; submittedAt: string; score: number; maxScore: number; scorePct: number; accuracy: number; isCurrent: boolean };
export const TREND_MAX = 10;

export function buildTrend(rows: TrendRow[], currentAttemptId: string): TrendPoint[] | null {
  const pts = rows
    .filter((r) => r.status !== "abandoned" && Number(r.maxScore) > 0 && Boolean(r.submittedAt))
    .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt) || a.attemptId.localeCompare(b.attemptId))
    .map((r) => ({
      attemptId: r.attemptId,
      mockTitle: r.mockTitle,
      submittedAt: r.submittedAt,
      score: Number(r.score),
      maxScore: Number(r.maxScore),
      scorePct: Number(((Number(r.score) / Number(r.maxScore)) * 100).toFixed(1)),
      accuracy: Number(Number(r.accuracy).toFixed(1)),
      isCurrent: r.attemptId === currentAttemptId,
    }));
  const idx = pts.findIndex((p) => p.isCurrent);
  // the attempt being viewed and the ones before it (a later retake is not "previous")
  const upto = idx >= 0 ? pts.slice(0, idx + 1) : pts;
  const last = upto.slice(-TREND_MAX);
  return last.length >= 2 ? last : null;
}
