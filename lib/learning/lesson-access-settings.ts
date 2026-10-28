import { cache } from "react";
import { createAdminServerSupabaseClient } from "@/lib/supabase/server";
import { isPaymentsEnabled } from "@/config/payments";
import { DEFAULT_FREE_LESSONS_PER_CHAPTER, LESSON_ACCESS_KEYS, parseFreePerChapter, type LessonAccessSettings } from "@/lib/learning/chapter-access";

const FAIL_CLOSED: LessonAccessSettings = { freePerChapter: DEFAULT_FREE_LESSONS_PER_CHAPTER, gatedLessons: "ALL" };
// LAUNCH-MODE-1: with payments off nothing is gated — a Pro lesson nobody can buy is never locked (a configuration state,
// not a read failure; FREE_N launches are refused then anyway)
const NO_PAYWALL: LessonAccessSettings = { freePerChapter: DEFAULT_FREE_LESSONS_PER_CHAPTER, gatedLessons: new Set<string>() };

/**
 * CA-5 / CA-7: lesson access inputs, once per request — server only. Never throws. FAIL-CLOSED: if the free count or
 * the live-course lessons cannot be read, every lesson counts as inside a live course with the default free count (a Pro
 * body is never sent because a read failed); a MISSING settings row means the default.
 *   LESSON_FREE_PER_CHAPTER { "value": 2 }            premium_system_configs, domain GLOBAL
 *   fn_gated_course_document_ids()                   the lessons of LIVE FREE_N courses (migration 123, LAUNCH-MODE-1)
 * Payments off (PAYMENTS_ENABLED not "true") → nothing is gated.
 */
export const getLessonAccessSettings = cache(async (): Promise<LessonAccessSettings> => {
  if (!isPaymentsEnabled()) return NO_PAYWALL;
  try {
    const db = createAdminServerSupabaseClient();
    const [settings, live] = await Promise.all([
      db.from("premium_system_configs").select("config_key, config_value, is_enabled").eq("config_domain", "GLOBAL").in("config_key", [LESSON_ACCESS_KEYS.free]),
      db.rpc("fn_gated_course_document_ids"),
    ]);
    if (settings.error || live.error || !Array.isArray(live.data)) return FAIL_CLOSED;
    return {
      freePerChapter: parseFreePerChapter((settings.data ?? []) as Array<{ config_key: string; config_value: unknown; is_enabled: boolean }>),
      gatedLessons: new Set((live.data as unknown[]).map(String)),
    };
  } catch {
    return FAIL_CLOSED;
  }
});
