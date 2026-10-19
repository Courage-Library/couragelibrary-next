/**
 * UX-2b.H display rules for mock tests (pure; no I/O). They decide only what a page may CLAIM about data it already
 * has, never what data is fetched or stored.
 */

/**
 * Full-length vs shorter mocks (H-10).
 *
 * A mock is "full-length" when it has at least FULL_LENGTH_MIN_QUESTIONS questions AND at least
 * FULL_LENGTH_MIN_MINUTES minutes. The full first-stage papers of the exams on the platform's roadmap all meet both
 * (SSC CGL / CHSL Tier 1: 100 questions, 60 min; IBPS / SBI prelims: 100 questions, 60 min; RRB NTPC CBT-1:
 * 100 questions, 90 min). Anything smaller (e.g. the 25-question, 15-minute daily sectionals) is a shorter mock.
 * The page does not receive the exam pattern itself, so the rule uses the mock's own size only; revisit it when an
 * exam with a smaller full paper is added (owner to confirm).
 */
export const FULL_LENGTH_MIN_QUESTIONS = 100;
export const FULL_LENGTH_MIN_MINUTES = 60;

export function isFullLengthMock(mock: { totalQuestions: number; durationMinutes: number }): boolean {
  const q = Number(mock.totalQuestions);
  const m = Number(mock.durationMinutes);
  return Number.isFinite(q) && Number.isFinite(m) && q >= FULL_LENGTH_MIN_QUESTIONS && m >= FULL_LENGTH_MIN_MINUTES;
}

/** "Full-length mock" or "Shorter mock", from the mock's size. */
export function mockLengthLabel(mock: { totalQuestions: number; durationMinutes: number }): string {
  return isFullLengthMock(mock) ? "Full-length mock" : "Shorter mock";
}

/**
 * Rank / percentile cohort gate (H-9).
 *
 * docs/ux/pages/analytics.md and test-flow.md require rank and percentile to be shown only "above an attempt
 * threshold" but give no number. 30 is a PLACEHOLDER pending owner confirmation: below it a rank such as "#3 of 3" or
 * "better than 50% of candidates" says nothing about standing.
 */
export const RANK_MIN_COHORT = 30;

export function canShowRank(totalParticipants: number): boolean {
  const n = Number(totalParticipants);
  return Number.isFinite(n) && n >= RANK_MIN_COHORT;
}
