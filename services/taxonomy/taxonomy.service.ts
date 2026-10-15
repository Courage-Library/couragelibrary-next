/**
 * COURAGE LIBRARY — TAXONOMY SERVICE
 * Phase GAP2-1b: identity-unified taxonomy spine (T3)
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
  TAXONOMY_NODE_TYPES,
  TaxonomyNode,
  TaxonomyNodeType,
  TaxonomyResult,
  TaxonomyTreeNode,
  isAllowedParent,
  slugifyTaxonomyName,
  validateNodeName,
  validateNodeSlug,
} from '@/services/taxonomy/taxonomy.rules';

export * from '@/services/taxonomy/taxonomy.rules';

export interface CreateTaxonomyNodeInput {
  parentId: string | null;
  nodeType: TaxonomyNodeType;
  name: string;
  slug?: string;
  displayOrder?: number;
  description?: string;
}

interface AdminContext {
  userId: string | null;
  userEmail: string;
  supabase: AppSupabaseClient;
}

const NODE_COLUMNS = 'id, parent_id, root_subject_id, name, slug, node_type, node_depth, hierarchy_path, display_order, is_active';
const fail = <T>(code: string, error: string): TaxonomyResult<T> => ({ success: false, code, error });

/** Maps database errors (trigger rules, unique keys of nodes and projection rows) to admin messages. */
export function mapTaxonomyDbError(error: { code?: string; message?: string } | null | undefined): { code: string; error: string } {
  const msg = error?.message || '';
  if (msg.includes('TAXONOMY_RULE:')) return { code: 'TAXONOMY_RULE', error: msg.slice(msg.indexOf('TAXONOMY_RULE:') + 15).trim() };
  if (msg.includes('TAXONOMY_PROJECTION_ONLY')) return { code: 'TAXONOMY_PROJECTION_ONLY', error: 'Subjects, topics and subtopics can only change through the taxonomy.' };
  if (error?.code === '23505') {
    if (/uq_canonical_sibling_slug/.test(msg)) return { code: 'DUPLICATE_SLUG', error: 'A sibling node with this slug already exists.' };
    if (/subjects_name_key|uq_topics_subject_name|uq_subtopics_topic_name/.test(msg)) return { code: 'DUPLICATE_NAME', error: 'A subject/topic/subtopic with this name already exists here.' };
    if (/subjects_slug_key|topics_slug_key|subtopics_slug_key/.test(msg)) return { code: 'DUPLICATE_SLUG', error: 'This slug is already used by another subject/topic/subtopic. Choose a different slug.' };
    return { code: 'DUPLICATE', error: 'A node with these values already exists.' };
  }
  if (error?.code === '23503') return { code: 'IN_USE', error: 'This node is referenced by other data and cannot be removed.' };
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

  static deactivate(id: string) {
    return this.setActive(id, false);
  }

  static reactivate(id: string) {
    return this.setActive(id, true);
  }
}
