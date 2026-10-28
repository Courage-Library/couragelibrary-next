/**
 * CA-5: the exam course view model — pure (no data access), shared by the server service, the page and the gates.
 * courseFromOutline parses fn_exam_course_outline's JSON defensively (anything malformed is dropped, never thrown).
 */
export type LessonStatus = "NOT_STARTED" | "READING" | "COMPLETED";

export interface CourseLessonView {
  documentId: string;
  name: string;
  nodeType: string;
  /** position in its MASTER chapter (1-based) — decides access */
  position: number;
  href: string;
  hiAvailable: boolean;
  access: "FREE" | "PRO";
  locked: boolean;
  status: LessonStatus;
}

export interface CourseChapterView {
  topicId: string;
  name: string;
  subjectName: string | null;
  weightageTier: string | null;
  expectedQuestionsMax: number | null;
  lessons: CourseLessonView[];
}

export interface CourseView {
  exam: { slug: string; title: string };
  state: "AVAILABLE" | "NO_SYLLABUS";
  language: "en" | "hi";
  chapters: CourseChapterView[];
  totals: { chapters: number; lessons: number; mappedNodes: number; coveredNodes: number };
  signedIn: boolean;
  completed: number;
  continueLesson: { href: string; name: string; started: boolean } | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const str = (v: unknown) => (typeof v === "string" ? v : null);
const int = (v: unknown) => (typeof v === "number" && Number.isInteger(v) ? v : null);

export function courseFromOutline(raw: unknown, exam: { slug: string; title: string }, language: "en" | "hi"): CourseView {
  const o = obj(raw);
  const chapters: CourseChapterView[] = [];
  for (const c of Array.isArray(o?.chapters) ? o.chapters : []) {
    const ch = obj(c);
    const topicId = str(ch?.topic_id);
    if (!ch || !topicId || !UUID_RE.test(topicId)) continue;
    const lessons: CourseLessonView[] = [];
    for (const l of Array.isArray(ch.lessons) ? ch.lessons : []) {
      const x = obj(l);
      const id = str(x?.document_id);
      const slug = str(x?.slug);
      const position = int(x?.position);
      if (!x || !id || !UUID_RE.test(id) || !slug || !SLUG_RE.test(slug) || position === null || position < 1) continue;
      lessons.push({
        documentId: id,
        name: str(x.name) || slug,
        nodeType: str(x.node_type) || "TOPIC",
        position,
        href: `/articles/${slug}`,
        hiAvailable: x.hi_available === true,
        access: "FREE",
        locked: false,
        status: "NOT_STARTED",
      });
    }
    if (!lessons.length) continue;
    chapters.push({
      topicId,
      name: str(ch.name) || "Chapter",
      subjectName: str(ch.subject_name),
      weightageTier: str(ch.weightage_tier),
      expectedQuestionsMax: int(ch.expected_questions_max),
      lessons: lessons.sort((a, b) => a.position - b.position),
    });
  }
  const t = obj(o?.totals);
  return {
    exam,
    state: o?.state === "AVAILABLE" ? "AVAILABLE" : "NO_SYLLABUS",
    language,
    chapters,
    totals: {
      chapters: chapters.length,
      lessons: chapters.reduce((n, c) => n + c.lessons.length, 0),
      mappedNodes: int(t?.mapped_nodes) ?? 0,
      coveredNodes: int(t?.covered_nodes) ?? 0,
    },
    signedIn: false,
    completed: 0,
    continueLesson: null,
  };
}

export const WEIGHTAGE_LABEL: Record<string, string> = { HIGH_YIELD: "High yield", CORE: "Core", MODERATE: "Moderate", LOW: "Low", OPTIONAL: "Optional" };
