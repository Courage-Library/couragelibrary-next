/**
 * COURSE-UX-1 (owner answers 2 + 5): a lesson's estimated reading minutes come from its word count — 200 words per
 * minute, at least 1 — and a completion needs at least max(60 s, 40 % of those minutes) since the server-recorded start.
 * Pure; MIRRORS fn_lesson__reading_minutes (migration 136): the same text fields (quick-check feedback excluded, it is
 * shown only after answering), the same whitespace split. scripts/test_course_ux1.cjs compares the field lists and the
 * live gate compares both results on shared vectors.
 */
import type { LessonBlock } from "@/lib/lessons/blocks";

export const WORDS_PER_MINUTE = 200;
export const MIN_COMPLETION_SECONDS = 60;
export const COMPLETION_TIME_SHARE = 0.4;

/** The readable fields, as SQL jsonpath (kept identical to migration 136). */
export const READING_FIELD_PATHS = [
  "text", "items[*]", "question", "steps[*].text", "answer", "shortcut", "mistake", "why", "title", "name", "caption",
  "headers[*]", "rows[*][*]", "prompt", "options[*].text", "bullets[*]", "speed_rules[*]", "points[*]", "reading", "alt",
] as const;

function strings(v: unknown, path: string[]): string[] {
  if (path.length === 0) return typeof v === "string" ? [v] : [];
  const [head, ...rest] = path;
  if (v === null || typeof v !== "object") return [];
  if (head === "[*]") return Array.isArray(v) ? v.flatMap((x) => strings(x, rest)) : [];
  // lax mode: a key on an array applies to each element
  if (Array.isArray(v)) return v.flatMap((x) => strings(x, path));
  return strings((v as Record<string, unknown>)[head], rest);
}

const split = (p: string) => p.split(/(\[\*\])|\./).filter(Boolean);

export function lessonWordCount(blocks: readonly LessonBlock[] | readonly unknown[]): number {
  let n = 0;
  for (const p of READING_FIELD_PATHS) {
    for (const s of strings(blocks, ["[*]", ...split(p)])) {
      const t = s.trim();
      if (t) n += t.split(/\s+/).length;
    }
  }
  return n;
}

export function readingMinutes(blocks: readonly LessonBlock[] | readonly unknown[]): number {
  return Math.max(1, Math.ceil(lessonWordCount(blocks) / WORDS_PER_MINUTE));
}

export function requiredReadingSeconds(minutes: number): number {
  return Math.max(MIN_COMPLETION_SECONDS, Math.ceil(COMPLETION_TIME_SHARE * minutes * 60));
}
