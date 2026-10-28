/**
 * CA-5 / CA-7: access to a node lesson by its position in its MASTER chapter (design F, decision 2: the same for every exam,
 * so a lesson has ONE access level). Pure. The position comes from fn_servable_node_lessons (master order in the TOPIC).
 *   a lesson in NO live exam course (before any launch, design H) → FREE: a free standalone article
 *   a lesson inside a LIVE (launched) exam course → positions 1..LESSON_FREE_PER_CHAPTER (default 2) FREE, the rest PRO
 * Locked = PRO and the viewer has no Pro. Decided on the server; a locked body is never sent.
 * (CA-7 replaced the CA-5 stand-in LESSON_GATING_ENABLED with the per-exam launch.)
 */
export const DEFAULT_FREE_LESSONS_PER_CHAPTER = 2;
export const MAX_FREE_LESSONS_PER_CHAPTER = 50;

export interface LessonAccessSettings {
  freePerChapter: number;
  /** the lessons inside a LIVE exam course (fn_live_course_document_ids); "ALL" = unknown → every lesson (fail closed) */
  liveCourseLessons: ReadonlySet<string> | "ALL";
}

export const DEFAULT_LESSON_ACCESS: LessonAccessSettings = { freePerChapter: DEFAULT_FREE_LESSONS_PER_CHAPTER, liveCourseLessons: new Set<string>() };

export function inLiveCourse(documentId: string, s: LessonAccessSettings): boolean {
  return s.liveCourseLessons === "ALL" || s.liveCourseLessons.has(documentId);
}

export function lessonAccessLevel(position: number, s: LessonAccessSettings, documentId: string): "FREE" | "PRO" {
  if (!inLiveCourse(documentId, s)) return "FREE";
  return Number.isInteger(position) && position >= 1 && position <= s.freePerChapter ? "FREE" : "PRO";
}

export function isLessonLocked(position: number, s: LessonAccessSettings, documentId: string, hasPro: boolean): boolean {
  return lessonAccessLevel(position, s, documentId) === "PRO" && !hasPro;
}

/** The free count from the settings rows (premium_system_configs); anything malformed → the default (never throws). */
export function parseFreePerChapter(rows: Array<{ config_key: string; config_value: unknown; is_enabled: boolean }>): number {
  const r = rows.find((x) => x.config_key === LESSON_ACCESS_KEYS.free && x.is_enabled);
  const n = r && typeof r.config_value === "object" && r.config_value !== null ? (r.config_value as Record<string, unknown>).value : undefined;
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= MAX_FREE_LESSONS_PER_CHAPTER ? n : DEFAULT_FREE_LESSONS_PER_CHAPTER;
}

export const LESSON_ACCESS_KEYS = { free: "LESSON_FREE_PER_CHAPTER" } as const;
