/**
 * F3 (R7) — answer autosave for the mock player. Pure engine with injectable fetch / timers / clock (unit-tested
 * offline: scripts/test_f3_player.cjs).
 *   - every change is kept on the device first (OfflineAnswerQueue) and debounced PER QUESTION (a save for question A
 *     is never cancelled by a save for question B);
 *   - "saved" ONLY when the server confirms ({ success: true }); any other answer → "retrying" with exponential backoff
 *     (1 s → 2 s → 4 s … capped at 30 s) until it lands; offline → "offline" (kept on this device, syncs when back);
 *   - HTTP 409 (the attempt is closed: submitted / time over) stops retrying for good → "closed";
 *   - the status is derived from what is still pending, never optimistic.
 */
export type SaveStatus = "saved" | "saving" | "retrying" | "offline" | "closed";
export type AnswerPayload = { selectedOption: string | null; isMarkedForReview: boolean; timeSpentSeconds: number };
export type SyncDeps = {
  post: (body: Record<string, unknown>) => Promise<{ status: number; json: () => Promise<unknown> }>;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (t: unknown) => void;
  isOnline: () => boolean;
  /** local persistence of not-yet-confirmed answers (OfflineAnswerQueue) */
  keep: (mockQuestionId: string, a: AnswerPayload) => void;
  forget: (mockQuestionId: string) => void;
  onStatus: (s: SaveStatus) => void;
};

export const DEBOUNCE_MS = 150;
export const backoffMs = (failures: number) => Math.min(30_000, 1000 * 2 ** Math.max(0, failures - 1));

/** Server confirmation = HTTP 2xx AND body { success: true } (a 200 with success:false is a FAILURE). */
export async function confirmed(res: { status: number; json: () => Promise<unknown> }): Promise<"ok" | "closed" | "failed"> {
  if (res.status === 409) return "closed";
  if (res.status < 200 || res.status >= 300) return "failed";
  try {
    const body = (await res.json()) as { success?: unknown } | null;
    return body && body.success === true ? "ok" : "failed";
  } catch {
    return "failed";
  }
}

export function createAnswerSync(attemptId: string, deps: SyncDeps) {
  const pending = new Map<string, { answer: AnswerPayload; version: number; failures: number; timer: unknown; inFlight: boolean }>();
  let closed = false;
  let version = 0;

  const status = (): SaveStatus => {
    if (closed) return "closed";
    if (pending.size === 0) return "saved";
    if (!deps.isOnline()) return "offline";
    return [...pending.values()].some((p) => p.failures > 0) ? "retrying" : "saving";
  };
  const report = () => deps.onStatus(status());

  const send = async (id: string) => {
    const p = pending.get(id);
    if (!p || closed) return;
    if (!deps.isOnline()) {
      report();
      return;
    }
    p.inFlight = true;
    const sentVersion = p.version;
    let outcome: "ok" | "closed" | "failed";
    try {
      outcome = await confirmed(await deps.post({ attemptId, mockQuestionId: id, ...p.answer }));
    } catch {
      outcome = "failed";
    }
    p.inFlight = false;
    if (outcome === "closed") {
      closed = true;
      pending.forEach((x) => deps.clearTimer(x.timer));
      report();
      return;
    }
    const now = pending.get(id);
    if (!now) return;
    if (outcome === "ok") {
      if (now.version === sentVersion) {
        pending.delete(id);
        deps.forget(id);
      } else {
        schedule(id, DEBOUNCE_MS); // a newer change arrived while this one was in flight
      }
    } else {
      now.failures += 1;
      schedule(id, backoffMs(now.failures));
    }
    report();
  };

  const schedule = (id: string, ms: number) => {
    const p = pending.get(id);
    if (!p) return;
    if (p.timer) deps.clearTimer(p.timer);
    p.timer = deps.setTimer(() => void send(id), ms);
  };

  return {
    /** record a change: kept on the device at once, sent after a short per-question debounce */
    save(mockQuestionId: string, answer: AnswerPayload) {
      if (closed) return;
      deps.keep(mockQuestionId, answer);
      const prev = pending.get(mockQuestionId);
      pending.set(mockQuestionId, { answer, version: ++version, failures: prev?.failures ?? 0, timer: prev?.timer ?? null, inFlight: prev?.inFlight ?? false });
      schedule(mockQuestionId, DEBOUNCE_MS);
      report();
    },
    /** network came back / page loaded with unconfirmed answers: send everything now */
    flushAll() {
      for (const id of pending.keys()) schedule(id, 0);
      report();
    },
    pendingCount: () => pending.size,
    status,
    isClosed: () => closed,
  };
}

/** Resume (R7): answers kept on the device but never confirmed are newer than the server copy — they win. */
export function mergePending<T extends AnswerPayload>(server: Record<string, T>, local: Array<{ mockQuestionId: string } & AnswerPayload>, knownIds: Set<string>): Record<string, AnswerPayload> {
  const out: Record<string, AnswerPayload> = { ...server };
  for (const l of local) {
    if (!knownIds.has(l.mockQuestionId)) continue; // never invent a question that is not in this attempt
    out[l.mockQuestionId] = { selectedOption: l.selectedOption, isMarkedForReview: l.isMarkedForReview, timeSpentSeconds: Math.max(l.timeSpentSeconds, server[l.mockQuestionId]?.timeSpentSeconds ?? 0) };
  }
  return out;
}
