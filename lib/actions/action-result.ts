/**
 * COURAGE LIBRARY — ACTION RESULT HELPERS (client-safe; SEC-1B)
 *
 * Admin server actions fail with a uniform result { ok: false, error: CODE, message } where CODE is
 * UNAUTHORIZED | FORBIDDEN | DB_ERROR | VALIDATION. UIs display `message`. Legacy results that still
 * carry a human-readable `error` string keep working.
 */

export function actionErrorMessage(res: unknown, fallback = "Something went wrong. Please try again."): string {
  const r = res as { ok?: unknown; message?: unknown; error?: unknown } | null | undefined;
  if (!r || typeof r !== "object") return fallback;
  if (r.ok === false && typeof r.message === "string" && r.message) return r.message;
  if (typeof r.error === "string" && r.error) return r.error;
  const nested = r.error as { message?: unknown } | null | undefined;
  if (nested && typeof nested === "object" && typeof nested.message === "string" && nested.message) return nested.message;
  return fallback;
}
