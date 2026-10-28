import { cache } from "react";
import { createAdminServerSupabaseClient } from "@/lib/supabase/server";
import { DEFAULT_FREE_LESSONS_PER_CHAPTER, LESSON_ACCESS_KEYS, parseLessonAccessSettings, type LessonAccessSettings } from "@/lib/learning/chapter-access";

const FAIL_CLOSED: LessonAccessSettings = { gatingEnabled: true, freePerChapter: DEFAULT_FREE_LESSONS_PER_CHAPTER };

/**
 * CA-5: the lesson access settings (premium_system_configs, domain GLOBAL; a missing row = the default) — server only
 * (the settings table is not client-readable). Never throws. FAIL-CLOSED: a failed read applies gating with the default
 * free count (a Pro body is never sent because a settings read failed); only a MISSING row means the default (off).
 *   LESSON_GATING_ENABLED   { "value": false }
 *   LESSON_FREE_PER_CHAPTER { "value": 2 }
 */
export const getLessonAccessSettings = cache(async (): Promise<LessonAccessSettings> => {
  try {
    const { data, error } = await createAdminServerSupabaseClient()
      .from("premium_system_configs")
      .select("config_key, config_value, is_enabled")
      .eq("config_domain", "GLOBAL")
      .in("config_key", [LESSON_ACCESS_KEYS.gating, LESSON_ACCESS_KEYS.free]);
    if (error) return FAIL_CLOSED;
    return parseLessonAccessSettings((data ?? []) as Array<{ config_key: string; config_value: unknown; is_enabled: boolean }>);
  } catch {
    return FAIL_CLOSED;
  }
});
