/**
 * COURAGE LIBRARY — LEARNING RESOLVER (server-only)
 * Phase GAP2-2a (L2-2): the single resolution path from the taxonomy to learning content.
 *
 * INVARIANTS:
 * - Source of truth: learning_documents (+ learning_units, document_versions). The legacy
 *   learning_resources / learning_resource_topics / articles stack is never read here.
 * - Only PUBLISHED documents with a current published version (is_published AND
 *   review_status = 'PUBLISHED') of an active unit are returned.
 * - Metadata is read with the session client (anon/authenticated). Existing RLS already limits
 *   it to published rows, so no service role is needed for resolution.
 * - Entitlement comes ONLY from the current session user (auth.getUser → own user_entitlements
 *   via RLS). No method accepts a user id.
 * - PRO documents for non-PRO viewers: is_locked = true and no body is ever loaded.
 * - Batch resolution is a single query regardless of the number of topics (no N+1).
 */

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getLearningArtifactStorage, LEARNING_ARTIFACT_BUCKET } from '@/services/storage/learning-artifact-storage';

export const LEARNING_DOCUMENT_TYPE_ORDER = [
  'CONCEPT_LESSON',
  'TOPIC_SUMMARY_REVISION',
  'COMMON_TRAPS_AND_MISTAKES',
  'WORKED_EXAMPLES',
  'FORMULA_SHORTCUT_SHEET',
  'PYQ_DEEP_DIVE',
] as const;
export type LearningDocumentType = (typeof LEARNING_DOCUMENT_TYPE_ORDER)[number];
export type LearningAccessLevel = 'FREE' | 'PRO';

export interface ResolvedLearningDocument {
  id: string;
  canonical_slug: string;
  title: string;
  document_type: LearningDocumentType;
  access_level: LearningAccessLevel;
  estimated_minutes: number;
  href: string;
  is_locked: boolean;
  topic_id: string;
  topic_name: string | null;
}

export interface LearningArticle extends ResolvedLearningDocument {
  /** null whenever is_locked (body is never loaded for locked viewers). */
  body: string | null;
  published_at: string | null;
  subject_id: string | null;
  subject_name: string | null;
  topic_slug: string | null;
}

export interface LearningViewerAccess {
  isAuthenticated: boolean;
  hasPro: boolean;
}

const PRO_ENTITLEMENTS = ['PRO_SUBSCRIPTION', 'PROMOTIONAL_PASS'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DOC_SELECT = `
  id, canonical_slug, document_type, access_level, status, current_published_version_id,
  learning_units!inner(id, topic_id, title, estimated_minutes, is_active, topics(id, name, slug, subject_id, subjects(name))),
  current_version:document_versions!fk_learning_doc_current_published_version(id, is_published, review_status, published_at, compiled_artifact_storage_key)
`;

const rank = (t: string) => {
  const i = (LEARNING_DOCUMENT_TYPE_ORDER as readonly string[]).indexOf(t);
  return i === -1 ? 99 : i;
};

/** Stable order: document type (L2-2), then title, then slug. */
export function sortLearningDocuments<T extends { document_type: string; title: string; canonical_slug: string }>(docs: T[]): T[] {
  return [...docs].sort(
    (a, b) => rank(a.document_type) - rank(b.document_type) || a.title.localeCompare(b.title) || a.canonical_slug.localeCompare(b.canonical_slug)
  );
}

/** True only for a PUBLISHED document whose current version is published and whose unit is active. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isServableDocumentRow(row: any): boolean {
  const unit = Array.isArray(row?.learning_units) ? row.learning_units[0] : row?.learning_units;
  const ver = Array.isArray(row?.current_version) ? row.current_version[0] : row?.current_version;
  return (
    row?.status === 'PUBLISHED' &&
    Boolean(row?.current_published_version_id) &&
    Boolean(ver) &&
    ver.id === row.current_published_version_id &&
    ver.is_published === true &&
    ver.review_status === 'PUBLISHED' &&
    Boolean(unit) &&
    unit.is_active !== false
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toResolved(row: any, access: LearningViewerAccess): ResolvedLearningDocument {
  const unit = Array.isArray(row.learning_units) ? row.learning_units[0] : row.learning_units;
  const topic = Array.isArray(unit?.topics) ? unit.topics[0] : unit?.topics;
  const accessLevel: LearningAccessLevel = row.access_level === 'PRO' ? 'PRO' : 'FREE';
  return {
    id: row.id,
    canonical_slug: row.canonical_slug,
    title: unit?.title || row.canonical_slug,
    document_type: row.document_type,
    access_level: accessLevel,
    estimated_minutes: unit?.estimated_minutes || 10,
    href: `/articles/${row.canonical_slug}`,
    is_locked: accessLevel === 'PRO' && !access.hasPro,
    topic_id: unit?.topic_id,
    topic_name: topic?.name || null,
  };
}

export class LearningResolverService {
  /** Viewer access from the current session only. Anonymous → no PRO. */
  static async getViewerAccess(): Promise<LearningViewerAccess> {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { isAuthenticated: false, hasPro: false };
    const nowIso = new Date().toISOString();
    // RLS ("Users can read own entitlements") restricts this to the session user's rows.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from('user_entitlements')
      .select('id, starts_at, expires_at')
      .in('entitlement_type', PRO_ENTITLEMENTS)
      .eq('is_active', true)
      .lte('starts_at', nowIso)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .limit(1);
    return { isAuthenticated: true, hasPro: Array.isArray(data) && data.length > 0 };
  }

  /** Batch: topicId → ordered servable documents. One query for any number of topics. */
  static async resolveForTopics(topicIds: string[]): Promise<Map<string, ResolvedLearningDocument[]>> {
    const ids = Array.from(new Set((topicIds || []).filter((t) => typeof t === 'string' && UUID_RE.test(t))));
    const result = new Map<string, ResolvedLearningDocument[]>();
    ids.forEach((id) => result.set(id, []));
    if (ids.length === 0) return result;

    const supabase = await createServerSupabaseClient();
    const [access, { data, error }] = await Promise.all([
      this.getViewerAccess(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from('learning_documents')
        .select(DOC_SELECT)
        .eq('status', 'PUBLISHED')
        .not('current_published_version_id', 'is', null)
        .in('learning_units.topic_id', ids),
    ]);
    if (error || !Array.isArray(data)) return result;

    for (const row of data) {
      if (!isServableDocumentRow(row)) continue;
      const doc = toResolved(row, access);
      if (!result.has(doc.topic_id)) continue;
      result.get(doc.topic_id)!.push(doc);
    }
    result.forEach((docs, id) => result.set(id, sortLearningDocuments(docs)));
    return result;
  }

  static async resolveForTopic(topicId: string): Promise<ResolvedLearningDocument[]> {
    if (!topicId) return [];
    return (await this.resolveForTopics([topicId])).get(topicId) || [];
  }

  /** questionId → questions.canonical_topic_id → documents. */
  static async resolveForQuestion(questionId: string): Promise<ResolvedLearningDocument[]> {
    if (!questionId) return [];
    const supabase = await createServerSupabaseClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any).from('questions').select('canonical_topic_id').eq('id', questionId).maybeSingle();
    const topicId = data?.canonical_topic_id as string | undefined;
    return topicId ? this.resolveForTopic(topicId) : [];
  }

  /** Published documents for the /articles index (optionally one topic). No bodies. */
  static async listPublished(filters: { topicId?: string } = {}): Promise<ResolvedLearningDocument[]> {
    const supabase = await createServerSupabaseClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (supabase as any).from('learning_documents').select(DOC_SELECT).eq('status', 'PUBLISHED').not('current_published_version_id', 'is', null);
    if (filters.topicId) query = query.eq('learning_units.topic_id', filters.topicId);
    const [access, { data, error }] = await Promise.all([this.getViewerAccess(), query]);
    if (error || !Array.isArray(data)) return [];
    return sortLearningDocuments(data.filter(isServableDocumentRow).map((r) => toResolved(r, access)));
  }

  /**
   * One article by slug. The body is loaded from private storage ONLY when the viewer may read
   * it; locked viewers get metadata with body = null.
   */
  static async getArticle(slug: string): Promise<LearningArticle | null> {
    if (!slug) return null;
    const supabase = await createServerSupabaseClient();
    const [access, { data, error }] = await Promise.all([
      this.getViewerAccess(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).from('learning_documents').select(DOC_SELECT).eq('canonical_slug', slug).eq('status', 'PUBLISHED').maybeSingle(),
    ]);
    if (error || !data || !isServableDocumentRow(data)) return null;

    const doc = toResolved(data, access);
    const unit = Array.isArray(data.learning_units) ? data.learning_units[0] : data.learning_units;
    const topic = Array.isArray(unit?.topics) ? unit.topics[0] : unit?.topics;
    const subject = Array.isArray(topic?.subjects) ? topic.subjects[0] : topic?.subjects;
    const ver = Array.isArray(data.current_version) ? data.current_version[0] : data.current_version;

    let body: string | null = null;
    if (!doc.is_locked && ver?.compiled_artifact_storage_key) {
      try {
        const res = await getLearningArtifactStorage().get(LEARNING_ARTIFACT_BUCKET, ver.compiled_artifact_storage_key);
        body = res?.data ? res.data.toString('utf8') : null;
      } catch {
        body = null;
      }
    }

    return {
      ...doc,
      body,
      published_at: ver?.published_at || null,
      subject_id: topic?.subject_id || null,
      subject_name: subject?.name || null,
      topic_slug: topic?.slug || null,
    };
  }
}
