/**
 * COURSE-UX-1 (owner requirements 1 + 2): the student course = EVERY topic of the exam's published syllabus, grouped by
 * subject (syllabus section), not only the topics that already have a lesson (partial launch). Pure (no data access):
 * the server service feeds it; the pages and the gate use it.
 *   - a topic (syllabus unit) with a published lesson is open; without one it is "Coming soon" (text, never a link)
 *   - Practice per topic when its master topic has servable questions: the REAL count (owner answer 3: "Practice 10
 *     questions" at ≥ 10, the real number below, nothing at 0)
 *   - counts are only what exists: lessons ready, topics ready of all topics — never a planned or invented total
 *   - a lesson belongs to the first unit (syllabus order) whose mapped master node is the lesson's node or an ancestor
 *   - progress: one record per lesson (any language, migration 135)
 */
import type { CourseLessonView, LessonStatus } from "@/lib/learning/course-view";

export const PRACTICE_SESSION_MAX = 10;

export interface CourseLesson extends CourseLessonView {
  /** estimated reading minutes from the word count (lib/lessons/reading-time.ts); null when unknown */
  minutes: number | null;
}

export interface CourseTopic {
  unitId: string;
  title: string;
  weightageTier: string | null;
  state: "READY" | "COMING_SOON";
  lessons: CourseLesson[];
  completed: number;
  practice: { href: string; count: number; label: string } | null;
}

export interface CourseSubject {
  slug: string;
  title: string;
  topics: CourseTopic[];
  totals: { topics: number; readyTopics: number; lessons: number; completed: number; highYield: number; practiceTopics: number };
}

export interface CourseStructure {
  subjects: CourseSubject[];
  totals: { topics: number; readyTopics: number; lessons: number; completed: number };
  /** course order (subject → topic → lesson) — previous / next in the reader */
  order: CourseLesson[];
}

/** The parts of fn_exam_syllabus_read_model the course needs (parsed defensively). */
export interface ReadModelNodeLite {
  id: string;
  parentId: string | null;
  kind: string;
  title: string;
  slug: string;
  order: number;
  weightageTier: string | null;
  /** mapped master nodes (canonical node id) and their master TOPIC id */
  mapped: { nodeId: string | null; topicId: string | null }[];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const str = (v: unknown) => (typeof v === "string" ? v : null);
const uuid = (v: unknown) => (typeof v === "string" && UUID_RE.test(v) ? v : null);

export function readModelNodes(raw: unknown): ReadModelNodeLite[] {
  const o = obj(raw);
  if (!o || o.state !== "AVAILABLE" || !Array.isArray(o.nodes)) return [];
  const out: ReadModelNodeLite[] = [];
  for (const n of o.nodes) {
    const x = obj(n);
    const id = uuid(x?.id);
    if (!x || !id) continue;
    out.push({
      id,
      parentId: uuid(x.parent_id),
      kind: str(x.kind) || "",
      title: str(x.title) || "Topic",
      slug: str(x.slug) || id,
      order: typeof x.order === "number" ? x.order : 0,
      weightageTier: str(x.weightage_tier),
      mapped: (Array.isArray(x.topics) ? x.topics : []).map((t) => obj(t)).filter((t): t is Record<string, unknown> => !!t).map((t) => ({ nodeId: uuid(t.node_id), topicId: uuid(t.topic_id) })),
    });
  }
  return out;
}

/** "Practice 10 questions" / "Practice 3 questions" / "Practice 1 question"; null at 0 (owner answer 3). */
export function practiceAction(topicId: string | null, count: number): CourseTopic["practice"] {
  if (!topicId || !Number.isInteger(count) || count <= 0) return null;
  const n = Math.min(PRACTICE_SESSION_MAX, count);
  // the session size is one of 5 / 10 / 20 (lib/practice/engine.ts) and a session serves what exists: ask for 10
  return { href: `/practice/session?${new URLSearchParams({ topic: topicId, n: String(PRACTICE_SESSION_MAX) })}`, count: n, label: `Practice ${n} question${n === 1 ? "" : "s"}` };
}

const SUBJECT_KINDS = new Set(["SECTION"]);

export function buildCourseStructure(input: {
  nodes: ReadModelNodeLite[];
  lessons: CourseLesson[];
  /** lesson node id → hierarchy path; mapped node id → hierarchy path */
  paths: Record<string, string>;
  /** master topic id → servable practice questions (empty when practice is off) */
  practice: Map<string, number>;
  status?: Map<string, LessonStatus>;
}): CourseStructure {
  const byId = new Map(input.nodes.map((n) => [n.id, n]));
  const children = new Map<string | null, ReadModelNodeLite[]>();
  for (const n of input.nodes) {
    const k = n.parentId && byId.has(n.parentId) ? n.parentId : null;
    children.set(k, [...(children.get(k) ?? []), n]);
  }
  for (const list of children.values()) list.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));

  // units in syllabus order, each with its subject (nearest SECTION ancestor, else its top-level paper)
  const units: { unit: ReadModelNodeLite; subject: ReadModelNodeLite }[] = [];
  const walk = (parent: string | null, subject: ReadModelNodeLite | null) => {
    for (const n of children.get(parent) ?? []) {
      if (n.kind === "UNIT") {
        if (subject) units.push({ unit: n, subject });
        else units.push({ unit: n, subject: n });
      } else walk(n.id, SUBJECT_KINDS.has(n.kind) ? n : subject ?? n);
    }
  };
  walk(null, null);

  const status = input.status ?? new Map<string, LessonStatus>();
  const lessonPath = (l: CourseLesson) => input.paths[l.nodeId] ?? null;
  const taken = new Set<string>();
  const subjects = new Map<string, CourseSubject>();
  const slugs = new Set<string>();
  const order: CourseLesson[] = [];

  for (const { unit, subject } of units) {
    let s = subjects.get(subject.id);
    if (!s) {
      let slug = subject.slug;
      for (let i = 2; slugs.has(slug); i++) slug = `${subject.slug}-${i}`;
      slugs.add(slug);
      s = { slug, title: subject.title, topics: [], totals: { topics: 0, readyTopics: 0, lessons: 0, completed: 0, highYield: 0, practiceTopics: 0 } };
      subjects.set(subject.id, s);
    }
    const mappedPaths = unit.mapped.map((m) => (m.nodeId ? input.paths[m.nodeId] : null)).filter((p): p is string => !!p);
    const lessons = input.lessons
      .filter((l) => {
        if (taken.has(l.documentId)) return false;
        const p = lessonPath(l);
        return !!p && mappedPaths.some((m) => p === m || p.startsWith(`${m}.`));
      })
      .map((l) => ({ ...l, status: status.get(l.documentId) ?? l.status }));
    lessons.forEach((l) => taken.add(l.documentId));
    // the unit's best practice topic: the mapped master topic with the most servable questions
    const best = unit.mapped
      .map((m) => ({ topicId: m.topicId, count: m.topicId ? input.practice.get(m.topicId) ?? 0 : 0 }))
      .sort((a, b) => b.count - a.count)[0];
    const topic: CourseTopic = {
      unitId: unit.id,
      title: unit.title,
      weightageTier: unit.weightageTier,
      state: lessons.length > 0 ? "READY" : "COMING_SOON",
      lessons,
      completed: lessons.filter((l) => l.status === "COMPLETED").length,
      practice: best ? practiceAction(best.topicId, best.count) : null,
    };
    s.topics.push(topic);
    s.totals.topics++;
    if (topic.state === "READY") s.totals.readyTopics++;
    s.totals.lessons += lessons.length;
    s.totals.completed += topic.completed;
    if (unit.weightageTier === "HIGH_YIELD") s.totals.highYield++;
    if (topic.practice) s.totals.practiceTopics++;
    order.push(...lessons);
  }

  const list = [...subjects.values()];
  return {
    subjects: list,
    totals: {
      topics: list.reduce((n, s) => n + s.totals.topics, 0),
      readyTopics: list.reduce((n, s) => n + s.totals.readyTopics, 0),
      lessons: order.length,
      completed: order.filter((l) => l.status === "COMPLETED").length,
    },
    order,
  };
}

/** "17 lessons ready" — only what exists. */
export const lessonsReadyText = (n: number) => `${n} lesson${n === 1 ? "" : "s"} ready`;
export const topicsReadyText = (ready: number, total: number) => `${ready} of ${total} topic${total === 1 ? "" : "s"} ready`;

/** Previous / next lesson in course order (locked lessons are skipped for "next"). */
export function neighbours(order: CourseLesson[], documentId: string): { prev: CourseLesson | null; next: CourseLesson | null; index: number } {
  const i = order.findIndex((l) => l.documentId === documentId);
  if (i < 0) return { prev: null, next: null, index: -1 };
  return { prev: order[i - 1] ?? null, next: order.slice(i + 1).find((l) => !l.locked) ?? null, index: i };
}

/** Continue where you left off: the newest READING lesson, else the first not completed and not locked. */
export function continueLesson(order: CourseLesson[], reading: { documentId: string; updatedAt: string }[]): CourseLesson | null {
  const newest = [...reading].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((r) => order.find((l) => l.documentId === r.documentId && l.status === "READING")).find(Boolean);
  return newest ?? order.find((l) => l.status !== "COMPLETED" && !l.locked) ?? null;
}
