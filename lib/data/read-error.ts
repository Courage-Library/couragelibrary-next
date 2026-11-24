/**
 * LIVE-GREEN-1 3c (owner, 2026-11-24): a FAILED read is never "not found".
 *
 * A public page may answer 404 only for a row that genuinely does not exist. When a database read errors or times out,
 * the loader THROWS: the page answers 5xx (or, on an ISR revalidation, Next keeps serving the last good page), and —
 * because unstable_cache only stores a result that RETURNED — nothing is cached, so the next request reads again.
 * Before, `{ data }` without `error` turned a failed read into null / [] → notFound(), and unstable_cache then kept that
 * 404 for up to 30 min (UX2A L-17: /exams/ssc-cgl/exam-pattern 404 in dispatch 45362983737).
 * The message names the read only (no row data, no ids, no database text). Gate: scripts/test_public_read_errors.cjs.
 */
export class PublicReadError extends Error {
  constructor(where: string) {
    super(`public read failed: ${where}`);
    this.name = "PublicReadError";
  }
}

/** a supabase-js result → its data; a read error THROWS (never null / [] for a failed read) */
export function must<T>(res: { data: T; error?: unknown }, where: string): T {
  if (res.error) throw new PublicReadError(where);
  return res.data;
}
