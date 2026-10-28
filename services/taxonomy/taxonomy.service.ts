/**
 * COURAGE LIBRARY — TAXONOMY SERVICE
 * Phase GAP2-1b: identity-unified taxonomy spine (T3); CA-1: master tree (Hindi names, aliases, move, merge)
 *
 * The ONLY application writer of the academic taxonomy.
 *
 * INVARIANTS:
 * - public.canonical_taxonomy_nodes is the write-master. subjects / topics / subtopics are a
 *   trigger-maintained projection with the same ids (migration 070); writing them directly is
 *   rejected by the database.
 * - Server-only: uses the service-role client; never import from client components.
 * - Every public method begins with the canonical guard (guardAdminAction / requireAdmin).
 * - Every mutation writes admin_audit_logs (actor_id, actor_email, action_type, target_entity,
 *   target_id, old_value, new_value, reason).
 * - No taxonomy is ever created implicitly from free text elsewhere in the app; callers that
 *   need a subject/topic must pick an existing node.
 */

import { guardAdminAction } from '@/lib/auth/require-admin';
import type { AppSupabaseClient } from '@/lib/supabase/types';
import type { Json, TablesInsert } from '@/types/database';
import { createAdminServerSupabaseClient } from '@/lib/supabase/server';

import {
  ALIAS_LANGUAGES,
  AliasLanguage,
  SUBJECT_TYPES,
  SubjectType,
  TAXONOMY_NODE_TYPES,
  TaxonomyAlias,
  TaxonomyNode,
  TaxonomyNodeType,
  TaxonomyResult,
  TaxonomyTreeNode,
  MERGE_CONFIRM_WORD,
  MERGE_REASON_MIN,
  isAllowedParent,
  slugifyTaxonomyName,
  validateAlias,
  validateNameHi,
  validateNodeName,
  validateNodeSlug,
  validateStateCode,
} from '@/services/taxonomy/taxonomy.rules';

export * from '@/services/taxonomy/taxonomy.rules';

export interface CreateTaxonomyNodeInput {
  parentId: string | null;
  nodeType: TaxonomyNodeType;
  name: string;
  slug?: string;
  displayOrder?: number;
  description?: string;
  nameHi?: string | null;
  subjectType?: SubjectType | null;
  stateCode?: string | null;
}

export interface TaxonomyNodeDetails {
  nameHi: string | null;
  subjectType: SubjectType | null;
  stateCode: string | null;
}

interface AdminContext {
  userId: string | null;
  userEmail: string;
  supabase: AppSupabaseClient;
}

const NODE_COLUMNS =
  'id, parent_id, root_subject_id, name, slug, node_type, node_depth, hierarchy_path, display_order, is_active, name_hi, subject_type, state_code, metadata, is_internal';
const fail = <T>(code: string, error: string): TaxonomyResult<T> => ({ success: false, code, error });

/** Maps database errors (trigger rules, unique keys of nodes and projection rows) to admin messages. */
export function mapTaxonomyDbError(error: { code?: string; message?: string } | null | undefined): { code: string; error: string } {
  const msg = error?.message || '';
  if (msg.includes('TAXONOMY_RULE:')) return { code: 'TAXONOMY_RULE', error: msg.slice(msg.indexOf('TAXONOMY_RULE:') + 15).trim() };
  if (msg.includes('TAXONOMY_PROJECTION_ONLY')) return { code: 'TAXONOMY_PROJECTION_ONLY', error: 'Subjects, topics and subtopics can only change through the taxonomy.' };
  // CA-1: a merge never edits a published / archived syllabus (fail-closed in fn_taxonomy_merge_nodes)
  if (msg.includes('SYLLABUS_IMMUTABLE')) return { code: 'SYLLABUS_LOCKED', error: 'A published or archived syllabus maps this node, so it cannot be merged. Nothing was changed.' };
  if (error?.code === '23505') {
    if (/uq_canonical_sibling_slug/.test(msg)) return { code: 'DUPLICATE_SLUG', error: 'A sibling node with this slug already exists.' };
    if (/subjects_name_key|uq_topics_subject_name|uq_subtopics_topic_name/.test(msg)) return { code: 'DUPLICATE_NAME', error: 'A subject/topic/subtopic with this name already exists here.' };
    if (/subjects_slug_key|uq_topics_subject_slug|uq_subtopics_topic_slug/.test(msg)) return { code: 'DUPLICATE_SLUG', error: 'This slug is already used under the same parent. Choose a different slug.' };
    if (/uq_canonical_hierarchy_path/.test(msg)) return { code: 'DUPLICATE_SLUG', error: 'Another node already has this path.' };
    return { code: 'DUPLICATE', error: 'A node with these values already exists.' };
  }
  if (error?.code === '23503') return { code: 'IN_USE', error: 'This node is referenced by other data and cannot be removed.' };
  if (error?.code === '23514') return { code: 'VALIDATION', error: 'A value is not allowed here (subject type, state code or Hindi name).' };
  return { code: 'DB_ERROR', error: 'The taxonomy change could not be saved.' };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toNode(r: any): TaxonomyNode {
  return {
    id: r.id,
    parentId: r.parent_id,
    rootSubjectId: r.root_subject_id,
    name: r.name,
    slug: r.slug,
    nodeType: r.node_type,
    depth: r.node_depth,
    path: r.hierarchy_path,
    displayOrder: r.display_order,
    isActive: r.is_active,
    nameHi: r.name_hi ?? null,
    subjectType: r.subject_type ?? null,
    stateCode: r.state_code ?? null,
    mergedInto: r.metadata && typeof r.metadata === 'object' && typeof r.metadata.merged_into === 'string' ? r.metadata.merged_into : null,
    isInternal: r.is_internal === true,
  };
}

export function buildTaxonomyTree(nodes: TaxonomyNode[]): TaxonomyTreeNode[] {
  const byId = new Map<string, TaxonomyTreeNode>();
  nodes.forEach((n) => byId.set(n.id, { ...n, children: [] }));
  const roots: TaxonomyTreeNode[] = [];
  byId.forEach((n) => {
    const parent = n.parentId ? byId.get(n.parentId) : undefined;
    if (parent) parent.children.push(n);
    else roots.push(n);
  });
  const sort = (list: TaxonomyTreeNode[]) => {
    list.sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name));
    list.forEach((c) => sort(c.children));
  };
  sort(roots);
  return roots;
}

export class TaxonomyService {
  /** SEC-1B Q1: structural writes are admin only; tree reads also allow staff. */
  private static async requireAdmin(opts: { allowStaff?: boolean } = {}): Promise<AdminContext | null> {
    const auth = await guardAdminAction({ allowStaff: Boolean(opts.allowStaff) });
    if (!auth.ok) return null;
    return { userId: auth.userId || null, userEmail: auth.userEmail || 'unknown', supabase: createAdminServerSupabaseClient() };
  }

  private static async audit(
    ctx: AdminContext,
    actionType: string,
    targetId: string,
    oldValue: Record<string, unknown> | null,
    newValue: Record<string, unknown> | null
  ): Promise<void> {
    const { error } = await ctx.supabase.from('admin_audit_logs').insert({
      actor_id: ctx.userId,
      actor_email: ctx.userEmail,
      action_type: actionType,
      target_entity: 'canonical_taxonomy_node',
      target_id: targetId,
      // audit payloads are plain JSON-serialisable objects built in this service
      old_value: oldValue as Json | null,
      new_value: newValue as Json | null,
      reason: null,
    });
    if (error) console.warn(`[TaxonomyService] audit log insert failed for ${actionType}: ${error.code || 'unknown'}`);
  }

  private static async getNode(ctx: AdminContext, id: string): Promise<TaxonomyNode | null> {
    const { data } = await ctx.supabase.from('canonical_taxonomy_nodes').select(NODE_COLUMNS).eq('id', id).maybeSingle();
    return data ? toNode(data) : null;
  }

  /** Full tree (all node types, active and inactive), ordered for display. */
  static async listTree(): Promise<TaxonomyResult<TaxonomyTreeNode[]>> {
    const ctx = await this.requireAdmin({ allowStaff: true });
    if (!ctx) return fail('UNAUTHORIZED', 'Unauthorized.');
    const { data, error } = await ctx.supabase.from('canonical_taxonomy_nodes').select(NODE_COLUMNS).order('hierarchy_path', { ascending: true });
    if (error) return fail('DB_ERROR', 'Could not load the taxonomy.');
    return { success: true, data: buildTaxonomyTree((data || []).map(toNode)) };
  }

  /** Nodes of one type (e.g. SUBJECT for section pickers). */
  static async listNodesByType(nodeType: TaxonomyNodeType, opts: { activeOnly?: boolean } = {}): Promise<TaxonomyResult<TaxonomyNode[]>> {
    const ctx = await this.requireAdmin({ allowStaff: true });
    if (!ctx) return fail('UNAUTHORIZED', 'Unauthorized.');
    let query = ctx.supabase.from('canonical_taxonomy_nodes').select(NODE_COLUMNS).eq('node_type', nodeType);
    if (opts.activeOnly) query = query.eq('is_active', true);
    const { data, error } = await query.order('display_order', { ascending: true }).order('name', { ascending: true });
    if (error) return fail('DB_ERROR', 'Could not load the taxonomy.');
    return { success: true, data: (data || []).map(toNode) };
  }

  static async createNode(input: CreateTaxonomyNodeInput): Promise<TaxonomyResult<TaxonomyNode>> {
    const ctx = await this.requireAdmin();
    if (!ctx) return fail('UNAUTHORIZED', 'Unauthorized.');
    if (!TAXONOMY_NODE_TYPES.includes(input.nodeType)) return fail('VALIDATION', 'Unknown node type.');
    const nameErr = validateNodeName(input.name);
    if (nameErr) return fail('VALIDATION', nameErr);
    const detailsErr = this.validateDetails(input.nodeType, { nameHi: input.nameHi ?? null, subjectType: input.subjectType ?? null, stateCode: input.stateCode ?? null });
    if (detailsErr) return fail('VALIDATION', detailsErr);
    const name = input.name.trim();
    const slug = (input.slug && input.slug.trim()) || slugifyTaxonomyName(name);
    const slugErr = validateNodeSlug(slug);
    if (slugErr) return fail('VALIDATION', slugErr);

    let parentType: TaxonomyNodeType | null = null;
    if (input.parentId) {
      const parent = await this.getNode(ctx, input.parentId);
      if (!parent) return fail('NOT_FOUND', 'Parent node not found.');
      parentType = parent.nodeType;
    }
    if (!isAllowedParent(input.nodeType, parentType)) {
      return fail('TAXONOMY_RULE', `A ${input.nodeType} node cannot be placed ${parentType ? `under a ${parentType} node` : 'at the root'}.`);
    }

    // hierarchy_path / node_depth are computed by the BEFORE INSERT trigger (GAP2-1b), so they are not sent.
    const row: Omit<TablesInsert<'canonical_taxonomy_nodes'>, 'hierarchy_path' | 'node_depth'> = {
      parent_id: input.parentId || null,
      name,
      slug,
      node_type: input.nodeType,
      display_order: Number.isFinite(input.displayOrder) ? Math.trunc(input.displayOrder as number) : 0,
      is_active: true,
      name_hi: input.nameHi && input.nameHi.trim() ? input.nameHi.trim() : null,
      subject_type: input.nodeType === 'SUBJECT' ? input.subjectType || null : null,
      state_code: input.stateCode || null,
      metadata: input.description && input.description.trim() ? { source: 'TAXONOMY_ADMIN', description: input.description.trim() } : { source: 'TAXONOMY_ADMIN' },
    };
    const { data, error } = await ctx.supabase.from('canonical_taxonomy_nodes').insert(row as TablesInsert<'canonical_taxonomy_nodes'>).select(NODE_COLUMNS).single();
    if (error || !data) {
      const m = mapTaxonomyDbError(error);
      return fail(m.code, m.error);
    }
    const node = toNode(data);
    await this.audit(ctx, 'TAXONOMY_NODE_CREATE', node.id, null, { ...node });
    return { success: true, data: node };
  }

  static async renameNode(id: string, name: string, slug?: string): Promise<TaxonomyResult<TaxonomyNode>> {
    const ctx = await this.requireAdmin();
    if (!ctx) return fail('UNAUTHORIZED', 'Unauthorized.');
    const nameErr = validateNodeName(name);
    if (nameErr) return fail('VALIDATION', nameErr);
    const before = await this.getNode(ctx, id);
    if (!before) return fail('NOT_FOUND', 'Node not found.');
    const nextSlug = slug && slug.trim() ? slug.trim() : before.slug;
    const slugErr = validateNodeSlug(nextSlug);
    if (slugErr) return fail('VALIDATION', slugErr);

    const { data, error } = await ctx.supabase
      .from('canonical_taxonomy_nodes')
      .update({ name: name.trim(), slug: nextSlug })
      .eq('id', id)
      .select(NODE_COLUMNS)
      .single();
    if (error || !data) {
      const m = mapTaxonomyDbError(error);
      return fail(m.code, m.error);
    }
    const node = toNode(data);
    await this.audit(ctx, 'TAXONOMY_NODE_RENAME', id, { name: before.name, slug: before.slug }, { name: node.name, slug: node.slug });
    return { success: true, data: node };
  }

  /** Sets display_order = position for the given siblings (all must share parentId). */
  static async reorder(parentId: string | null, orderedIds: string[]): Promise<TaxonomyResult<{ updated: number }>> {
    const ctx = await this.requireAdmin();
    if (!ctx) return fail('UNAUTHORIZED', 'Unauthorized.');
    if (!Array.isArray(orderedIds) || orderedIds.length === 0 || new Set(orderedIds).size !== orderedIds.length) {
      return fail('VALIDATION', 'Provide each sibling id exactly once.');
    }
    let query = ctx.supabase.from('canonical_taxonomy_nodes').select('id, display_order');
    query = parentId ? query.eq('parent_id', parentId) : query.is('parent_id', null);
    const { data: siblings, error: sErr } = await query;
    if (sErr) return fail('DB_ERROR', 'Could not load siblings.');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const siblingIds = new Set((siblings || []).map((s: any) => s.id));
    if (siblingIds.size !== orderedIds.length || orderedIds.some((id) => !siblingIds.has(id))) {
      return fail('VALIDATION', 'The list must contain exactly the children of this parent.');
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const before = Object.fromEntries((siblings || []).map((s: any) => [s.id, s.display_order]));
    let updated = 0;
    for (let i = 0; i < orderedIds.length; i++) {
      if (before[orderedIds[i]] === i) continue;
      const { error } = await ctx.supabase.from('canonical_taxonomy_nodes').update({ display_order: i }).eq('id', orderedIds[i]);
      if (error) {
        const m = mapTaxonomyDbError(error);
        return fail(m.code, m.error);
      }
      updated++;
    }
    await this.audit(ctx, 'TAXONOMY_NODE_REORDER', parentId || 'ROOT', { order: before }, { order: orderedIds });
    return { success: true, data: { updated } };
  }

  static async setActive(id: string, isActive: boolean): Promise<TaxonomyResult<TaxonomyNode>> {
    const ctx = await this.requireAdmin();
    if (!ctx) return fail('UNAUTHORIZED', 'Unauthorized.');
    const before = await this.getNode(ctx, id);
    if (!before) return fail('NOT_FOUND', 'Node not found.');
    if (before.isActive === isActive) return { success: true, data: before };
    const { data, error } = await ctx.supabase
      .from('canonical_taxonomy_nodes')
      .update({ is_active: isActive })
      .eq('id', id)
      .select(NODE_COLUMNS)
      .single();
    if (error || !data) {
      const m = mapTaxonomyDbError(error);
      return fail(m.code, m.error);
    }
    const node = toNode(data);
    await this.audit(ctx, isActive ? 'TAXONOMY_NODE_REACTIVATE' : 'TAXONOMY_NODE_DEACTIVATE', id, { is_active: before.isActive }, { is_active: node.isActive });
    return { success: true, data: node };
  }

  private static validateDetails(nodeType: TaxonomyNodeType, d: TaxonomyNodeDetails): string | null {
    const hiErr = validateNameHi(d.nameHi);
    if (hiErr) return hiErr;
    if (d.subjectType !== null && (nodeType !== 'SUBJECT' || !SUBJECT_TYPES.includes(d.subjectType))) return 'A subject type is set on subjects only, from the list.';
    return validateStateCode(d.stateCode);
  }

  /** CA-1: Hindi name, subject type (subjects only) and state code (inside a STATE_SPECIFIC subject; the DB enforces it). */
  static async updateDetails(id: string, details: TaxonomyNodeDetails): Promise<TaxonomyResult<TaxonomyNode>> {
    const ctx = await this.requireAdmin();
    if (!ctx) return fail('UNAUTHORIZED', 'Unauthorized.');
    const before = await this.getNode(ctx, id);
    if (!before) return fail('NOT_FOUND', 'Node not found.');
    const next: TaxonomyNodeDetails = {
      nameHi: details.nameHi && details.nameHi.trim() ? details.nameHi.trim() : null,
      subjectType: before.nodeType === 'SUBJECT' ? details.subjectType || null : null,
      stateCode: details.stateCode ? details.stateCode.trim().toUpperCase() : null,
    };
    const err = this.validateDetails(before.nodeType, next);
    if (err) return fail('VALIDATION', err);
    const { data, error } = await ctx.supabase
      .from('canonical_taxonomy_nodes')
      .update({ name_hi: next.nameHi, subject_type: next.subjectType, state_code: next.stateCode })
      .eq('id', id)
      .select(NODE_COLUMNS)
      .single();
    if (error || !data) {
      const m = mapTaxonomyDbError(error);
      return fail(m.code, m.error);
    }
    const node = toNode(data);
    await this.audit(
      ctx,
      'TAXONOMY_NODE_DETAILS',
      id,
      { name_hi: before.nameHi, subject_type: before.subjectType, state_code: before.stateCode },
      { name_hi: node.nameHi, subject_type: node.subjectType, state_code: node.stateCode }
    );
    return { success: true, data: node };
  }

  /**
   * CA-7: mark a TOPIC / SUBTOPIC / CONCEPT internal (or not) — admin only, audited TAXONOMY_NODE_INTERNAL. An internal
   * node stays usable for question mapping; it (and its subtree) leaves the lesson generator, courses, the coverage
   * matrix, /learn, exam-topic pages, the sitemap and JSON-LD.
   */
  static async setInternal(id: string, internal: boolean): Promise<TaxonomyResult<TaxonomyNode>> {
    const ctx = await this.requireAdmin();
    if (!ctx) return fail('UNAUTHORIZED', 'Unauthorized.');
    const before = await this.getNode(ctx, id);
    if (!before) return fail('NOT_FOUND', 'Node not found.');
    if (before.nodeType === 'SUBJECT') return fail('VALIDATION', 'A subject cannot be internal; mark its catch-all topic instead.');
    if (before.isInternal === internal) return fail('VALIDATION', internal ? 'The node is already internal.' : 'The node is not internal.');
    const { data, error } = await ctx.supabase.from('canonical_taxonomy_nodes').update({ is_internal: internal }).eq('id', id).select(NODE_COLUMNS).single();
    if (error || !data) {
      const m = mapTaxonomyDbError(error);
      return fail(m.code, m.error);
    }
    const node = toNode(data);
    await this.audit(ctx, 'TAXONOMY_NODE_INTERNAL', id, { is_internal: before.isInternal }, { is_internal: node.isInternal });
    return { success: true, data: node };
  }

  /** MASTER-TREE UX: the node lesson state per node — PUBLISHED, DRAFT (any other live status) or absent (none / archived). */
  static async listNodeLessonStatus(): Promise<TaxonomyResult<Record<string, 'DRAFT' | 'PUBLISHED'>>> {
    const ctx = await this.requireAdmin({ allowStaff: true });
    if (!ctx) return fail('UNAUTHORIZED', 'Unauthorized.');
    const { data, error } = await ctx.supabase
      .from('learning_documents')
      .select('node_id, status')
      .eq('document_type', 'NODE_LESSON')
      .not('node_id', 'is', null);
    if (error) return fail('DB_ERROR', 'Could not load the lesson states.');
    const out: Record<string, 'DRAFT' | 'PUBLISHED'> = {};
    for (const r of data || []) {
      if (!r.node_id || r.status === 'ARCHIVED') continue;
      out[r.node_id] = r.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT';
    }
    return { success: true, data: out };
  }

  /** CA-1: every alias (EN / HI) of the master tree. */
  static async listAliases(): Promise<TaxonomyResult<TaxonomyAlias[]>> {
    const ctx = await this.requireAdmin({ allowStaff: true });
    if (!ctx) return fail('UNAUTHORIZED', 'Unauthorized.');
    const { data, error } = await ctx.supabase
      .from('taxonomy_node_aliases')
      .select('id, node_id, alias, normalized_alias, language, source')
      .order('alias', { ascending: true });
    if (error) return fail('DB_ERROR', 'Could not load the aliases.');
    return {
      success: true,
      data: (data || []).map((r) => ({
        id: r.id,
        nodeId: r.node_id,
        alias: r.alias,
        normalized: r.normalized_alias,
        language: r.language as AliasLanguage,
        source: r.source as TaxonomyAlias['source'],
      })),
    };
  }

  /** Adds an alias; the database checks the parent scope and writes the audit row in the same transaction. */
  static async addAlias(nodeId: string, alias: string, language: AliasLanguage): Promise<TaxonomyResult<{ id: string }>> {
    const ctx = await this.requireAdmin();
    if (!ctx) return fail('UNAUTHORIZED', 'Unauthorized.');
    const aliasErr = validateAlias(alias);
    if (aliasErr) return fail('VALIDATION', aliasErr);
    if (!ALIAS_LANGUAGES.includes(language)) return fail('VALIDATION', 'Alias language must be English or Hindi.');
    const { data, error } = await ctx.supabase.rpc('fn_taxonomy_add_alias', {
      p_node_id: nodeId,
      p_alias: alias.trim(),
      p_language: language,
      p_source: 'OWNER',
      p_actor_id: ctx.userId as string,
      p_actor_email: ctx.userEmail,
    });
    if (error || !data) {
      const m = mapTaxonomyDbError(error);
      return fail(m.code, m.error);
    }
    return { success: true, data: { id: data } };
  }

  static async removeAlias(aliasId: string): Promise<TaxonomyResult<{ id: string }>> {
    const ctx = await this.requireAdmin();
    if (!ctx) return fail('UNAUTHORIZED', 'Unauthorized.');
    const { error } = await ctx.supabase.rpc('fn_taxonomy_remove_alias', { p_alias_id: aliasId, p_actor_id: ctx.userId as string, p_actor_email: ctx.userEmail });
    if (error) {
      const m = mapTaxonomyDbError(error);
      return fail(m.code, m.error);
    }
    return { success: true, data: { id: aliasId } };
  }

  /** Same-level move (a topic to another subject, a subtopic to another topic, a concept to another subtopic). */
  static async moveNode(nodeId: string, newParentId: string, reason?: string): Promise<TaxonomyResult<{ path: string }>> {
    const ctx = await this.requireAdmin();
    if (!ctx) return fail('UNAUTHORIZED', 'Unauthorized.');
    if (!nodeId || !newParentId) return fail('VALIDATION', 'Choose the node and its new parent.');
    const { data, error } = await ctx.supabase.rpc('fn_taxonomy_move_node', {
      p_node_id: nodeId,
      p_new_parent_id: newParentId,
      p_actor_id: ctx.userId as string,
      p_actor_email: ctx.userEmail,
      p_reason: reason && reason.trim() ? reason.trim() : undefined,
    });
    if (error || !data) {
      const m = mapTaxonomyDbError(error);
      return fail(m.code, m.error);
    }
    const result = data as { path?: string };
    return { success: true, data: { path: String(result.path || '') } };
  }

  /**
   * Owner-only merge (admin + a reason + the typed confirmation word): every reference moves to the target, the source
   * names become aliases of the target, the source is deactivated, one audit row. Fail-closed in the database.
   */
  static async mergeNodes(
    sourceId: string,
    targetId: string,
    reason: string,
    confirmation: string
  ): Promise<TaxonomyResult<{ repointed: Record<string, number>; childrenMoved: number }>> {
    const ctx = await this.requireAdmin();
    if (!ctx) return fail('UNAUTHORIZED', 'Unauthorized.');
    if (confirmation !== MERGE_CONFIRM_WORD) return fail('VALIDATION', `Type ${MERGE_CONFIRM_WORD} to confirm the merge.`);
    if (!reason || reason.trim().length < MERGE_REASON_MIN) return fail('VALIDATION', `Give a reason (at least ${MERGE_REASON_MIN} characters).`);
    if (!sourceId || !targetId || sourceId === targetId) return fail('VALIDATION', 'Choose two different nodes.');
    const { data, error } = await ctx.supabase.rpc('fn_taxonomy_merge_nodes', {
      p_source_id: sourceId,
      p_target_id: targetId,
      p_actor_id: ctx.userId as string,
      p_actor_email: ctx.userEmail,
      p_reason: reason.trim(),
    });
    if (error || !data) {
      const m = mapTaxonomyDbError(error);
      return fail(m.code, m.error);
    }
    const result = data as { repointed?: Record<string, number>; children_moved?: number };
    return { success: true, data: { repointed: result.repointed || {}, childrenMoved: Number(result.children_moved || 0) } };
  }

  static deactivate(id: string) {
    return this.setActive(id, false);
  }

  static reactivate(id: string) {
    return this.setActive(id, true);
  }
}
