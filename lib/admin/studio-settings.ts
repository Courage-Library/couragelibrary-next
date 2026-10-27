import { createAdminServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Courage Studio settings (decision #84, Q4): stored in the EXISTING key / value settings table
 * public.premium_system_configs (domain GLOBAL / EXAM, unique config_key) — no new table, no migration. A missing row means the
 * documented default; nothing is written here. Server code only (service role); never imported by client components.
 *   ADMIN_DAILY_REVIEW_GOAL       { "value": 20 }    the Today mission goal (1–200)
 *   ADMIN_REQUIRE_SECOND_REVIEWER { "value": false } a question approved by its publisher needs a second reviewer
 *   EXAM_REQUIRES_BILINGUAL       { "exam_ids": [] } (domain EXAM) exams whose questions need both EN + HI: for a
 *                                 question mapped to one of them the Hindi / English auto check BLOCKS approval
 *                                 (architect ruling 2026-10-27; default none → the check is a warning)
 */
export interface AdminStudioSettings {
  dailyReviewGoal: number;
  requireSecondReviewer: boolean;
  /** exams that require both languages (EXAM_REQUIRES_BILINGUAL); empty = none */
  bilingualExamIds: string[];
  /** where each value came from: "setting" (a row) or "default" */
  source: { dailyReviewGoal: "setting" | "default"; requireSecondReviewer: "setting" | "default"; bilingualExamIds: "setting" | "default" };
}

export const STUDIO_SETTING_KEYS = { goal: "ADMIN_DAILY_REVIEW_GOAL", secondReviewer: "ADMIN_REQUIRE_SECOND_REVIEWER", bilingual: "EXAM_REQUIRES_BILINGUAL" } as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const DEFAULT_DAILY_REVIEW_GOAL = 20;

export function parseStudioSettings(rows: Array<{ config_key: string; config_value: unknown; is_enabled: boolean }>): AdminStudioSettings {
  const obj = (k: string) => {
    const r = rows.find((x) => x.config_key === k && x.is_enabled);
    return r && typeof r.config_value === "object" && r.config_value !== null ? (r.config_value as Record<string, unknown>) : undefined;
  };
  const val = (k: string) => obj(k)?.value;
  const ids = obj(STUDIO_SETTING_KEYS.bilingual)?.exam_ids;
  const idsOk = Array.isArray(ids) && ids.every((x) => typeof x === "string" && UUID.test(x));
  const g = val(STUDIO_SETTING_KEYS.goal);
  const s = val(STUDIO_SETTING_KEYS.secondReviewer);
  const goalOk = typeof g === "number" && Number.isInteger(g) && g >= 1 && g <= 200;
  return {
    dailyReviewGoal: goalOk ? (g as number) : DEFAULT_DAILY_REVIEW_GOAL,
    requireSecondReviewer: s === true,
    bilingualExamIds: idsOk ? [...new Set(ids as string[])] : [],
    source: { dailyReviewGoal: goalOk ? "setting" : "default", requireSecondReviewer: typeof s === "boolean" ? "setting" : "default", bilingualExamIds: idsOk ? "setting" : "default" },
  };
}

export async function getAdminStudioSettings(): Promise<AdminStudioSettings> {
  // never throws: a failed read (error OR exception) falls back to the defaults; for require_second_reviewer the default
  // (off) is today's behaviour, for EXAM_REQUIRES_BILINGUAL "none" (the Hindi check stays a warning)
  try {
    const { data, error } = await createAdminServerSupabaseClient()
      .from("premium_system_configs")
      .select("config_key, config_value, is_enabled")
      .in("config_domain", ["GLOBAL", "EXAM"])
      .in("config_key", [STUDIO_SETTING_KEYS.goal, STUDIO_SETTING_KEYS.secondReviewer, STUDIO_SETTING_KEYS.bilingual]);
    if (error) return parseStudioSettings([]);
    return parseStudioSettings((data ?? []) as Array<{ config_key: string; config_value: unknown; is_enabled: boolean }>);
  } catch {
    return parseStudioSettings([]);
  }
}
