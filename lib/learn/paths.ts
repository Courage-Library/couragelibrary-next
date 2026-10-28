/**
 * CA-6: URL ↔ master-tree path. A node's hierarchy_path is its slugs joined by "." (subject.topic[.subtopic[.concept]]);
 * its master lesson lives at /learn/<subject>/<topic>[/<subtopic>[/<concept>]] (Hindi: /hi/learn/…) and its exam-topic
 * page at /exams/<exam>/<subject>/<topic>[/…]. Pure; safe everywhere.
 */
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** URL segments → hierarchy_path (2–4 lesson levels under a subject), or null when malformed. */
export function segmentsToHierarchyPath(segments: string[] | undefined | null): string | null {
  if (!Array.isArray(segments) || segments.length < 2 || segments.length > 4) return null;
  const s = segments.map((x) => decodeURIComponent(String(x)).toLowerCase());
  return s.every((x) => SLUG_RE.test(x) && x.length <= 120) ? s.join(".") : null;
}

export const learnHref = (hierarchyPath: string, language: "en" | "hi" = "en") => `${language === "hi" ? "/hi" : ""}/learn/${hierarchyPath.split(".").join("/")}`;

export const examTopicHref = (examSlug: string, hierarchyPath: string) => `/exams/${examSlug}/${hierarchyPath.split(".").join("/")}`;

/** "/learn/topics" is the legacy topic entry (/learn/topics/<id>): never a subject slug here. */
export const RESERVED_LEARN_SEGMENTS = ["topics"] as const;
