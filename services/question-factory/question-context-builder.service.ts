/**
 * COURAGE LIBRARY — QUESTION FACTORY CONTEXT BUILDER
 * Phase QF-1: Question Factory Core
 *
 * Builds the deterministic, bounded (≤ 32,000 chars) authoring context for
 * contract CL-QUESTION-AUTHOR-v1.0 and its SHA-256 contextHash.
 *
 * INVARIANTS:
 * - Read-only. Taxonomy is resolved only through QuestionTaxonomyResolver.
 * - Deterministic: recursive key sort; same DB state + target → same hash.
 * - The hash covers the authoritative DATA (target, taxonomy, exam projection,
 *   published stems, trap codes, contract) — not the requested count/mix — so
 *   Gate 3 can rebuild it from the target alone and detect stale prompts.
 * - Only PUBLISHED + current stems are used as the "do not duplicate" list.
 * - All DB text is HTML-escaped (< >) before it reaches the prompt.
 */

import crypto from 'crypto';
import {
  QuestionAuthoringContext,
  QuestionContextRequest,
  QuestionFactoryError,
  QUESTION_CONTRACT_VERSION,
  QUESTION_SPEC_VERSION,
  QF_MAX_CONTEXT_CHARS,
  QF_MAX_EXISTING_STEMS,
  QF_MAX_ITEMS_PER_BATCH,
  QF_STEM_PREVIEW_CHARS,
} from '@/types/question-factory';
import { QuestionTaxonomyResolver } from './question-taxonomy-resolver';

const MAX_DESCRIPTION_CHARS = 1000;

type SupabaseLike = any;

export interface QuestionContextRawData {
  subject: { id: string; name: string; description?: string | null };
  topic: { id: string; name: string; description?: string | null };
  subtopic?: { id: string; name: string; description?: string | null } | null;
  exam?: { id: string; slug: string; name: string; weightage?: string | null; depth?: string | null } | null;
  publishedStems: Array<{ versionId: string; stem: string; createdAt?: string }>;
  cognitiveTrapCodes: string[];
}

export function escapeContextText(text: string | null | undefined): string {
  return String(text ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return '[' + value.map((v) => canonicalStringify(v)).join(',') + ']';
  const obj = value as Record<string, unknown>;
  return (
    '{' +
    Object.keys(obj)
      .sort()
      .map((k) => JSON.stringify(k) + ':' + canonicalStringify(obj[k]))
      .join(',') +
    '}'
  );
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export class QuestionContextBuilder {
  /** Pure assembly from raw data (used by tests and by buildContext). */
  static assemble(raw: QuestionContextRawData, request: QuestionContextRequest): QuestionAuthoringContext {
    if (!Number.isInteger(request.count) || request.count < 1 || request.count > QF_MAX_ITEMS_PER_BATCH) {
      throw new QuestionFactoryError('INVALID_REQUEST', `count must be an integer between 1 and ${QF_MAX_ITEMS_PER_BATCH}.`);
    }
    const mix = request.difficultyMix;
    const mixValues = [mix.easy, mix.medium, mix.hard];
    if (mixValues.some((v) => !Number.isInteger(v) || v < 0) || mixValues.reduce((a, b) => a + b, 0) !== request.count) {
      throw new QuestionFactoryError('INVALID_REQUEST', 'difficultyMix must be non-negative integers summing to count.');
    }

    const esc = (t: string | null | undefined, max = MAX_DESCRIPTION_CHARS) => truncate(escapeContextText(t), max);

    // Deterministic stem ordering independent of input order.
    const stems = [...raw.publishedStems]
      .sort((a, b) => (a.versionId < b.versionId ? -1 : a.versionId > b.versionId ? 1 : 0))
      .slice(0, QF_MAX_EXISTING_STEMS)
      .map((s) => truncate(escapeContextText(s.stem.replace(/\s+/g, ' ').trim()), QF_STEM_PREVIEW_CHARS));

    const context: QuestionAuthoringContext = {
      contractVersion: QUESTION_CONTRACT_VERSION,
      specVersion: QUESTION_SPEC_VERSION,
      target: {
        topicId: raw.topic.id,
        subtopicId: raw.subtopic?.id ?? null,
        examId: raw.exam?.id ?? null,
      },
      subject: { id: raw.subject.id, name: esc(raw.subject.name, 200), description: esc(raw.subject.description) },
      topic: { id: raw.topic.id, name: esc(raw.topic.name, 200), description: esc(raw.topic.description) },
      subtopic: raw.subtopic
        ? { id: raw.subtopic.id, name: esc(raw.subtopic.name, 200), description: esc(raw.subtopic.description) }
        : null,
      exam: raw.exam
        ? {
            id: raw.exam.id,
            slug: esc(raw.exam.slug, 200),
            name: esc(raw.exam.name, 200),
            weightage: raw.exam.weightage ? esc(raw.exam.weightage, 100) : null,
            depth: raw.exam.depth ? esc(raw.exam.depth, 100) : null,
          }
        : null,
      request: { count: request.count, difficultyMix: { easy: mix.easy, medium: mix.medium, hard: mix.hard } },
      doNotDuplicateStems: stems,
      allowedCognitiveTraps: [...raw.cognitiveTrapCodes].map((c) => esc(c, 64)).sort(),
      contextHash: '',
      contextCharacters: 0,
    };

    // Enforce the size bound by dropping the least-recent stems (deterministic).
    while (canonicalStringify(context).length > QF_MAX_CONTEXT_CHARS && context.doNotDuplicateStems.length > 0) {
      context.doNotDuplicateStems = context.doNotDuplicateStems.slice(0, -1);
    }
    const size = canonicalStringify(context).length;
    if (size > QF_MAX_CONTEXT_CHARS) {
      throw new QuestionFactoryError('CONTEXT_TOO_LARGE', `Context exceeds ${QF_MAX_CONTEXT_CHARS} characters.`);
    }

    context.contextHash = this.computeContextHash(context);
    context.contextCharacters = size;
    return context;
  }

  /** SHA-256 over authoritative data only (excludes count/mix and the hash itself). */
  static computeContextHash(context: QuestionAuthoringContext): string {
    const payload = {
      contractVersion: context.contractVersion,
      specVersion: context.specVersion,
      target: context.target,
      subject: context.subject,
      topic: context.topic,
      subtopic: context.subtopic,
      exam: context.exam,
      doNotDuplicateStems: context.doNotDuplicateStems,
      allowedCognitiveTraps: context.allowedCognitiveTraps,
    };
    return crypto.createHash('sha256').update(canonicalStringify(payload)).digest('hex');
  }

  /** Builds the context from the database (read-only). Throws QuestionFactoryError on any failure. */
  static async buildContext(supabase: SupabaseLike, request: QuestionContextRequest): Promise<QuestionAuthoringContext> {
    const raw = await this.fetchRawData(supabase, {
      topicId: request.topicId,
      subtopicId: request.subtopicId ?? null,
      examId: request.examId ?? null,
    });
    return this.assemble(raw, request);
  }

  /** Rebuilds only the hash for a target (Gate 3 stale-context check). */
  static async rebuildContextHash(
    supabase: SupabaseLike,
    target: { topicId: string; subtopicId?: string | null; examId?: string | null }
  ): Promise<string> {
    const raw = await this.fetchRawData(supabase, {
      topicId: target.topicId,
      subtopicId: target.subtopicId ?? null,
      examId: target.examId ?? null,
    });
    // count/mix are excluded from the hash; any valid request yields the same hash.
    return this.assemble(raw, { topicId: target.topicId, count: 1, difficultyMix: { easy: 0, medium: 1, hard: 0 } }).contextHash;
  }

  static async fetchRawData(
    supabase: SupabaseLike,
    target: { topicId: string; subtopicId: string | null; examId: string | null }
  ): Promise<QuestionContextRawData> {
    const resolver = new QuestionTaxonomyResolver(supabase);
    const resolution = await resolver.resolveTarget(target);
    if (!resolution.ok || !resolution.topic) {
      throw new QuestionFactoryError('TARGET_INVALID', resolution.errors.join(' ') || 'Target could not be resolved.');
    }
    const topic = resolution.topic;

    let exam: QuestionContextRawData['exam'] = null;
    if (resolution.exam) {
      const projection = await this.fetchExamProjection(supabase, resolution.exam.id, topic.id);
      exam = {
        id: resolution.exam.id,
        slug: resolution.exam.slug,
        name: resolution.exam.title,
        weightage: projection?.weightage ?? null,
        depth: projection?.depth ?? null,
      };
    }

    const { data: stemRows, error: stemErr } = await supabase
      .from('question_versions')
      .select('id, question_text, created_at, questions!inner(canonical_topic_id, status)')
      .eq('questions.canonical_topic_id', topic.id)
      .eq('questions.status', 'published')
      .eq('lifecycle_status', 'PUBLISHED')
      .eq('is_current', true)
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .limit(QF_MAX_EXISTING_STEMS);
    if (stemErr) throw new QuestionFactoryError('CONTEXT_LOOKUP_FAILED', `Published stem lookup failed: ${stemErr.message}`);

    const { data: trapRows, error: trapErr } = await supabase
      .from('mistake_cognitive_types')
      .select('id, is_active')
      .eq('is_active', true);
    if (trapErr) throw new QuestionFactoryError('CONTEXT_LOOKUP_FAILED', `Cognitive trap lookup failed: ${trapErr.message}`);

    return {
      subject: { id: topic.subjectId, name: topic.subjectName, description: topic.subjectDescription },
      topic: { id: topic.id, name: topic.name, description: topic.description },
      subtopic: resolution.subtopic,
      exam,
      publishedStems: (stemRows || []).map((r: { id: string; question_text: string; created_at: string }) => ({
        versionId: r.id,
        stem: r.question_text,
        createdAt: r.created_at,
      })),
      cognitiveTrapCodes: (trapRows || [])
        .map((r: { id: string }) => r.id)
        .filter((id: string) => id !== 'UNCLASSIFIED'),
    };
  }

  /**
   * GAP2-4b: weightage / depth of the topic in the exam's PUBLISHED canonical syllabus (latest published version):
   * the UNIT node that maps the topic. null when the exam has no published syllabus or the topic is not mapped.
   */
  private static async fetchExamProjection(
    supabase: SupabaseLike,
    examId: string,
    topicId: string
  ): Promise<{ weightage: string | null; depth: string | null } | null> {
    const { data: versions, error: vErr } = await supabase
      .from('exam_syllabus_versions')
      .select('id, published_at')
      .eq('exam_id', examId)
      .eq('status', 'PUBLISHED')
      .eq('is_active', true)
      .order('published_at', { ascending: false });
    if (vErr) throw new QuestionFactoryError('CONTEXT_LOOKUP_FAILED', 'Exam syllabus lookup failed.');
    const order = (versions || []).map((v: { id: string }) => v.id);
    if (order.length === 0) return null;

    const { data: nodes, error: nErr } = await supabase
      .from('exam_syllabus_nodes')
      .select('syllabus_version_id, weightage_tier, required_cognitive_depth, exam_syllabus_canonical_mappings!inner(canonical_node_id)')
      .in('syllabus_version_id', order)
      .eq('node_kind', 'UNIT')
      .eq('exam_syllabus_canonical_mappings.canonical_node_id', topicId);
    if (nErr) throw new QuestionFactoryError('CONTEXT_LOOKUP_FAILED', 'Exam syllabus topic lookup failed.');
    if (!nodes || nodes.length === 0) return null;

    const latest = [...nodes].sort(
      (x: { syllabus_version_id: string }, y: { syllabus_version_id: string }) => order.indexOf(x.syllabus_version_id) - order.indexOf(y.syllabus_version_id),
    )[0] as { weightage_tier: string | null; required_cognitive_depth: string | null };
    return { weightage: latest.weightage_tier ?? null, depth: latest.required_cognitive_depth ?? null };
  }
}
