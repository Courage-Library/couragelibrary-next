/**
 * F2 topic practice (decision #79) feature flag. Server env only (no NEXT_PUBLIC_, no client override); OFF unless
 * PRACTICE_ENABLED is exactly "true". Stays OFF until the owner has applied migration
 * 20261025000093_f2_practice_answers_and_reports.sql (fn_check_practice_answer, fn_report_question). With the flag off,
 * /practice is the Mistake-drills page it was, and "Report this question" uses the pre-093 report path.
 */
export function isPracticeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.PRACTICE_ENABLED === "true";
}
