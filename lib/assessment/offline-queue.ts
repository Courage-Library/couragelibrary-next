/**
 * Offline answer queue manager for resilient mock test taking.
 * Stores pending answers in localStorage and syncs with the server when online.
 */

export interface QueuedAnswer {
  mockQuestionId: string;
  selectedOption: string | null;
  isMarkedForReview: boolean;
  timeSpentSeconds: number;
  timestamp: number;
}

const getQueueKey = (attemptId: string) => `cl_mock_queue_${attemptId}`;

export const OfflineAnswerQueue = {
  /**
   * Enqueues or updates an answer locally.
   */
  enqueue(
    attemptId: string,
    mockQuestionId: string,
    selectedOption: string | null,
    isMarkedForReview: boolean,
    timeSpentSeconds: number
  ): void {
    if (typeof window === "undefined") return;

    try {
      const key = getQueueKey(attemptId);
      const raw = localStorage.getItem(key);
      const queue: Record<string, QueuedAnswer> = raw ? JSON.parse(raw) : {};

      queue[mockQuestionId] = {
        mockQuestionId,
        selectedOption,
        isMarkedForReview,
        timeSpentSeconds,
        timestamp: Date.now(),
      };

      localStorage.setItem(key, JSON.stringify(queue));
    } catch {
      // Storage unavailable or full — fallback safely
    }
  },

  /**
   * Removes a successfully synced answer from the local queue.
   */
  dequeue(attemptId: string, mockQuestionId: string): void {
    if (typeof window === "undefined") return;

    try {
      const key = getQueueKey(attemptId);
      const raw = localStorage.getItem(key);
      if (!raw) return;

      const queue: Record<string, QueuedAnswer> = JSON.parse(raw);
      delete queue[mockQuestionId];

      if (Object.keys(queue).length === 0) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, JSON.stringify(queue));
      }
    } catch {
      // Safe ignore
    }
  },

  /**
   * Retrieves all pending answers from local queue.
   */
  getPending(attemptId: string): QueuedAnswer[] {
    if (typeof window === "undefined") return [];

    try {
      const key = getQueueKey(attemptId);
      const raw = localStorage.getItem(key);
      if (!raw) return [];

      const queue: Record<string, QueuedAnswer> = JSON.parse(raw);
      return Object.values(queue);
    } catch {
      return [];
    }
  },

  /**
   * Clears the entire queue for an attempt (after full sync or final submit).
   */
  clear(attemptId: string): void {
    if (typeof window === "undefined") return;

    try {
      localStorage.removeItem(getQueueKey(attemptId));
    } catch {
      // Safe ignore
    }
  },

  /**
   * Flushes all pending answers to the server.
   */
  async flush(attemptId: string): Promise<number> {
    const pending = this.getPending(attemptId);
    if (pending.length === 0) return 0;

    let syncedCount = 0;

    for (const item of pending) {
      try {
        const res = await fetch("/api/assessment/save-answer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            attemptId,
            mockQuestionId: item.mockQuestionId,
            selectedOption: item.selectedOption,
            isMarkedForReview: item.isMarkedForReview,
            timeSpentSeconds: item.timeSpentSeconds,
          }),
        });

        if (res.ok) {
          this.dequeue(attemptId, item.mockQuestionId);
          syncedCount++;
        }
      } catch {
        // Still offline or failed — leave in queue for next flush attempt
        break;
      }
    }

    return syncedCount;
  },
};
