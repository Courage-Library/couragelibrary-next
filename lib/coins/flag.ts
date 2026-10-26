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
