import { createAdminServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Courage Studio settings (decision #84, Q4): stored in the EXISTING key / value settings table
 * public.premium_system_configs (domain GLOBAL, unique config_key) — no new table, no migration. A missing row means the
 * documented default; nothing is written here. Server code only (service role); never imported by client components.
 *   ADMIN_DAILY_REVIEW_GOAL       { "value": 20 }    the Today mission goal (1–200)
 *   ADMIN_REQUIRE_SECOND_REVIEWER { "value": false } a question approved by its publisher needs a second reviewer
 */
export interface AdminStudioSettings {
  dailyReviewGoal: number;
  requireSecondReviewer: boolean;
  /** where each value came from: "setting" (a row) or "default" */
  source: { dailyReviewGoal: "setting" | "default"; requireSecondReviewer: "setting" | "default" };
}

export const STUDIO_SETTING_KEYS = { goal: "ADMIN_DAILY_REVIEW_GOAL", secondReviewer: "ADMIN_REQUIRE_SECOND_REVIEWER" } as const;
export const DEFAULT_DAILY_REVIEW_GOAL = 20;

export function parseStudioSettings(rows: Array<{ config_key: string; config_value: unknown; is_enabled: boolean }>): AdminStudioSettings {
  const val = (k: string) => {
    const r = rows.find((x) => x.config_key === k && x.is_enabled);
    const v = r && typeof r.config_value === "object" && r.config_value !== null ? (r.config_value as { value?: unknown }).value : undefined;
    return v;
  };
  const g = val(STUDIO_SETTING_KEYS.goal);
  const s = val(STUDIO_SETTING_KEYS.secondReviewer);
  const goalOk = typeof g === "number" && Number.isInteger(g) && g >= 1 && g <= 200;
  return {
    dailyReviewGoal: goalOk ? (g as number) : DEFAULT_DAILY_REVIEW_GOAL,
    requireSecondReviewer: s === true,
    source: { dailyReviewGoal: goalOk ? "setting" : "default", requireSecondReviewer: typeof s === "boolean" ? "setting" : "default" },
  };
}

export async function getAdminStudioSettings(): Promise<AdminStudioSettings> {
  const { data, error } = await createAdminServerSupabaseClient()
    .from("premium_system_configs")
    .select("config_key, config_value, is_enabled")
    .eq("config_domain", "GLOBAL")
    .in("config_key", [STUDIO_SETTING_KEYS.goal, STUDIO_SETTING_KEYS.secondReviewer]);
  // a failed read falls back to the defaults; for require_second_reviewer the default (off) is today's behaviour
  if (error) return parseStudioSettings([]);
  return parseStudioSettings((data ?? []) as Array<{ config_key: string; config_value: unknown; is_enabled: boolean }>);
}
