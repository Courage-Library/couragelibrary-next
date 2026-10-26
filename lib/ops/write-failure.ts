import "server-only";

/**
 * SILENT-FAIL-1 (architect, 2026-10-26): a server-side write on important data must never fail silently. Callers keep
 * the user's flow going (e.g. a submit still shows the result) but every failure is logged here as ONE structured line
 * that log search, the nightly and health checks can find: tag "ops.write_failure".
 * No PII: only ids (attempt / question / row ids) and the database error code — never names, emails or answer text.
 */
export type WriteFailure = {
  /** the server function that performed the write, e.g. "MistakeService.recordExamMistakes" */
  fn: string;
  table: string;
  op: "insert" | "update" | "upsert" | "delete" | "select" | "rpc";
  /** Postgres / PostgREST error code (e.g. "42501"); null when unknown */
  code?: string | null;
  ids?: Record<string, string | number | null | undefined>;
};

export const WRITE_FAILURE_TAG = "ops.write_failure";

/** The error code of a Supabase / Postgres error (or null). */
export function errorCode(err: unknown): string | null {
  const c = (err as { code?: unknown } | null)?.code;
  return typeof c === "string" && c.length > 0 ? c.slice(0, 16) : null;
}

export function reportWriteFailure(f: WriteFailure): void {
  const ids = Object.fromEntries(Object.entries(f.ids ?? {}).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, String(v).slice(0, 64)]));
  console.error(JSON.stringify({ tag: WRITE_FAILURE_TAG, fn: f.fn, table: f.table, op: f.op, code: f.code ?? null, ids, at: new Date().toISOString() }));
}
