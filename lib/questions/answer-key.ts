/**
 * QB-KEY-1 (decision #52): the ONE TypeScript definition of "this question version has a valid answer key".
 *
 * Mirror of the database predicate public.fn_qf_version_key_problem / fn_qf_version_is_servable (migration 087):
 * exactly 4 options keyed A–D, exactly one answer row, and its key is one of the version's options. The database is
 * the authority (a version cannot become PUBLISHED / current without it); this helper is for app-side grading and
 * display, so a missing or invalid key is never graded as wrong and never shown as a made-up answer.
 *
 * Pure module (no imports); accepts Supabase embed shapes (object or single-element array) as `unknown`.
 */

export const ANSWER_OPTION_KEYS = ["A", "B", "C", "D"] as const;
export type AnswerOptionKey = (typeof ANSWER_OPTION_KEYS)[number];

/** Shown wherever a correct answer would be shown but the key is missing or invalid (never a default letter). */
export const ANSWER_KEY_UNAVAILABLE = "Answer key unavailable";

export type AnswerKeyProblem = "NO_ANSWER" | "MULTIPLE_ANSWERS" | "KEY_INVALID" | "OPTION_COUNT" | "OPTION_KEYS" | "KEY_NOT_IN_OPTIONS";

const isKey = (v: unknown): v is AnswerOptionKey => typeof v === "string" && (ANSWER_OPTION_KEYS as readonly string[]).includes(v);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** The single answer row from a Supabase embed (`question_answers`), or null; more than one row is reported. */
function answerRows(answer: unknown): Record<string, unknown>[] {
  if (Array.isArray(answer)) return answer.filter(isObj);
  return isObj(answer) ? [answer] : [];
}

/**
 * Why a version's key is not valid, or null when it is. `options` = the version's option rows; pass `undefined`
 * only when the caller did not load options (display paths) — then only the key itself is checked.
 */
export function answerKeyProblem(answer: unknown, options?: ReadonlyArray<unknown> | null): AnswerKeyProblem | null {
  const rows = answerRows(answer);
  if (rows.length === 0) return "NO_ANSWER";
  if (rows.length > 1) return "MULTIPLE_ANSWERS";
  const key = rows[0].correct_option_key;
  if (!isKey(key)) return "KEY_INVALID";
  if (options === undefined) return null;
  const keys = (options ?? []).filter(isObj).map((o) => o.option_key);
  if (keys.length !== 4) return "OPTION_COUNT";
  const set = new Set(keys);
  if (set.size !== 4 || !ANSWER_OPTION_KEYS.every((k) => set.has(k))) return "OPTION_KEYS";
  if (!set.has(key)) return "KEY_NOT_IN_OPTIONS";
  return null;
}

/** The valid correct key, or null (missing / invalid → never a default). */
export function validAnswerKey(answer: unknown, options?: ReadonlyArray<unknown> | null): AnswerOptionKey | null {
  if (answerKeyProblem(answer, options) !== null) return null;
  const key = answerRows(answer)[0].correct_option_key;
  return isKey(key) ? key : null;
}
