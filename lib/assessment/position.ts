/**
 * Q6 PLAYER-RESUME-SERVER (part B, migration 099): the resume position is kept on the server
 * (test_attempts.last_question_order + visited_orders). Pure helpers shared by the route, the service and the tests.
 */

/** 099 CHECK: visited_orders holds at most 1000 entries; question orders start at 1. */
export const MAX_POSITION_ORDERS = 1000;

export interface AttemptPosition {
  order: number;
  visited: number[];
}

const isOrder = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= MAX_POSITION_ORDERS;

/** Validates a client-sent position: null when the input is not a valid position. Visited orders are de-duplicated and sorted. */
export function sanitizePosition(order: unknown, visited: unknown): AttemptPosition | null {
  if (!isOrder(order) || !Array.isArray(visited) || visited.length > MAX_POSITION_ORDERS || !visited.every(isOrder)) return null;
  return { order, visited: [...new Set([...visited, order])].sort((a, b) => a - b) };
}

/**
 * Where a reload starts: the server position when there is one (index of that question order), else question 1.
 * Orders that are not in this test are ignored.
 */
export function resumeIndex(questionOrders: number[], serverOrder: number | null | undefined): number {
  if (serverOrder == null) return 0;
  const i = questionOrders.indexOf(serverOrder);
  return i >= 0 ? i : 0;
}
