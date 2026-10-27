/**
 * Courage Studio Today — CONTENT HEALTH aggregation (architect 2026-10-27). Pure (offline-testable).
 *   rows    every exam with ≥ 1 question in ANY state (active or not; inactive = "not live")
 *   cells   per exam × subject: PUBLISHED questions + how many are in review ("+N in review")
 *   a question belongs to an exam when it is mapped to it (exam_question_mappings), its past-paper source names it
 *   (question_sources.exam_name), or its canonical topic is in that exam's PUBLISHED syllabus
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
  topicExams: Map<string, string[]>;
  explicitExams: Map<string, string[]>;
  exams: Array<{ id: string; title: string; isActive: boolean }>;
  subjects: Array<{ id: string; name: string }>;
}

export interface HealthGrid {
  exams: Array<{ id: string; title: string; live: boolean }>;
  subjects: Array<{ id: string; name: string }>;
  cells: Record<string, { published: number; inReview: number }>;
  lowestExamId: string | null;
}

export function buildContentHealth(i: HealthInput): HealthGrid {
  const cells: HealthGrid["cells"] = {};
  const examsWithAny = new Set<string>();
  const usedSubjects = new Set<string>();
  for (const q of i.questions) {
    const exams = new Set([...(q.topicId ? i.topicExams.get(q.topicId) ?? [] : []), ...(i.explicitExams.get(q.id) ?? [])]);
    const subject = q.topicId ? i.subjectOfTopic.get(q.topicId) ?? null : null;
    for (const e of exams) {
      examsWithAny.add(e);
      if (!subject) continue;
      usedSubjects.add(subject);
      const k = `${e}:${subject}`;
      const c = (cells[k] ??= { published: 0, inReview: 0 });
      if (q.published) c.published++;
      if (q.inReview) c.inReview++;
    }
  }
  const exams = i.exams
    .filter((e) => examsWithAny.has(e.id))
    .sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.title.localeCompare(b.title))
    .map((e) => ({ id: e.id, title: e.title, live: e.isActive }));
  const total = (id: string) => Object.entries(cells).filter(([k]) => k.startsWith(id + ":")).reduce((a, [, c]) => a + c.published, 0);
  const lowest = exams.length ? exams.reduce((m, e) => (total(e.id) < total(m.id) ? e : m)) : null;
  return { exams, subjects: i.subjects.filter((s) => usedSubjects.has(s.id)), cells, lowestExamId: lowest ? lowest.id : null };
}
