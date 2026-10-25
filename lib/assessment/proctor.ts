/**
 * PROCTOR-LOG-1 — attempt proctoring events (migration 094, append-only attempt_proctor_events).
 * Server switch: OFF unless PROCTOR_LOG_ENABLED is exactly "true"; it stays off until the owner has applied 094. While
 * off, the route answers 204 and records nothing, and the player's notice must not claim events are "recorded".
 * Only these four events exist — no devtools detection, no fingerprint, no IP.
 */
export const PROCTOR_EVENTS = ["tab_hidden", "tab_visible", "fullscreen_exit", "fullscreen_enter"] as const;
export type ProctorEvent = (typeof PROCTOR_EVENTS)[number];

export function isProctorLogEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.PROCTOR_LOG_ENABLED === "true";
}

export function isProctorEvent(v: unknown): v is ProctorEvent {
  return typeof v === "string" && (PROCTOR_EVENTS as readonly string[]).includes(v);
}

/** The player's per-attempt event counter (kept on the device, so a reload continues the sequence: a retried send is
 * recorded once by UNIQUE(attempt_id, client_seq)). */
export function nextProctorSeq(attemptId: string, storage: Pick<Storage, "getItem" | "setItem"> | null): number {
  const key = `cl_proctor_seq_${attemptId}`;
  let n = 0;
  try {
    n = Math.max(0, Number.parseInt(storage?.getItem(key) ?? "0", 10) || 0) + 1;
    storage?.setItem(key, String(n));
  } catch {
    n = Date.now() % 100000; // storage unavailable: still unique enough per attempt, never blocks the test
  }
  return Math.min(n, 100000);
}
