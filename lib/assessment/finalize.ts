/**
 * EXAM-FINALIZE-1 — pure rules for in-progress attempts whose server deadline has passed (unit-tested offline:
 * scripts/test_exam_finalize1.cjs). The scoring itself is NOT here: an expired attempt is finalized by the one
 * submit path (AssessmentService.submitTestAttempt) with submitted_at = deadline.
 *   attemptDeadline   started_at + duration (the server deadline; never client time)
 *   isPastDeadline    now > deadline
 *   staleOutcome      "abandon" when the same user has a SUBMITTED attempt of the same mock that STARTED LATER (the
 *                     stale one is superseded) OR when it has ZERO saved answers (architect rule, F1-a audit): never
 *                     scored, never shown; "finalize" (≥ 1 saved answer, not superseded); "active" before deadline
 */
/**
 * EXAM-FINALIZE-1 switch (server env only; OFF unless EXAM_FINALIZE_ENABLED is exactly "true"). Turning it on is the
 * architect's "go": finalize-on-read and the daily sweep then score / abandon expired attempts. With it off, only the
 * player's own expiry path finalizes the attempt being opened (submitted_at = deadline), as before.
 */
export function isFinalizeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.EXAM_FINALIZE_ENABLED === "true";
}

export type AttemptLike = { id: string; userId: string; mockTestId: string; status: string; startedAt: string; submittedAt: string | null };

export function attemptDeadline(startedAt: string, durationMinutes: number): Date {
  return new Date(new Date(startedAt).getTime() + Math.max(0, Number(durationMinutes) || 0) * 60_000);
}

export function isPastDeadline(startedAt: string, durationMinutes: number, now: Date = new Date()): boolean {
  return now.getTime() > attemptDeadline(startedAt, durationMinutes).getTime();
}

const SUBMITTED = new Set(["submitted", "auto_submitted", "completed", "evaluated"]);
export const isSubmitted = (a: Pick<AttemptLike, "status" | "submittedAt">) => a.submittedAt !== null || SUBMITTED.has(a.status);

export function staleOutcome(attempt: AttemptLike, durationMinutes: number, siblings: AttemptLike[], now: Date = new Date(), savedAnswers = 1): "active" | "finalize" | "abandon" | "none" {
  if (attempt.status !== "in_progress" || attempt.submittedAt !== null) return "none";
  if (!isPastDeadline(attempt.startedAt, durationMinutes, now)) return "active";
  const superseded = siblings.some(
    (s) => s.id !== attempt.id && s.userId === attempt.userId && s.mockTestId === attempt.mockTestId && isSubmitted(s) && new Date(s.startedAt).getTime() > new Date(attempt.startedAt).getTime(),
  );
  return superseded || savedAnswers <= 0 ? "abandon" : "finalize";
}
