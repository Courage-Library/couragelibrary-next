/**
 * F3 (R7 / R8) — pure timer rules (unit-tested offline: scripts/test_f3_player.cjs).
 *   remainingSecondsAt  whole seconds left until the anchored deadline (never negative; 0 at / after the deadline)
 *   timerPhase          "normal" → "final" at ≤ 5 minutes (one quiet state; no further escalation, no flashing)
 */
export const FINAL_PHASE_SECONDS = 300;

export function remainingSecondsAt(deadlineMs: number, nowMs: number): number {
  return Math.max(0, Math.ceil((deadlineMs - nowMs) / 1000));
}

export function timerPhase(seconds: number): "normal" | "final" | "over" {
  if (seconds <= 0) return "over";
  return seconds <= FINAL_PHASE_SECONDS ? "final" : "normal";
}
