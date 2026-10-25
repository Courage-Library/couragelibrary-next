/**
 * F5 Memory Lock (decision #77) — the scheduler. Pure and deterministic; scripts/test_memory_lock_f5.cjs runs the
 * transition table. The database applies the SAME rules (migration 095: fn_ml_apply_correct / the vault trigger) —
 * the gate's live smoke runs this table through the RPC before 095 may be applied.
 *
 *   ladder        1 → 3 → 7 → 14 → 30 days on a correct answer (a new item steps 0 → 1)
 *   one step/day  only the FIRST correct answer of an IST calendar day advances; later ones that day change nothing
 *   wrong         back to 1 day, consecutive correct days → 0, lapses + 1, state learning
 *   added         from a mistake: learning, due tomorrow (IST), lapses 0 · manually: new, due today
 *   exam cap      with an exam date on or after today: interval ≤ max(1, floor(days to exam / 2))
 *   locked        correct on ≥ 2 different days (after the item was added) AND current interval ≥ 7
 * Days are Asia/Kolkata calendar days ("YYYY-MM-DD"); an item is due from the START of its due day (IST midnight).
 */
export const LADDER = [1, 3, 7, 14, 30] as const;
export const LOCK_MIN_DAYS = 2;
export const LOCK_MIN_INTERVAL = 7;

export type MlState = "new" | "learning" | "review" | "locked";
export type MlItem = {
  state: MlState;
  intervalDays: number;
  consecutiveCorrectDays: number;
  lapses: number;
  lastResult: "correct" | "wrong" | null;
  /** IST day of the last schedule advance (one step per calendar day) */
  lastAdvanceOn: string | null;
  /** IST day the item is due */
  dueOn: string;
};

const IST_OFFSET_MS = 330 * 60_000;

/** IST calendar day of an instant: "2026-10-25". */
export function istDay(at: Date | string | number): string {
  const t = new Date(at).getTime() + IST_OFFSET_MS;
  return new Date(t).toISOString().slice(0, 10);
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000);
}

/** The instant an IST day starts (its due_at): IST midnight. */
export function istDayStart(day: string): Date {
  return new Date(new Date(`${day}T00:00:00Z`).getTime() - IST_OFFSET_MS);
}

export function nextLadderStep(interval: number): number {
  return LADDER.find((s) => s > interval) ?? LADDER[LADDER.length - 1];
}

export function examCap(today: string, examDate: string | null): number | null {
  if (!examDate) return null;
  const d = daysBetween(today, examDate);
  if (d < 0) return null; // exam date in the past: no cap
  return Math.max(1, Math.floor(d / 2));
}

function stateFor(consecutiveCorrectDays: number, intervalDays: number): MlState {
  if (consecutiveCorrectDays >= LOCK_MIN_DAYS && intervalDays >= LOCK_MIN_INTERVAL) return "locked";
  return consecutiveCorrectDays >= 1 ? "review" : "learning";
}

export function addedFromMistake(today: string): MlItem {
  return { state: "learning", intervalDays: 1, consecutiveCorrectDays: 0, lapses: 0, lastResult: "wrong", lastAdvanceOn: null, dueOn: addDays(today, 1) };
}

export function addedManually(today: string): MlItem {
  return { state: "new", intervalDays: 0, consecutiveCorrectDays: 0, lapses: 0, lastResult: null, lastAdvanceOn: null, dueOn: today };
}

export function applyWrong(item: MlItem, today: string): MlItem {
  return { ...item, state: "learning", intervalDays: 1, consecutiveCorrectDays: 0, lapses: item.lapses + 1, lastResult: "wrong", dueOn: addDays(today, 1) };
}

export function applyCorrect(item: MlItem, today: string, examDate: string | null = null): MlItem {
  if (item.lastAdvanceOn === today) return { ...item, lastResult: "correct" }; // one step per calendar day
  let interval = nextLadderStep(item.intervalDays);
  const cap = examCap(today, examDate);
  if (cap !== null) interval = Math.min(interval, cap);
  const days = item.consecutiveCorrectDays + 1;
  return { ...item, state: stateFor(days, interval), intervalDays: interval, consecutiveCorrectDays: days, lastResult: "correct", lastAdvanceOn: today, dueOn: addDays(today, interval) };
}

/** "Back in 3 days" / "Back tomorrow" — the next due date after an answer, plain words. */
export function backInLabel(today: string, dueOn: string): string {
  const d = daysBetween(today, dueOn);
  if (d <= 0) return "Back today";
  if (d === 1) return "Back tomorrow";
  return `Back in ${d} days`;
}

// ---------------------------------------------------------------------------------------------------------------
// Daily queue
// ---------------------------------------------------------------------------------------------------------------
export const QUEUE_MIN = 5;
export const QUEUE_MAX = 50;
export const QUEUE_DEFAULT_MINUTES = 15;

/** ≈ 1 question per minute of the onboarding daily minutes, clamped to 5..50 (unset → 15). */
export function queueCap(dailyMinutes: number | null | undefined): number {
  const m = Number(dailyMinutes);
  const base = Number.isFinite(m) && m > 0 ? Math.round(m) : QUEUE_DEFAULT_MINUTES;
  return Math.min(QUEUE_MAX, Math.max(QUEUE_MIN, base));
}

export type QueueItem = { questionId: string; topicId: string | null; topicName: string | null; dueOn: string; lapses: number };
export type QueueGroup = { topicId: string | null; topicName: string; items: QueueItem[] };

/** Due items (due on or before today), most overdue first, then most lapses; capped; grouped by topic (group order =
 * order of each topic's first item). Deterministic ties: question id. */
export function buildQueue(items: QueueItem[], today: string, cap: number): { groups: QueueGroup[]; total: number; dueTotal: number } {
  const due = items
    .filter((i) => i.dueOn <= today)
    .sort((a, b) => daysBetween(b.dueOn, today) - daysBetween(a.dueOn, today) || b.lapses - a.lapses || a.questionId.localeCompare(b.questionId));
  const picked = due.slice(0, Math.max(0, cap));
  const groups: QueueGroup[] = [];
  for (const it of picked) {
    let g = groups.find((x) => x.topicId === it.topicId);
    if (!g) {
      g = { topicId: it.topicId, topicName: it.topicName || "Other questions", items: [] };
      groups.push(g);
    }
    g.items.push(it);
  }
  return { groups, total: picked.length, dueTotal: due.length };
}

/** Lock meter = locked / total items. */
export function lockMeter(states: MlState[]): { locked: number; total: number; pct: number } {
  const locked = states.filter((s) => s === "locked").length;
  return { locked, total: states.length, pct: states.length ? Math.round((locked * 100) / states.length) : 0 };
}

/** Items due on each of the next 7 IST days (today excluded). */
export function upcoming7(dueDays: string[], today: string): Array<{ day: string; count: number }> {
  return Array.from({ length: 7 }, (_, k) => {
    const day = addDays(today, k + 1);
    return { day, count: dueDays.filter((d) => d === day).length };
  });
}
