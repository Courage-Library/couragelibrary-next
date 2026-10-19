/**
 * UX-2b.H display rules for mock tests (pure; no I/O). They decide only what a page may CLAIM about data it already
 * has, never what data is fetched or stored.
 */

/**
 * Mock size as plain facts (UX-2b.H2, E-7; replaces the H-10 "Full-length" / "Shorter" label). A single threshold
 * mislabels real exams (SSC GD 80 questions / 60 min, SSC MTS 90 / 90 would read "Shorter"), so the page states the
 * size instead of judging it: "25 questions · 15 min", "1 question · 1 hr 30 min".
 * Missing, zero or invalid parts are left out (never "NaN"); nothing valid → "".
 */
export function formatDurationMinutes(minutes: number | null | undefined): string {
  const m = Math.round(Number(minutes));
  if (!Number.isFinite(m) || m <= 0) return "";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h} hr` : `${h} hr ${rest} min`;
}

export function formatMockShape(mock: { totalQuestions?: number | null; durationMinutes?: number | null }): string {
  const q = Math.round(Number(mock.totalQuestions));
  const questions = Number.isFinite(q) && q > 0 ? `${q} ${q === 1 ? "question" : "questions"}` : "";
  return [questions, formatDurationMinutes(mock.durationMinutes)].filter(Boolean).join(" · ");
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
