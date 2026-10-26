/**
 * Courage Studio Today v2 (decision #84): the reviewer's own numbers, computed from REAL audit rows only
 * (admin_audit_logs QF_TRANSITION_APPROVED / REJECTED / CHANGES_REQUESTED by this actor). Pure (offline-testable).
 *   doneToday     decisions today (IST calendar day)
 *   avgSeconds    average gap between consecutive decisions today, gaps > 15 min ignored (breaks); null when < 2
 *   streakDays    consecutive IST days with ≥ 1 decision, ending today (or yesterday when nothing yet today)
 *   minutesLeft   (goal − done) × avg, rounded up; null when there is no average yet (never invented)
 */
export const REVIEW_ACTIONS = ["QF_TRANSITION_APPROVED", "QF_TRANSITION_REJECTED", "QF_TRANSITION_CHANGES_REQUESTED"] as const;
const IST_OFFSET_MS = 330 * 60 * 1000;
const MAX_GAP_MS = 15 * 60 * 1000;

export function istDayKey(iso: string | Date): string {
  const t = (typeof iso === "string" ? new Date(iso) : iso).getTime() + IST_OFFSET_MS;
  return new Date(t).toISOString().slice(0, 10);
}

export interface ReviewStats {
  doneToday: number;
  avgSeconds: number | null;
  streakDays: number;
  minutesLeft: number | null;
}

export function computeReviewStats(eventsIso: string[], goal: number, now: Date = new Date()): ReviewStats {
  const today = istDayKey(now);
  const sorted = [...eventsIso].map((s) => new Date(s).getTime()).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  const todays = sorted.filter((t) => istDayKey(new Date(t)) === today);
  const gaps: number[] = [];
  for (let i = 1; i < todays.length; i++) {
    const g = todays[i] - todays[i - 1];
    if (g > 0 && g <= MAX_GAP_MS) gaps.push(g);
  }
  const avgSeconds = gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length / 1000) : null;
  const days = new Set(sorted.map((t) => istDayKey(new Date(t))));
  let streak = 0;
  const cursor = new Date(now.getTime());
  if (!days.has(today)) cursor.setTime(cursor.getTime() - 86400e3); // nothing yet today: the streak may still end yesterday
  while (days.has(istDayKey(cursor))) {
    streak++;
    cursor.setTime(cursor.getTime() - 86400e3);
  }
  const left = Math.max(0, goal - todays.length);
  return {
    doneToday: todays.length,
    avgSeconds,
    streakDays: streak,
    minutesLeft: avgSeconds === null ? null : left === 0 ? 0 : Math.ceil((left * avgSeconds) / 60),
  };
}

/** 14 daily counts (oldest → today, IST) for a sparkline. */
export function dailyCounts(eventsIso: string[], days = 14, now: Date = new Date()): number[] {
  const out: number[] = [];
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--) keys.push(istDayKey(new Date(now.getTime() - i * 86400e3)));
  const counts = new Map(keys.map((k) => [k, 0]));
  for (const e of eventsIso) {
    const k = istDayKey(e);
    if (counts.has(k)) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  for (const k of keys) out.push(counts.get(k) ?? 0);
  return out;
}

/** "Good morning / afternoon / evening" by IST hour. */
export function greeting(now: Date = new Date()): string {
  const h = new Date(now.getTime() + IST_OFFSET_MS).getUTCHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}
