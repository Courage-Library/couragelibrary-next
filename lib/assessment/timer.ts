/**
 * F3 (R7 / R8) — pure timer rules (unit-tested offline: scripts/test_f3_player.cjs).
 *   remainingSecondsAt  whole seconds left until the anchored deadline (never negative; 0 at / after the deadline)
 *   timerPhase          "normal" → "final" at ≤ 5 minutes (one quiet state; no further escalation, no flashing)
 */
export const FINAL_PHASE_SECONDS = 300;

/** Q6: a monotonic clock (performance.now) — changing the device's wall clock never moves the countdown. */
export function monotonicNowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
}

export function remainingSecondsAt(deadlineMs: number, nowMs: number): number {
  return Math.max(0, Math.ceil((deadlineMs - nowMs) / 1000));
}

export function timerPhase(seconds: number): "normal" | "final" | "over" {
  if (seconds <= 0) return "over";
  return seconds <= FINAL_PHASE_SECONDS ? "final" : "normal";
}

/**
 * EXAM-UX-1 (owner spec 23 Nov 2026 §1.6; supersedes decision #84's "never red") — PRESENTATION only, the countdown above
 * is unchanged: normal (cl-blue tint) → amber at ≤ 5:00 → red at ≤ 1:00. No flashing, no sound; colour is never the only
 * signal (the "Time left" label + an announcement at each step).
 */
export const RED_TONE_SECONDS = 60;
export type TimerTone = "normal" | "amber" | "red";
export function timerTone(seconds: number): TimerTone {
  if (seconds <= RED_TONE_SECONDS) return "red";
  return seconds <= FINAL_PHASE_SECONDS ? "amber" : "normal";
}

/** The screen-reader announcement for a tone — ONLY at 5 min and 1 min (never every second). */
export function timerAnnouncement(tone: TimerTone): string {
  if (tone === "amber") return "5 minutes left.";
  if (tone === "red") return "1 minute left.";
  return "";
}

/** mm:ss, or h:mm:ss from one hour (tabular in the UI). */
export function formatTimeLeft(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  const mm = minutes.toString().padStart(2, "0");
  const ss = secs.toString().padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}
