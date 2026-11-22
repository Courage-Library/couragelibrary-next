/**
 * RESULT-UX-1 (owner spec docs/design/RESULT_UX_V1_SPEC.md, 23 Nov 2026) — every derived value on the mock result page,
 * as small PURE functions (unit-gated: scripts/test_result_ux1.cjs). Deterministic, no AI, inputs are the server-loaded,
 * owner-scoped result (RESULT-SEC-1). Presentation only: no scoring here — marks / accuracy come from the server.
 */

// ------------------------------------------------------------------------------------------------ formatting
/** proper minus sign (U+2212), no space after it */
export const MINUS = "−";

/** "82.5", "200", "0.33", "−0.5" — at most two decimals, no trailing zeros, proper minus */
export function fmtNum(n: number): string {
  const v = Number((Number(n) || 0).toFixed(2));
  return v < 0 ? `${MINUS}${String(-v)}` : String(v);
}

/** "82.5 / 200" */
export function fmtScore(score: number, max: number): string {
  return `${fmtNum(score)} / ${fmtNum(max)}`;
}

/** signed marks for a chip: "+2", "−0.5", "0" */
export function fmtSigned(n: number): string {
  const v = Number((Number(n) || 0).toFixed(2));
  if (v === 0) return "0";
  return v > 0 ? `+${String(v)}` : `${MINUS}${String(-v)}`;
}

/** delta with one decimal: "+11.0", "−4.0", "0.0" */
export function fmtDelta(n: number): string {
  const v = Number((Number(n) || 0).toFixed(1));
  if (v === 0) return "0.0";
  return v > 0 ? `+${v.toFixed(1)}` : `${MINUS}${(-v).toFixed(1)}`;
}

/** clock time: 3490 → "58:10", 3725 → "1:02:05", 75 → "1:15" */
export function fmtClock(seconds: number): string {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/** per-question time: 108 → "1m 48s", 42 → "42s" */
export function fmtShort(seconds: number): string {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${String(s % 60).padStart(2, "0")}s` : `${s}s`;
}

/** percentages: at most one decimal, "60%" */
export function fmtPct(v: number): string {
  return `${Number((Number(v) || 0).toFixed(1))}%`;
}

// ------------------------------------------------------------------------------------------------ questions
export type UxQuestion = {
  mockQuestionId: string;
  questionOrder: number;
  sectionName: string;
  topicId: string | null;
  topicName: string | null;
  selectedOption: string | null;
  correctOption: string | null;
  isCorrect: boolean;
  marksAwarded: number;
  timeSpentSeconds?: number;
  learningSlug?: string | null;
  hasPublishedLearning?: boolean;
};

export type QState = "correct" | "wrong" | "skipped" | "unscored";
/** answered but the answer key is unavailable → "unscored" (never counted as wrong) */
export function questionState(q: Pick<UxQuestion, "selectedOption" | "correctOption" | "isCorrect">): QState {
  if (q.selectedOption === null) return "skipped";
  if (q.correctOption === null) return "unscored";
  return q.isCorrect ? "correct" : "wrong";
}

export type UxFilter = "all" | "wrong" | "skipped" | "correct";
export const UX_FILTERS: ReadonlyArray<{ value: UxFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "wrong", label: "Wrong" },
  { value: "skipped", label: "Skipped" },
  { value: "correct", label: "Correct" },
];

export function uxCounts(qs: UxQuestion[]): Record<UxFilter, number> {
  const c = { all: qs.length, wrong: 0, skipped: 0, correct: 0 };
  for (const q of qs) {
    const s = questionState(q);
    if (s === "wrong" || s === "skipped" || s === "correct") c[s]++;
  }
  return c;
}

export function uxFilter<T extends UxQuestion>(qs: T[], f: UxFilter, section: string | null): T[] {
  return qs.filter((q) => (f === "all" || questionState(q) === f) && (!section || q.sectionName === section));
}

/** Opens on Wrong when there are wrong answers (spec §2.8). */
export function defaultFilter(counts: Record<UxFilter, number>): UxFilter {
  return counts.wrong > 0 ? "wrong" : "all";
}

/** The URL query → a valid filter / section (anything unknown falls back; never trusted as-is). */
export function parseReviewQuery(q: { get(k: string): string | null }, counts: Record<UxFilter, number>, sections: string[]): { filter: UxFilter; section: string | null } {
  const f = q.get("filter");
  const filter = UX_FILTERS.some((x) => x.value === f) ? (f as UxFilter) : defaultFilter(counts);
  const s = q.get("section");
  return { filter, section: s && sections.includes(s) ? s : null };
}

/** the next WRONG question after `order` in the list (wraps to the first), or null */
export function nextWrong<T extends UxQuestion>(list: T[], order: number | null): T | null {
  const wrong = list.filter((q) => questionState(q) === "wrong");
  if (wrong.length === 0) return null;
  return wrong.find((q) => order === null || q.questionOrder > order) ?? wrong[0];
}

/** status chip text: "Wrong · −0.5", "Correct · +2", "Skipped · 0" */
export function statusChip(q: UxQuestion): string {
  const s = questionState(q);
  if (s === "skipped") return "Skipped · 0";
  if (s === "unscored") return "Not scored";
  return `${s === "correct" ? "Correct" : "Wrong"} · ${fmtSigned(q.marksAwarded)}`;
}

// ------------------------------------------------------------------------------------------------ trend / delta
export type TrendSource = {
  attemptId: string;
  status: string;
  examId: string;
  examTitle: string;
  mockTestId: string;
  mockTitle: string;
  /** mock_templates.test_type: daily · daily_sectional · full_mock · sectional · mixed … */
  mockKind: string;
  submittedAt: string;
  score: number;
  maxScore: number;
  accuracy: number;
};
export type GroupPoint = { attemptId: string; mockTitle: string; submittedAt: string; score: number; maxScore: number; pct: number; accuracy: number; isCurrent: boolean };
export type TrendGroup = { key: string; examTitle: string; kind: string; kindLabel: string; points: GroupPoint[] };

const KIND_LABEL: Record<string, string> = { daily: "daily", daily_sectional: "daily sectional", full_mock: "full", sectional: "sectional", mixed: "mixed" };
export function kindLabel(kind: string): string {
  return KIND_LABEL[kind] ?? String(kind || "mock").replace(/_/g, " ");
}

/** One comparable series = same EXAM + same MOCK KIND + same MAX SCORE (owner rule: never mix groups). */
export function trendKey(r: Pick<TrendSource, "examId" | "mockKind" | "maxScore">): string {
  return `${r.examId}|${r.mockKind}|${Number(Number(r.maxScore).toFixed(2))}`;
}

/**
 * The current attempt's group: its comparable attempts (scored, not abandoned), oldest first, up to and including the
 * current attempt (a later attempt is never "previous"). null when the current attempt is not among the rows.
 */
export function trendGroup(rows: TrendSource[], currentAttemptId: string): TrendGroup | null {
  const cur = rows.find((r) => r.attemptId === currentAttemptId);
  if (!cur) return null;
  const key = trendKey(cur);
  const pts = rows
    .filter((r) => trendKey(r) === key && r.status !== "abandoned" && Number(r.maxScore) > 0 && Boolean(r.submittedAt))
    .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt) || a.attemptId.localeCompare(b.attemptId))
    .map((r) => ({
      attemptId: r.attemptId,
      mockTitle: r.mockTitle,
      submittedAt: r.submittedAt,
      score: Number(r.score),
      maxScore: Number(r.maxScore),
      pct: Number(((Number(r.score) / Number(r.maxScore)) * 100).toFixed(1)),
      accuracy: Number(Number(r.accuracy).toFixed(1)),
      isCurrent: r.attemptId === currentAttemptId,
    }));
  const idx = pts.findIndex((p) => p.isCurrent);
  if (idx < 0) return null;
  return { key, examTitle: cur.examTitle, kind: cur.mockKind, kindLabel: kindLabel(cur.mockKind), points: pts.slice(0, idx + 1) };
}

/** vs the PREVIOUS attempt of the same group; null on the group's first attempt */
export function scoreDelta(g: TrendGroup | null): { delta: number; previous: number; label: string } | null {
  if (!g || g.points.length < 2) return null;
  const cur = g.points[g.points.length - 1];
  const prev = g.points[g.points.length - 2];
  return { delta: Number((cur.score - prev.score).toFixed(2)), previous: prev.score, label: `vs your last ${g.examTitle} ${g.kindLabel} mock` };
}

/** trend points for the chart: last 5 (default) or all; hidden (null) with < 2 points */
export function trendPoints(g: TrendGroup | null, range: "last5" | "all"): GroupPoint[] | null {
  if (!g || g.points.length < 2) return null;
  return range === "all" ? g.points : g.points.slice(-5);
}

// ------------------------------------------------------------------------------------------------ weak topics
export type WeakTopic = { topicId: string; topicName: string; sectionName: string; correct: number; attempted: number; wrong: number; accuracy: number; avgSeconds: number | null; learningSlug: string | null };
export const WEAK_MIN_ATTEMPTED = 2;
export const WEAK_MAX = 4;

/** per topic over ANSWERED, scored questions (skipped / unscored excluded) */
export function topicStats(qs: UxQuestion[]): WeakTopic[] {
  const m = new Map<string, WeakTopic & { secs: number; timed: number }>();
  for (const q of qs) {
    const s = questionState(q);
    if (!q.topicId || (s !== "correct" && s !== "wrong")) continue;
    const t = m.get(q.topicId) ?? { topicId: q.topicId, topicName: q.topicName || "Topic", sectionName: q.sectionName, correct: 0, attempted: 0, wrong: 0, accuracy: 0, avgSeconds: null, learningSlug: null, secs: 0, timed: 0 };
    t.attempted++;
    if (s === "correct") t.correct++;
    else t.wrong++;
    if (q.timeSpentSeconds && q.timeSpentSeconds > 0) {
      t.secs += q.timeSpentSeconds;
      t.timed++;
    }
    if (!t.learningSlug && q.learningSlug && q.hasPublishedLearning) t.learningSlug = q.learningSlug;
    m.set(q.topicId, t);
  }
  return [...m.values()].map(({ secs, timed, ...t }) => ({ ...t, accuracy: Number(((t.correct / t.attempted) * 100).toFixed(1)), avgSeconds: timed > 0 ? Math.round(secs / timed) : null }));
}

/** up to 4 lowest-accuracy topics with ≥ 2 attempted and at least one wrong; ties → more wrong, then name */
export function weakTopics(qs: UxQuestion[]): WeakTopic[] {
  return topicStats(qs)
    .filter((t) => t.attempted >= WEAK_MIN_ATTEMPTED && t.wrong > 0)
    .sort((a, b) => a.accuracy - b.accuracy || b.wrong - a.wrong || a.topicName.localeCompare(b.topicName))
    .slice(0, WEAK_MAX);
}

// ------------------------------------------------------------------------------------------------ sections / pace
export type UxSection = { sectionName: string; totalQuestions: number; attemptedCount: number; sectionScore: number; maxScore: number; accuracyPercentage: number; timeSpentSeconds?: number; durationMinutes?: number | null };
export type PaceRow = UxSection & { secondsPerQuestion: number | null; idealSeconds: number | null; pace: "on pace" | "too slow" | null };
/** "too slow" = more than 20 % over the ideal time per question */
export const PACE_TOLERANCE = 1.2;

/** ideal = the section's own time ÷ its questions when the mock defines section times; else mock duration ÷ total questions */
export function sectionPace(sections: UxSection[], mock: { durationMinutes: number; totalQuestions: number }): { rows: PaceRow[]; showTime: boolean } {
  const showTime = sections.some((s) => Number(s.timeSpentSeconds) > 0);
  const mockIdeal = mock.durationMinutes > 0 && mock.totalQuestions > 0 ? (mock.durationMinutes * 60) / mock.totalQuestions : null;
  const rows = sections.map((s) => {
    const time = Number(s.timeSpentSeconds) || 0;
    const per = showTime && time > 0 && s.totalQuestions > 0 ? Math.round(time / s.totalQuestions) : null;
    const ideal = s.durationMinutes && s.durationMinutes > 0 && s.totalQuestions > 0 ? (s.durationMinutes * 60) / s.totalQuestions : mockIdeal;
    const idealSeconds = ideal === null ? null : Math.round(ideal);
    const pace: PaceRow["pace"] = per === null || ideal === null ? null : per > ideal * PACE_TOLERANCE ? "too slow" : "on pace";
    return { ...s, secondsPerQuestion: per, idealSeconds, pace };
  });
  return { rows, showTime };
}

// ------------------------------------------------------------------------------------------------ verdict
/** one plain sentence from fixed rules (no AI); first matching rule wins for the second half */
export function verdict(input: { delta: number | null; accuracy: number; attempted: number; pace: PaceRow[] }): string {
  const lead = input.delta === null ? "" : input.delta > 0 ? "Good progress. " : input.delta < 0 ? "Lower than your last attempt. " : "Same score as your last attempt. ";
  if (input.attempted === 0) return `${lead}You did not answer any question in this attempt.`.trim();
  const slow = input.pace.filter((p) => p.pace === "too slow").sort((a, b) => (b.secondsPerQuestion ?? 0) / (b.idealSeconds || 1) - (a.secondsPerQuestion ?? 0) / (a.idealSeconds || 1))[0];
  const scored = input.pace.filter((p) => p.attemptedCount > 0);
  const weakest = scored.length > 1 ? [...scored].sort((a, b) => a.accuracyPercentage - b.accuracyPercentage)[0] : null;
  const best = scored.length > 1 ? [...scored].sort((a, b) => b.accuracyPercentage - a.accuracyPercentage)[0] : null;
  const accOk = input.accuracy >= 60;
  if (slow) return `${lead}${accOk ? "Accuracy is fine; speed" : "Speed"} in ${slow.sectionName} is holding you back.`;
  if (weakest && best && best.accuracyPercentage - weakest.accuracyPercentage >= 10) return `${lead}${best.sectionName} is your strongest section; ${weakest.sectionName} needs the most work.`;
  if (input.accuracy >= 80) return `${lead}Accurate attempt. Keep the same care and attempt more questions.`;
  if (accOk) return `${lead}Accuracy is fine. Review your wrong answers to push it higher.`;
  return `${lead}Accuracy is low. Answer fewer questions you are unsure of and review your mistakes.`;
}

// ------------------------------------------------------------------------------------------------ next 3 steps
export type NextStep = { kind: "learn" | "practice" | "mistakes"; title: string; detail: string; href: string; cta: string };
export function learnHref(slug: string): string {
  return `/articles/${slug}`;
}
export function practiceTopicHref(topicId: string, examSlug: string | null): string {
  return `/practice/session?${new URLSearchParams({ topic: topicId, ...(examSlug ? { exam: examSlug } : {}), n: "10" })}`;
}
export const PRACTICE_HOME = "/practice";

/**
 * (1) Learn the weakest topic (only with a published learning link) · (2) Practice the slowest weak topic that can be
 * practicable (else the next-weakest practicable one; else practice home) · (3) Revise mistakes (auto-saved to the
 * Mistake Vault on submit). A step without a valid target is left out — fewer than 3 is fine.
 */
export function nextSteps(input: {
  weak: WeakTopic[];
  wrongCount: number;
  practiceEnabled: boolean;
  practiceTopicIds: ReadonlySet<string>;
  examSlug: string | null;
  idealSeconds: number | null;
}): NextStep[] {
  const out: NextStep[] = [];
  const learn = input.weak.find((t) => t.learningSlug);
  if (learn) {
    out.push({ kind: "learn", title: `Learn: ${learn.topicName}`, detail: input.wrongCount > 0 ? `${learn.wrong} of your ${input.wrongCount} wrong answers came from this topic.` : `${learn.correct} / ${learn.attempted} correct in this attempt.`, href: learnHref(learn.learningSlug!), cta: "Open lesson" });
  }
  if (input.practiceEnabled) {
    const can = input.weak.filter((t) => input.practiceTopicIds.has(t.topicId));
    const slowest = input.idealSeconds
      ? [...can].filter((t) => t.avgSeconds !== null && t.avgSeconds > input.idealSeconds! * PACE_TOLERANCE).sort((a, b) => (b.avgSeconds ?? 0) - (a.avgSeconds ?? 0))[0]
      : undefined;
    const pick = slowest ?? can.find((t) => t.topicId !== learn?.topicId) ?? can[0];
    if (pick) {
      const detail = slowest && pick === slowest ? `You took ${fmtShort(pick.avgSeconds!)} per question here (ideal ~${fmtShort(input.idealSeconds!)}).` : `${pick.correct} / ${pick.attempted} correct in this attempt.`;
      out.push({ kind: "practice", title: `Practice 10 ${pick.topicName} questions`, detail, href: practiceTopicHref(pick.topicId, input.examSlug), cta: "Start practice" });
    } else if (input.weak.length > 0) {
      out.push({ kind: "practice", title: "Practice your weak topics", detail: "Short practice sets by topic.", href: PRACTICE_HOME, cta: "Open practice" });
    }
  }
  if (input.wrongCount > 0) {
    out.push({ kind: "mistakes", title: `Revise your ${input.wrongCount} ${input.wrongCount === 1 ? "mistake" : "mistakes"}`, detail: "Saved to Mistake Vault. Revise them before the next mock.", href: "/mistakes", cta: "Open Mistake Vault" });
  }
  return out.slice(0, 3);
}

// ------------------------------------------------------------------------------------------------ emoji gate helper
/** Emoji / pictographs (allowed text symbols ▲ ▼ ✓ ✕ › are NOT matched) */
export const EMOJI_RX = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{2712}\u{2714}\u{2716}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{3030}\u{303D}\u{3297}\u{3299}]/u;
