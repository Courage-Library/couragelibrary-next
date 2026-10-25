/**
 * F5 Memory Lock feature flag. Server env only; OFF unless MEMORY_LOCK_ENABLED is exactly "true". Stays OFF until the
 * owner has applied migration 20261025000095_f5_memory_lock.sql (vault ml_* columns, fn_memory_lock_answer,
 * fn_memory_lock_add). With the flag off, /memory-lock is a 404, the dashboard card is the plain "Coming soon" card and
 * no "Add to Memory Lock" button is shown.
 */
export function isMemoryLockEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.MEMORY_LOCK_ENABLED === "true";
}
