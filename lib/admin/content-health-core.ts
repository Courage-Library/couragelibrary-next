/**
 * Courage Studio Today — CONTENT HEALTH aggregation (architect rulings 2026-10-27). Pure (offline-testable).
 *   rows    every exam with ≥ 1 question in ANY state (active or not; inactive = "not live")
 *   cells   per exam × subject: PUBLISHED questions + how many are in review ("+N in review")
 *   a question COUNTS for an exam ONLY through an explicit link: it is mapped to the exam (exam_question_mappings), its
 *   past-paper source names the exam (question_sources), or it sits in one of the exam's mock tests (mock_questions →
 *   mock_tests → mock_templates.exam_id). Topic-in-syllabus overlap does NOT count; it is only a "shared topics" hint
 *   (questions that share the exam's syllabus topics without being linked to it), never in the cells.
 */
export interface HealthQuestion {
  id: string;
  topicId: string | null;
  published: boolean;
  inReview: boolean;
}

export interface HealthInput {
  questions: HealthQuestion[];
  subjectOfTopic: Map<string, string | null>;
  /** topic → exams whose PUBLISHED syllabus contains it (the hint only) */
  topicExams: Map<string, string[]>;
  /** question → exams it is explicitly linked to (mapping, past-paper source, mock membership) */
  explicitExams: Map<string, string[]>;
  exams: Array<{ id: string; title: string; isActive: boolean }>;
  subjects: Array<{ id: string; name: string }>;
}

export interface HealthGrid {
  exams: Array<{ id: string; title: string; live: boolean; sharedTopics: number }>;
  subjects: Array<{ id: string; name: string }>;
  cells: Record<string, { published: number; inReview: number }>;
  lowestExamId: string | null;
}

export function buildContentHealth(i: HealthInput): HealthGrid {
  const cells: HealthGrid["cells"] = {};
  const examsWithAny = new Set<string>();
  const usedSubjects = new Set<string>();
  const shared = new Map<string, number>();
  for (const q of i.questions) {
    const linked = new Set(i.explicitExams.get(q.id) ?? []);
    const subject = q.topicId ? i.subjectOfTopic.get(q.topicId) ?? null : null;
    for (const e of linked) {
      examsWithAny.add(e);
      if (!subject) continue;
      usedSubjects.add(subject);
      const c = (cells[`${e}:${subject}`] ??= { published: 0, inReview: 0 });
      if (q.published) c.published++;
      if (q.inReview) c.inReview++;
    }
    // hint only: shares a syllabus topic of an exam it is NOT linked to
    for (const e of q.topicId ? i.topicExams.get(q.topicId) ?? [] : []) if (!linked.has(e)) shared.set(e, (shared.get(e) ?? 0) + 1);
  }
  const exams = i.exams
    .filter((e) => examsWithAny.has(e.id))
    .sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.title.localeCompare(b.title))
    .map((e) => ({ id: e.id, title: e.title, live: e.isActive, sharedTopics: shared.get(e.id) ?? 0 }));
  const total = (id: string) => Object.entries(cells).filter(([k]) => k.startsWith(id + ":")).reduce((a, [, c]) => a + c.published, 0);
  const lowest = exams.length ? exams.reduce((m, e) => (total(e.id) < total(m.id) ? e : m)) : null;
  return { exams, subjects: i.subjects.filter((s) => usedSubjects.has(s.id)), cells, lowestExamId: lowest ? lowest.id : null };
}
