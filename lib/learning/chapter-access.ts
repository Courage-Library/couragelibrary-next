/**
 * CA-5: access to a node lesson by its position in its MASTER chapter (design F, decision 2: the same for every exam, so
 * a lesson has ONE access level). Pure. The position comes from fn_servable_node_lessons (master order inside the TOPIC).
 *   gating off (LESSON_GATING_ENABLED, default false) → every lesson is FREE (before the per-exam launch, CA-6)
 *   gating on → positions 1..LESSON_FREE_PER_CHAPTER (default 2) are FREE, the rest PRO
 * Locked = PRO and the viewer has no Pro. Decided on the server; a locked body is never sent.
 */
export const DEFAULT_FREE_LESSONS_PER_CHAPTER = 2;
export const MAX_FREE_LESSONS_PER_CHAPTER = 50;

export interface LessonAccessSettings {
  gatingEnabled: boolean;
  freePerChapter: number;
}

export const DEFAULT_LESSON_ACCESS: LessonAccessSettings = { gatingEnabled: false, freePerChapter: DEFAULT_FREE_LESSONS_PER_CHAPTER };

export function lessonAccessLevel(position: number, s: LessonAccessSettings): "FREE" | "PRO" {
  if (!s.gatingEnabled) return "FREE";
  return Number.isInteger(position) && position >= 1 && position <= s.freePerChapter ? "FREE" : "PRO";
}

export function isLessonLocked(position: number, s: LessonAccessSettings, hasPro: boolean): boolean {
  return lessonAccessLevel(position, s) === "PRO" && !hasPro;
}

/** Settings rows (premium_system_configs) → settings; anything malformed → the default (never throws). */
export function parseLessonAccessSettings(rows: Array<{ config_key: string; config_value: unknown; is_enabled: boolean }>): LessonAccessSettings {
  const val = (k: string) => {
    const r = rows.find((x) => x.config_key === k && x.is_enabled);
    return r && typeof r.config_value === "object" && r.config_value !== null ? (r.config_value as Record<string, unknown>).value : undefined;
  };
  const g = val(LESSON_ACCESS_KEYS.gating);
  const n = val(LESSON_ACCESS_KEYS.free);
  return {
    gatingEnabled: g === true,
    freePerChapter: typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= MAX_FREE_LESSONS_PER_CHAPTER ? n : DEFAULT_FREE_LESSONS_PER_CHAPTER,
  };
}

export const LESSON_ACCESS_KEYS = { gating: "LESSON_GATING_ENABLED", free: "LESSON_FREE_PER_CHAPTER" } as const;
