/**
 * SEO-TOPIC-CANON-1 (owner GO 2026-11-11): a TOPIC flagged metadata.lesson_at_topic = true serves its subtopic's lesson at
 * the TOPIC URL. Explicit flag only, never auto-detection (lib/syllabus/single-subtopic.ts only REPORTS candidates).
 *   - the lesson served = the topic's first active, non-internal SUBTOPIC (display_order, then name) that has a servable
 *     lesson; a topic with its own lesson keeps it (the flag then changes nothing)
 *   - that subtopic's URL 308 → the topic URL (/learn, /hi/learn, /exams/<exam>/…); sitemap, course links and the
 *     exam-topic page use the topic URL; a second subtopic keeps its own URL — the flag alone decides, never the count
 *   - unflagged topics: unchanged
 * Set / unset only through the audited admin action (TaxonomyService.setLessonAtTopic). Pure; safe everywhere.
 */
export const LESSON_AT_TOPIC_KEY = "lesson_at_topic";

type Meta = Record<string, unknown>;
const asMeta = (m: unknown): Meta => (m && typeof m === "object" && !Array.isArray(m) ? { ...(m as Meta) } : {});

export const isLessonAtTopic = (metadata: unknown): boolean => asMeta(metadata)[LESSON_AT_TOPIC_KEY] === true;

/** The node's metadata with the flag set (true) or removed; every other key is kept. */
export function withLessonAtTopic(metadata: unknown, on: boolean): Meta {
  const meta = asMeta(metadata);
  if (on) meta[LESSON_AT_TOPIC_KEY] = true;
  else delete meta[LESSON_AT_TOPIC_KEY];
  return meta;
}

export interface CanonNode {
  id: string;
  parentId: string | null;
  nodeType: string;
  hierarchyPath: string;
  displayOrder: number;
  name: string;
  isActive: boolean;
  isInternal: boolean;
  metadata: unknown;
}

/** topic path ↔ the subtopic path whose lesson it serves (JSON-safe: it goes through unstable_cache). */
export interface TopicCanon {
  subToTopic: Record<string, string>;
  topicToSub: Record<string, string>;
}

export const EMPTY_TOPIC_CANON: TopicCanon = { subToTopic: {}, topicToSub: {} };

export function buildTopicCanon(nodes: CanonNode[], servableNodeIds: Iterable<string>): TopicCanon {
  const servable = new Set(servableNodeIds);
  const out: TopicCanon = { subToTopic: {}, topicToSub: {} };
  for (const t of nodes) {
    if (t.nodeType !== "TOPIC" || !t.isActive || t.isInternal || !isLessonAtTopic(t.metadata) || servable.has(t.id)) continue;
    const sub = nodes
      .filter((s) => s.parentId === t.id && s.nodeType === "SUBTOPIC" && s.isActive && !s.isInternal && servable.has(s.id))
      .sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name))[0];
    if (!sub) continue;
    out.subToTopic[sub.hierarchyPath] = t.hierarchyPath;
    out.topicToSub[t.hierarchyPath] = sub.hierarchyPath;
  }
  return out;
}

/** The public path of a lesson node: the topic path when the topic serves it, else the node's own path. */
export const canonicalLessonPath = (hierarchyPath: string, canon: TopicCanon): string => canon.subToTopic[hierarchyPath] ?? hierarchyPath;

/** The 308 target for a request path, or null when the path is its own canonical. */
export const topicCanonRedirect = (hierarchyPath: string | null, canon: TopicCanon): string | null => (hierarchyPath ? canon.subToTopic[hierarchyPath] ?? null : null);
