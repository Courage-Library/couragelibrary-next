/**
 * COINS-FREEZE (architect, 2026-10-26): no new coin awards from ANY path until F10 (Coins). Flag COINS_ENABLED —
 * exactly "true" to enable; default OFF. The database side is frozen by migration 112 (fn_award_gamification_reward
 * returns frozen; the discussion rewards are removed). Existing balances / ledger are never touched; spending (store) and
 * streak-freeze consumption are not awards. coin rewards: re-enable in F10 via the coin ledger.
 */
export function isCoinsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.COINS_ENABLED === "true";
}

/** Shown to students wherever a coin amount would have appeared (honest: no coins are being awarded). */
export const COINS_PAUSED_REASON = "Coins are paused for now";

/**
 * COURSE-UX-1 (decision #78 + owner exception 2026-11-03: lesson EARNING only, spending stays frozen). Flag
 * COINS_LESSON_EARN — exactly "true" to SHOW lesson coins (the "+10 coins" toast and the header balance); default OFF,
 * and it stays off until the owner approves the coins legal text. It never awards anything: the database switch
 * (premium_system_configs COINS_LESSON_EARN, migration 137) alone decides awards.
 */
export function isLessonCoinsEarnEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.COINS_LESSON_EARN === "true";
}
