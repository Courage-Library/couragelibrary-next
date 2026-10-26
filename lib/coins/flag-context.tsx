"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * BRAND-3 fix 1 (architect, 2026-10-26): coin UI is HIDDEN while COINS_ENABLED is off (no balance, no "coins earned",
 * no wallet / store links). The server reads the flag once (AppShell → isCoinsEnabled) and provides it here, so client
 * components never read env. Default false: an unknown state shows no coin UI. Streaks are not coins and stay.
 */
const CoinsFlagContext = createContext(false);

export function CoinsFlagProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  return <CoinsFlagContext.Provider value={enabled}>{children}</CoinsFlagContext.Provider>;
}

export function useCoinsEnabled(): boolean {
  return useContext(CoinsFlagContext);
}
