/**
 * COURAGE LIBRARY — QUESTION TAXONOMY RESOLVER
 * Phase QF-1: Question Factory Core
 *
 * The ONE module through which all Question Factory code resolves topics,
 * subtopics, subjects and exams (decision D2).
 *
 * INVARIANTS:
 * - Strictly read-only: this module never inserts, updates or deletes anything.
 *   Taxonomy and exam structure belong to curriculum management / Exam Onboarding.
 * - Fail closed: any lookup error throws; callers treat a throw as a gate failure.
 */

export interface ResolvedTopic {
  id: string;
  name: string;
  slug: string;
  description: string;
  subjectId: string;
  subjectName: string;
  subjectDescription: string;
}

export interface ResolvedSubtopic {
  id: string;
  name: string;
  description: string;
}

export interface ResolvedExam {
  id: string;
  slug: string;
  title: string;
}

export interface TaxonomyResolution {
  ok: boolean;
  errors: string[];
  topic: ResolvedTopic | null;
  subtopic: ResolvedSubtopic | null;
  exam: ResolvedExam | null;
}

export interface TaxonomyTargetInput {
  topicId: string;
  subtopicId?: string | null;
  examId?: string | null;
}

type SupabaseLike = any;

function lookupError(what: string, err: { message?: string } | null | undefined): Error {
  return new Error(`${what} lookup failed: ${err?.message || 'unknown error'}`);
}

export class QuestionTaxonomyResolver {
  constructor(private readonly supabase: SupabaseLike) {}

  /** Verifies topic (active), subtopic ∈ topic (active) and exam (active). Throws on lookup error. */
  async resolveTarget(target: TaxonomyTargetInput): Promise<TaxonomyResolution> {
    const errors: string[] = [];
    const topic = await this.getTopicById(target.topicId);
    if (!topic) errors.push(`Topic "${target.topicId}" was not found or is inactive.`);

    let subtopic: ResolvedSubtopic | null = null;
    if (target.subtopicId) {
      const { data, error } = await this.supabase
        .from('subtopics')
        .select('id, name, description, topic_id, is_active')
        .eq('id', target.subtopicId)
        .maybeSingle();
      if (error) throw lookupError('Subtopic', error);
      if (!data || data.is_active === false) {
        errors.push(`Subtopic "${target.subtopicId}" was not found or is inactive.`);
      } else if (data.topic_id !== target.topicId) {
        errors.push(`Subtopic "${data.name}" does not belong to the target topic.`);
      } else {
        subtopic = { id: data.id, name: data.name, description: data.description || '' };
      }
    }

    let exam: ResolvedExam | null = null;
    if (target.examId) {
      exam = await this.getActiveExamById(target.examId);
      if (!exam) errors.push(`Exam "${target.examId}" was not found or is inactive.`);
    }

    return { ok: errors.length === 0, errors, topic, subtopic, exam };
  }

  async getTopicById(topicId: string): Promise<ResolvedTopic | null> {
    const { data, error } = await this.supabase
      .from('topics')
      .select('id, name, slug, description, is_active, subject_id, subjects:canonical_taxonomy_nodes!topics_subject_id_node_fkey(id, name, is_active)')
      .eq('id', topicId)
      .maybeSingle();
    if (error) throw lookupError('Topic', error);
    if (!data || data.is_active === false) return null;
    const subject = Array.isArray(data.subjects) ? data.subjects[0] : data.subjects;
    return {
      id: data.id,
      name: data.name,
      slug: data.slug,
      description: data.description || '',
      subjectId: data.subject_id,
      subjectName: subject?.name || '',
      subjectDescription: '',
    };
  }

  async getActiveExamById(examId: string): Promise<ResolvedExam | null> {
    const { data, error } = await this.supabase
      .from('exams')
      .select('id, slug, title, is_active')
      .eq('id', examId)
      .maybeSingle();
    if (error) throw lookupError('Exam', error);
    if (!data || data.is_active === false) return null;
    return { id: data.id, slug: data.slug, title: data.title };
  }

  /** Resolves an exam slug (case-insensitive) to an active exam id, or null. */
  async resolveExamSlug(slug: string): Promise<string | null> {
    const normalized = String(slug || '').trim().toLowerCase();
    if (!normalized) return null;
    const { data, error } = await this.supabase
      .from('exams')
      .select('id, slug, is_active')
      .eq('slug', normalized)
      .maybeSingle();
    if (error) throw lookupError('Exam slug', error);
    if (!data || data.is_active === false) return null;
    return data.id;
  }

  /**
   * CSV resolution by human references. Never creates anything: an unknown
   * subject/topic/exam yields an explicit error message instead.
   */
  async resolveByReferences(refs: {
    subject?: string | null;
    topic: string;
    subtopic?: string | null;
    exam?: string | null;
  }): Promise<{ target: TaxonomyTargetInput | null; error: string | null }> {
    const topicRef = String(refs.topic || '').trim();
    if (!topicRef) return { target: null, error: 'Topic is required.' };

    let subjectId: string | null = null;
    const subjectRef = String(refs.subject || '').trim();
    if (subjectRef) {
      const { data, error } = await this.supabase
        .from('subjects')
        .select('id, name, slug, is_active')
        .eq('is_active', true);
      if (error) throw lookupError('Subject', error);
      const lower = subjectRef.toLowerCase();
      const match = (data || []).find(
        (s: { id: string; name: string; slug: string }) =>
          s.id === subjectRef || s.slug.toLowerCase() === lower || s.name.toLowerCase() === lower
      );
      if (!match) {
        return { target: null, error: `Subject '${subjectRef}' not found — create it via curriculum/onboarding first.` };
      }
      subjectId = match.id;
    }

    let topicQuery = this.supabase.from('topics').select('id, name, slug, subject_id, is_active').eq('is_active', true);
    if (subjectId) topicQuery = topicQuery.eq('subject_id', subjectId);
    const { data: topics, error: topicErr } = await topicQuery;
    if (topicErr) throw lookupError('Topic', topicErr);
    const topicLower = topicRef.toLowerCase();
    const topicMatches = (topics || []).filter(
      (t: { id: string; name: string; slug: string }) =>
        t.id === topicRef || t.slug.toLowerCase() === topicLower || t.name.toLowerCase() === topicLower
    );
    if (topicMatches.length === 0) {
      return { target: null, error: `Topic '${topicRef}' not found — create it via curriculum/onboarding first.` };
    }
    if (topicMatches.length > 1) {
      return { target: null, error: `Topic '${topicRef}' is ambiguous across subjects — specify the subject.` };
    }
    const topicId = topicMatches[0].id as string;

    let subtopicId: string | null = null;
    const subtopicRef = String(refs.subtopic || '').trim();
    if (subtopicRef) {
      const { data, error } = await this.supabase
        .from('subtopics')
        .select('id, name, slug, is_active')
        .eq('topic_id', topicId)
        .eq('is_active', true);
      if (error) throw lookupError('Subtopic', error);
      const lower = subtopicRef.toLowerCase();
      const match = (data || []).find(
        (s: { id: string; name: string; slug: string }) =>
          s.id === subtopicRef || s.slug.toLowerCase() === lower || s.name.toLowerCase() === lower
      );
      if (!match) {
        return { target: null, error: `Subtopic '${subtopicRef}' not found under topic '${topicRef}' — create it via curriculum/onboarding first.` };
      }
      subtopicId = match.id;
    }

    let examId: string | null = null;
    const examRef = String(refs.exam || '').trim();
    if (examRef) {
      const { data, error } = await this.supabase.from('exams').select('id, slug, title, is_active').eq('is_active', true);
      if (error) throw lookupError('Exam', error);
      const lower = examRef.toLowerCase();
      const match = (data || []).find(
        (e: { id: string; slug: string; title: string }) =>
          e.id === examRef || e.slug.toLowerCase() === lower || e.title.toLowerCase() === lower
      );
      if (!match) {
        return { target: null, error: `Exam '${examRef}' not found — create it via Exam Onboarding first.` };
      }
      examId = match.id;
    }

    return { target: { topicId, subtopicId, examId }, error: null };
  }

  /** Resolves a pattern_section id to its subject id (legacy CSV column). Read-only. */
  async resolvePatternSectionSubject(patternSectionId: string): Promise<string | null> {
    const { data, error } = await this.supabase
      .from('pattern_sections')
      .select('id, subject_id')
      .eq('id', patternSectionId)
      .maybeSingle();
    if (error) throw lookupError('Pattern section', error);
    return data?.subject_id ?? null;
  }

  /** Lists active subjects → topics → subtopics for the admin Generate tab. */
  async listTaxonomyTree(): Promise<{
    subjects: Array<{ id: string; name: string }>;
    topics: Array<{ id: string; name: string; subjectId: string }>;
    subtopics: Array<{ id: string; name: string; topicId: string }>;
    exams: Array<{ id: string; title: string; slug: string }>;
  }> {
    const [s, t, st, e] = await Promise.all([
      this.supabase.from('subjects').select('id, name').eq('is_active', true).order('name'),
      this.supabase.from('topics').select('id, name, subject_id').eq('is_active', true).order('name'),
      this.supabase.from('subtopics').select('id, name, topic_id').eq('is_active', true).order('name'),
      this.supabase.from('exams').select('id, title, slug').eq('is_active', true).order('title'),
    ]);
    for (const [label, res] of [['Subject', s], ['Topic', t], ['Subtopic', st], ['Exam', e]] as const) {
      if (res.error) throw lookupError(label, res.error);
    }
    return {
      subjects: (s.data || []).map((r: { id: string; name: string }) => ({ id: r.id, name: r.name })),
      topics: (t.data || []).map((r: { id: string; name: string; subject_id: string }) => ({ id: r.id, name: r.name, subjectId: r.subject_id })),
      subtopics: (st.data || []).map((r: { id: string; name: string; topic_id: string }) => ({ id: r.id, name: r.name, topicId: r.topic_id })),
      exams: (e.data || []).map((r: { id: string; title: string; slug: string }) => ({ id: r.id, title: r.title, slug: r.slug })),
    };
  }
}
