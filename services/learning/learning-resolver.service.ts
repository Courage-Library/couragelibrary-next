/**
 * COURAGE LIBRARY — LEARNING RESOLVER (server-only)
 * Phase GAP2-2a (L2-2): the single resolution path from the taxonomy to learning content.
 *
 * INVARIANTS:
 * - Source of truth: learning_documents (+ learning_units, document_versions). The
 *   legacy learning stack (moved to schema retired in GAP2-2b) is never read here.
 * - Only PUBLISHED documents with a current published version (is_published AND
 *   review_status = 'PUBLISHED') of an active unit are returned.
 * - Metadata is read with the session client (anon/authenticated). Existing RLS already limits
 *   it to published rows, so no service role is needed for resolution.
 * - Entitlement comes ONLY from the current session user (auth.getUser → own user_entitlements
 *   via RLS). No method accepts a user id.
 * - PRO documents for non-PRO viewers: is_locked = true and no body is ever loaded.
 * - Batch resolution is a single query regardless of the number of topics (no N+1).
 * - CA-4: NODE_LESSON documents belong to a master-tree node (no learning unit); a SUBTOPIC / CONCEPT lesson rolls up to
 *   its TOPIC (at most two parent hops, batched). The lesson language follows the signed-in user's content language:
 *   Hindi when a current Hindi version is published (labelled when it was translated from an older English version),
 *   else English ("Hindi coming soon" for a Hindi reader).
 */

import { createAdminServerSupabaseClient, createServerSupabaseClient } from '@/lib/supabase/server';
import { validateLesson, type LessonBlock, type LessonLinkMap, type LessonMeta } from '@/lib/lessons/blocks';
import { userContentLanguage } from '@/lib/exams/exam-page-server';
import { lessonAccessLevel, type LessonAccessSettings } from '@/lib/learning/chapter-access';
import { getLessonAccessSettings } from '@/lib/learning/lesson-access-settings';
import { learnHref } from '@/lib/learn/paths';

/** CA-3: private bucket of lesson images (migration 117); students get short-lived signed URLs from the server. */
export const LESSON_IMAGE_BUCKET = 'lesson-images';

export const LEARNING_DOCUMENT_TYPE_ORDER = [
  'NODE_LESSON',
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

/** CA-4: which language the reader got and why. */
export type LessonLanguageState = 'EN' | 'HI' | 'HI_OUTDATED' | 'HI_COMING_SOON';

export interface LearningArticle extends ResolvedLearningDocument {
  /** CA-3: the DB lesson (meta + blocks); null whenever is_locked (never loaded for locked viewers). */
  lesson: { meta: LessonMeta; blocks: LessonBlock[]; links: LessonLinkMap } | null;
  /** CA-4: the lesson's language ("hi" only when a published Hindi version is served) */
  lesson_language: 'en' | 'hi';
  language_state: LessonLanguageState;
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
  learning_units!inner(id, topic_id, title, estimated_minutes, is_active, topics:canonical_taxonomy_nodes!learning_units_topic_id_node_fkey(id, name, slug, subject_id:root_subject_id, subjects:root_subject_id(name))),
  current_version:document_versions!fk_learning_doc_current_published_version(id, is_published, review_status, published_at, content_format, language)
`;

/** CA-4: node lessons (no learning unit; the node is the owner). */
const NODE_DOC_SELECT = `
  id, canonical_slug, document_type, access_level, status, current_published_version_id, node_id,
  node:canonical_taxonomy_nodes!learning_documents_node_id_fkey(id, name, slug, node_type, parent_id, is_active, root_subject_id, hierarchy_path),
  current_version:document_versions!fk_learning_doc_current_published_version(id, is_published, review_status, published_at, content_format, language)
`;
const NODE_LESSON_MINUTES = 20;

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

/**
 * True only for a PUBLISHED document whose current version is a published DB lesson (CA-3: content_format BLOCKS — the
 * legacy MDX path is retired, its versions are never served) and whose unit is active.
 */
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
    ver.content_format === 'BLOCKS' &&
    Boolean(unit) &&
    unit.is_active !== false
  );
}

/** CA-4: a NODE_LESSON row is servable like a unit document, with an active node instead of an active unit. */
/** CA-4: the columns NODE_DOC_SELECT reads (an embed may come back as an object or a one-element list). */
interface VersionRef {
  id: string;
  is_published: boolean;
  review_status: string;
  published_at: string | null;
  content_format: string;
  language: string;
}
interface NodeLessonNode {
  id: string;
  name: string;
  slug: string;
  node_type: string;
  parent_id: string | null;
  is_active: boolean;
  root_subject_id: string | null;
  hierarchy_path: string;
}
interface NodeLessonRow {
  id: string;
  canonical_slug: string;
  document_type: string;
  access_level: string;
  status: string;
  current_published_version_id: string | null;
  node_id: string | null;
  node: NodeLessonNode | NodeLessonNode[] | null;
  current_version: VersionRef | VersionRef[] | null;
}
const one = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? x[0] ?? null : x ?? null);

export function isServableNodeRow(row: NodeLessonRow | null | undefined): boolean {
  const node = one(row?.node);
  const ver = one(row?.current_version);
  return (
    row?.document_type === 'NODE_LESSON' &&
    row.status === 'PUBLISHED' &&
    Boolean(row.current_published_version_id) &&
    ver !== null &&
    ver.id === row.current_published_version_id &&
    ver.is_published === true &&
    ver.review_status === 'PUBLISHED' &&
    ver.content_format === 'BLOCKS' &&
    node !== null &&
    node.is_active !== false
  );
}

type SessionClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;
interface NodeRef {
  id: string;
  name: string;
  node_type: string;
  parent_id: string | null;
}

/** node id → its TOPIC (itself, its parent, or its grandparent); batched, at most two queries. */
async function topicsOf(supabase: SessionClient, nodes: NodeRef[]): Promise<Map<string, NodeRef>> {
  const out = new Map<string, NodeRef>();
  const pending = nodes.filter((n) => {
    if (n.node_type === 'TOPIC') out.set(n.id, n);
    return n.node_type !== 'TOPIC';
  });
  let frontier = new Map(pending.map((n) => [n.id, n.parent_id]));
  for (let hop = 0; hop < 2 && frontier.size; hop++) {
    const parentIds = [...new Set([...frontier.values()].filter((x): x is string => Boolean(x)))];
    if (!parentIds.length) break;
    const { data } = await supabase.from('canonical_taxonomy_nodes').select('id, name, node_type, parent_id').in('id', parentIds);
    const byId = new Map((data || []).map((n) => [n.id, n as NodeRef]));
    const next = new Map<string, string | null>();
    frontier.forEach((parentId, childId) => {
      const p = parentId ? byId.get(parentId) : undefined;
      if (!p) return;
      if (p.node_type === 'TOPIC') out.set(childId, p);
      else next.set(childId, p.parent_id);
    });
    frontier = next;
  }
  return out;
}

/**
 * CA-5: a node lesson's access comes from its position in its MASTER chapter (fn_servable_node_lessons) and the
 * settings — never from the document's own access column. A lesson without a known position is treated as PRO
 * whenever gating is on (fail-closed).
 */
async function nodeLessonPositions(supabase: SessionClient): Promise<Map<string, number>> {
  const { data, error } = await supabase.rpc('fn_servable_node_lessons');
  if (error || !Array.isArray(data)) return new Map();
  return new Map(data.map((r) => [r.document_id, r.chapter_position]));
}

function toResolvedNode(row: NodeLessonRow, access: LearningViewerAccess, topic: NodeRef | undefined, gate: { settings: LessonAccessSettings; positions: Map<string, number> }): ResolvedLearningDocument {
  const node = one(row.node);
  const accessLevel: LearningAccessLevel = lessonAccessLevel(gate.positions.get(row.id) ?? Number.MAX_SAFE_INTEGER, gate.settings, row.id);
  return {
    id: row.id,
    canonical_slug: row.canonical_slug,
    title: node?.name || row.canonical_slug,
    document_type: 'NODE_LESSON',
    access_level: accessLevel,
    estimated_minutes: NODE_LESSON_MINUTES,
    // CA-6: a node lesson's one indexable URL is its master page (/articles/<slug> redirects there)
    href: node?.hierarchy_path ? learnHref(node.hierarchy_path) : `/articles/${row.canonical_slug}`,
    is_locked: accessLevel === 'PRO' && !access.hasPro,
    topic_id: topic?.id || node?.id || row.node_id || '',
    topic_name: topic?.name || null,
  };
}

/** Servable node lessons (optionally only those whose node is one of / under one of the given topics). */
async function servableNodeLessons(supabase: SessionClient, access: LearningViewerAccess, topicIds: string[] | null): Promise<ResolvedLearningDocument[]> {
  let nodeIds: string[] | null = null;
  if (topicIds) {
    if (!topicIds.length) return [];
    const { data: subs } = await supabase.from('canonical_taxonomy_nodes').select('id').in('parent_id', topicIds);
    const subIds = (subs || []).map((n) => n.id);
    const { data: concepts } = subIds.length ? await supabase.from('canonical_taxonomy_nodes').select('id').in('parent_id', subIds) : { data: [] as { id: string }[] };
    nodeIds = [...topicIds, ...subIds, ...(concepts || []).map((n) => n.id)];
  }
  let query = supabase.from('learning_documents').select(NODE_DOC_SELECT).eq('document_type', 'NODE_LESSON').eq('status', 'PUBLISHED').not('current_published_version_id', 'is', null);
  if (nodeIds) query = query.in('node_id', nodeIds);
  const { data, error } = await query;
  if (error || !Array.isArray(data)) return [];
  const rows = (data as NodeLessonRow[]).filter(isServableNodeRow);
  if (!rows.length) return [];
  const [topics, settings, positions] = await Promise.all([
    topicsOf(supabase, rows.map((r) => one(r.node)).filter((n): n is NodeLessonNode => n !== null)),
    getLessonAccessSettings(),
    nodeLessonPositions(supabase),
  ]);
  return rows.map((r) => toResolvedNode(r, access, r.node_id ? topics.get(r.node_id) : undefined, { settings, positions }));
}

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

/** Node links / practice links → hrefs (active nodes only, rolled up to their topic) and image ids → signed URLs. */
export async function resolveLessonLinks(admin: ReturnType<typeof createAdminServerSupabaseClient>, blocks: LessonBlock[]): Promise<LessonLinkMap> {
  const nodeIds = new Set<string>();
  const assets = new Set<string>();
  const scan = (t: string | undefined) => {
    if (!t) return;
    for (const m of t.matchAll(/\[\[node:([0-9a-f-]{36})\|/gi)) nodeIds.add(m[1].toLowerCase());
  };
  for (const b of blocks) {
    if (b.type === 'practice_link') nodeIds.add(b.node_id.toLowerCase());
    if (b.type === 'image') assets.add(b.asset_id);
    scan(JSON.stringify(b));
  }
  const links: LessonLinkMap = { nodes: {}, images: {} };
  if (nodeIds.size) {
    const { data } = await admin.from('canonical_taxonomy_nodes').select('id, node_type, parent_id, is_active').in('id', [...nodeIds]).eq('is_active', true);
    for (const n of data || []) {
      const { data: topicId } = await admin.rpc('fn_taxonomy_topic_of', { p_node_id: n.id });
      if (typeof topicId === 'string') links.nodes[n.id] = { topicHref: `/learn/topics/${topicId}`, practiceHref: `/practice/session?topic=${topicId}` };
    }
  }
  for (const a of assets) {
    const { data } = await admin.storage.from(LESSON_IMAGE_BUCKET).createSignedUrl(a, 60 * 60);
    if (data?.signedUrl) links.images[a] = data.signedUrl;
  }
  return links;
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
    const { data } = await supabase
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
      supabase
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
    // CA-4: node lessons of these topics (and of their subtopics / concepts)
    for (const doc of await servableNodeLessons(supabase, access, ids)) {
      if (result.has(doc.topic_id)) result.get(doc.topic_id)!.push(doc);
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
    const { data } = await supabase.from('questions').select('canonical_topic_id').eq('id', questionId).maybeSingle();
    const topicId = data?.canonical_topic_id as string | undefined;
    return topicId ? this.resolveForTopic(topicId) : [];
  }

  /**
   * GAP2-2b: documents by id (course lessons reference learning_document_id). One query; only
   * servable documents are returned; no bodies (the /articles page loads them with access checks).
   */
  static async resolveDocuments(documentIds: string[]): Promise<Map<string, ResolvedLearningDocument>> {
    const ids = Array.from(new Set((documentIds || []).filter((t) => typeof t === 'string' && UUID_RE.test(t))));
    const result = new Map<string, ResolvedLearningDocument>();
    if (ids.length === 0) return result;
    const supabase = await createServerSupabaseClient();
    const [access, { data, error }] = await Promise.all([
      this.getViewerAccess(),
      supabase.from('learning_documents').select(DOC_SELECT).eq('status', 'PUBLISHED').not('current_published_version_id', 'is', null).in('id', ids),
    ]);
    if (error || !Array.isArray(data)) return result;
    for (const row of data) if (isServableDocumentRow(row)) result.set(row.id, toResolved(row, access));
    // CA-4: node lessons by id
    const missing = ids.filter((id) => !result.has(id));
    if (missing.length) {
      const { data: nodeRows } = await supabase.from('learning_documents').select(NODE_DOC_SELECT).in('id', missing);
      const servable = ((nodeRows || []) as NodeLessonRow[]).filter(isServableNodeRow);
      const [topics, settings, positions] = await Promise.all([
        topicsOf(supabase, servable.map((r) => one(r.node)).filter((n): n is NodeLessonNode => n !== null)),
        getLessonAccessSettings(),
        nodeLessonPositions(supabase),
      ]);
      for (const r of servable) result.set(r.id, toResolvedNode(r, access, r.node_id ? topics.get(r.node_id) : undefined, { settings, positions }));
    }
    return result;
  }

  /** Published documents for the /articles index (optionally one topic). No bodies. */
  static async listPublished(filters: { topicId?: string } = {}): Promise<ResolvedLearningDocument[]> {
    const supabase = await createServerSupabaseClient();
    let query = supabase.from('learning_documents').select(DOC_SELECT).eq('status', 'PUBLISHED').not('current_published_version_id', 'is', null);
    if (filters.topicId) query = query.eq('learning_units.topic_id', filters.topicId);
    const [access, { data, error }] = await Promise.all([this.getViewerAccess(), query]);
    if (error || !Array.isArray(data)) return [];
    const nodeDocs = await servableNodeLessons(supabase, access, filters.topicId ? [filters.topicId] : null);
    return sortLearningDocuments([...data.filter(isServableDocumentRow).map((r) => toResolved(r, access)), ...nodeDocs]);
  }

  /**
   * One article by slug. The lesson (blocks) is loaded with the service role ONLY when the viewer may read it (the
   * columns are not client-readable, migration 117); locked viewers get metadata with lesson = null.
   */
  static async getArticle(slug: string): Promise<LearningArticle | null> {
    if (!slug) return null;
    const supabase = await createServerSupabaseClient();
    const [access, wanted, { data, error }] = await Promise.all([
      this.getViewerAccess(),
      userContentLanguage(),
      supabase.from('learning_documents').select(DOC_SELECT).eq('canonical_slug', slug).eq('status', 'PUBLISHED').maybeSingle(),
    ]);
    if (error) return null;

    let doc: ResolvedLearningDocument;
    let ver: VersionRef | null;
    let topicSlug: string | null = null;
    let subjectId: string | null = null;
    let subjectName: string | null = null;
    if (data && isServableDocumentRow(data)) {
      doc = toResolved(data, access);
      const unit = Array.isArray(data.learning_units) ? data.learning_units[0] : data.learning_units;
      const topic = Array.isArray(unit?.topics) ? unit.topics[0] : unit?.topics;
      const subject = Array.isArray(topic?.subjects) ? topic.subjects[0] : topic?.subjects;
      ver = one(data.current_version as VersionRef | VersionRef[] | null);
      topicSlug = topic?.slug || null;
      subjectId = topic?.subject_id || null;
      subjectName = subject?.name || null;
    } else {
      // CA-4: a node lesson
      const { data: nodeRow } = await supabase.from('learning_documents').select(NODE_DOC_SELECT).eq('canonical_slug', slug).eq('document_type', 'NODE_LESSON').maybeSingle();
      const row = nodeRow as NodeLessonRow | null;
      if (!row || !isServableNodeRow(row)) return null;
      const node = one(row.node);
      const [topics, settings, positions] = await Promise.all([
        node ? topicsOf(supabase, [node]) : Promise.resolve(new Map<string, NodeRef>()),
        getLessonAccessSettings(),
        nodeLessonPositions(supabase),
      ]);
      doc = toResolvedNode(row, access, node ? topics.get(node.id) : undefined, { settings, positions });
      ver = one(row.current_version);
      subjectId = node?.root_subject_id || null;
      if (subjectId) {
        const { data: subject } = await supabase.from('canonical_taxonomy_nodes').select('name').eq('id', subjectId).maybeSingle();
        subjectName = subject?.name || null;
      }
      if (doc.topic_id) {
        const { data: t } = await supabase.from('canonical_taxonomy_nodes').select('slug').eq('id', doc.topic_id).maybeSingle();
        topicSlug = t?.slug || null;
      }
    }

    let lesson: LearningArticle['lesson'] = null;
    let language: 'en' | 'hi' = 'en';
    let state: LessonLanguageState = wanted === 'hi' ? 'HI_COMING_SOON' : 'EN';
    if (!doc.is_locked && ver?.id) {
      try {
        const admin = createAdminServerSupabaseClient();
        // CA-4: a Hindi reader gets the current published Hindi version when there is one
        const hi =
          wanted === 'hi'
            ? (
                await admin
                  .from('document_versions')
                  .select('id, lesson_meta, blocks, translated_from_version_id')
                  .eq('document_id', doc.id)
                  .eq('language', 'hi')
                  .eq('is_current', true)
                  .eq('is_published', true)
                  .eq('content_format', 'BLOCKS')
                  .maybeSingle()
              ).data
            : null;
        const hv = hi ? validateLesson(hi.lesson_meta, hi.blocks) : null;
        if (hi && hv && hv.ok) {
          lesson = { meta: hv.meta, blocks: hv.blocks, links: await resolveLessonLinks(admin, hv.blocks) };
          language = 'hi';
          state = hi.translated_from_version_id === ver.id ? 'HI' : 'HI_OUTDATED';
        } else {
          const { data: content } = await admin
            .from('document_versions')
            .select('lesson_meta, blocks')
            .eq('id', ver.id)
            .eq('content_format', 'BLOCKS')
            .eq('is_published', true)
            .maybeSingle();
          // defence in depth: the stored blocks passed the DB validator; re-check before rendering
          const v = content ? validateLesson(content.lesson_meta, content.blocks) : null;
          if (v && v.ok) lesson = { meta: v.meta, blocks: v.blocks, links: await resolveLessonLinks(admin, v.blocks) };
        }
      } catch {
        lesson = null;
      }
    }

    return {
      ...doc,
      lesson,
      lesson_language: language,
      language_state: lesson ? state : 'EN',
      published_at: ver?.published_at || null,
      subject_id: subjectId,
      subject_name: subjectName,
      topic_slug: topicSlug,
    };
  }
}
