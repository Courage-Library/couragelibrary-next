/**
 * COURAGE LIBRARY — EXAM SYLLABUS RESOLUTION SERVICE
 * Phase 3R.4: Human Review & Taxonomy Resolution Workbench Foundation
 * 
 * Strict Architectural Invariants:
 * 1. Human Authority: Mutations occur strictly via human-approved resolution actions.
 * 2. Re-Check & Reuse: Always verifies DB before node creation; reuses existing canonical nodes on match.
 * 3. Safe Concurrency: Recovers from unique constraints and reuses concurrently created siblings.
 * 4. Subtree Transactionality: Atomic all-or-nothing rollback on any subtree node failure.
 * 5. Zero Deletion / Zero Merge: No deletions or automatic merges of canonical taxonomy.
 * 6. Full History Preservation: Preserves previous match status, method, and candidate evidence.
 */

import { createAdminServerSupabaseClient } from '@/lib/supabase/server';
import { ReconciliationNormalizer } from '@/services/reconciliation-normalizer';
import type {
  CanonicalNodeType,
  CanonicalTaxonomyNode,
  ExamSyllabusCanonicalMapping,
  ExamSyllabusNode,
  ResolutionAction,
  ResolutionResult,
  ResolutionSubtreeItem,
  ResolveMatchParams,
  SyllabusMatchStatus,
  TaxonomyAlias,
  TaxonomyWorkItem,
} from '@/types/dynamic-syllabus-reconciliation';

export class ExamSyllabusResolutionService {
  /**
   * Main entrypoint to resolve a syllabus mapping work item.
   */
  static async resolveWorkItem(
    params: ResolveMatchParams,
    clientOrSupabase?: any
  ): Promise<ResolutionResult> {
    const {
      syllabusNodeId,
      action,
      reviewerUserId,
    } = params;

    if (!syllabusNodeId) {
      throw new Error('syllabusNodeId is required for resolution.');
    }
    if (!reviewerUserId) {
      throw new Error('reviewerUserId is required for human resolution audit.');
    }

    const isDirectPg = clientOrSupabase && typeof clientOrSupabase.query === 'function';
    const supabase = !isDirectPg ? (clientOrSupabase || createAdminServerSupabaseClient()) : null;

    switch (action) {
      case 'ACCEPT_EXISTING_MATCH':
      case 'ACCEPT_PROPOSED_MATCH':
        return this.acceptMatch(params, isDirectPg ? clientOrSupabase : supabase, isDirectPg);

      case 'RESOLVE_AMBIGUOUS':
        return this.resolveAmbiguous(params, isDirectPg ? clientOrSupabase : supabase, isDirectPg);

      case 'CREATE_NEW_CANONICAL_NODE':
        return this.createCanonicalNode(params, isDirectPg ? clientOrSupabase : supabase, isDirectPg);

      case 'CREATE_NEW_SUBJECT':
        return this.createSubject(params, isDirectPg ? clientOrSupabase : supabase, isDirectPg);

      case 'CREATE_NEW_SUBTREE':
        return this.createSubtree(params, isDirectPg ? clientOrSupabase : supabase, isDirectPg);

      case 'ADD_ALIAS':
        return this.addTaxonomyAlias(params, isDirectPg ? clientOrSupabase : supabase, isDirectPg);

      case 'IGNORE_REQUIREMENT':
        return this.ignoreRequirement(params, isDirectPg ? clientOrSupabase : supabase, isDirectPg);

      case 'REJECT_PROPOSAL':
        return this.rejectProposal(params, isDirectPg ? clientOrSupabase : supabase, isDirectPg);

      case 'UNMAP_AND_REVIEW':
        return this.unmapAndReview(params, isDirectPg ? clientOrSupabase : supabase, isDirectPg);

      default:
        throw new Error(`Unsupported resolution action: ${action}`);
    }
  }

  // ---------------------------------------------------------------------------
  // 1. Accept Existing / Proposed Match
  // ---------------------------------------------------------------------------
  private static async acceptMatch(
    params: ResolveMatchParams,
    client: any,
    isPg: boolean
  ): Promise<ResolutionResult> {
    const { syllabusNodeId, canonicalNodeId, reviewerUserId, notes, action } = params;

    const current = await this.fetchMapping(syllabusNodeId, client, isPg);
    const targetCanonId = canonicalNodeId || current?.canonical_node_id;

    if (!targetCanonId) {
      throw new Error(`Cannot accept match for syllabus node ${syllabusNodeId}: No canonical node ID specified or mapped.`);
    }

    const canonNode = await this.fetchCanonicalNode(targetCanonId, client, isPg);
    if (!canonNode) {
      throw new Error(`Canonical node ${targetCanonId} not found in active inventory.`);
    }

    const historyRecord = this.buildHistoryRecord(current, action, notes);

    const mappingId = await this.upsertMapping(
      {
        syllabusNodeId,
        canonicalNodeId: targetCanonId,
        matchStatus: 'MANUALLY_MAPPED',
        matchConfidence: 1.00,
        matchMethod: 'MANUAL',
        matchNotes: notes || (action === 'ACCEPT_PROPOSED_MATCH' ? 'Approved proposed match' : 'Approved existing match'),
        reviewedBy: reviewerUserId,
        reviewedAt: new Date().toISOString(),
        candidateMatches: current?.candidate_matches || [],
        metadata: {
          ...(current?.reconciliation_metadata || {}),
          resolution_action: action,
          history: [...(current?.reconciliation_metadata?.history || []), historyRecord],
        },
      },
      client,
      isPg
    );

    return {
      success: true,
      action,
      syllabusNodeId,
      canonicalNodeId: targetCanonId,
      mappingId,
      reusedExistingNode: true,
      message: `Successfully approved canonical mapping to "${canonNode.name}" (${canonNode.hierarchy_path})`,
      historicalState: historyRecord,
    };
  }

  // ---------------------------------------------------------------------------
  // 2. Resolve Ambiguous Match
  // ---------------------------------------------------------------------------
  private static async resolveAmbiguous(
    params: ResolveMatchParams,
    client: any,
    isPg: boolean
  ): Promise<ResolutionResult> {
    const { syllabusNodeId, canonicalNodeId, reviewerUserId, notes } = params;

    if (!canonicalNodeId) {
      throw new Error(`canonicalNodeId must be explicitly selected to resolve AMBIGUOUS match for syllabus node ${syllabusNodeId}.`);
    }

    const canonNode = await this.fetchCanonicalNode(canonicalNodeId, client, isPg);
    if (!canonNode) {
      throw new Error(`Selected canonical node ${canonicalNodeId} does not exist in inventory.`);
    }

    const current = await this.fetchMapping(syllabusNodeId, client, isPg);
    const historyRecord = this.buildHistoryRecord(current, 'RESOLVE_AMBIGUOUS', notes);

    const mappingId = await this.upsertMapping(
      {
        syllabusNodeId,
        canonicalNodeId,
        matchStatus: 'MANUALLY_MAPPED',
        matchConfidence: 1.00,
        matchMethod: 'MANUAL',
        matchNotes: notes || `Resolved ambiguous candidates by explicitly selecting "${canonNode.name}"`,
        reviewedBy: reviewerUserId,
        reviewedAt: new Date().toISOString(),
        candidateMatches: current?.candidate_matches || [],
        metadata: {
          ...(current?.reconciliation_metadata || {}),
          resolution_action: 'RESOLVE_AMBIGUOUS',
          history: [...(current?.reconciliation_metadata?.history || []), historyRecord],
        },
      },
      client,
      isPg
    );

    return {
      success: true,
      action: 'RESOLVE_AMBIGUOUS',
      syllabusNodeId,
      canonicalNodeId,
      mappingId,
      reusedExistingNode: true,
      message: `Successfully resolved ambiguity by selecting "${canonNode.name}"`,
      historicalState: historyRecord,
    };
  }

  // ---------------------------------------------------------------------------
  // 3. Create New Canonical Node (Single Child Node under Parent)
  // ---------------------------------------------------------------------------
  private static async createCanonicalNode(
    params: ResolveMatchParams,
    client: any,
    isPg: boolean
  ): Promise<ResolutionResult> {
    const {
      syllabusNodeId,
      targetParentId,
      newNodeName,
      newNodeSlug,
      newNodeType,
      reviewerUserId,
      notes,
    } = params;

    const sylNode = await this.fetchSyllabusNode(syllabusNodeId, client, isPg);
    if (!sylNode) {
      throw new Error(`Syllabus node ${syllabusNodeId} not found.`);
    }

    // Determine Parent
    let parentId = targetParentId;
    if (!parentId && sylNode.parent_node_id) {
      const parentMapping = await this.fetchMapping(sylNode.parent_node_id, client, isPg);
      if (parentMapping?.canonical_node_id) {
        parentId = parentMapping.canonical_node_id;
      }
    }

    if (!parentId) {
      throw new Error(`Cannot create child canonical node: No valid parent canonical ID found or specified.`);
    }

    const parentNode = await this.fetchCanonicalNode(parentId, client, isPg);
    if (!parentNode) {
      throw new Error(`Parent canonical node ${parentId} not found.`);
    }

    const rawTitle = newNodeName || sylNode.raw_title;
    const normName = ReconciliationNormalizer.normalize(rawTitle);
    const slug = newNodeSlug || sylNode.raw_slug || ReconciliationNormalizer.slugify(rawTitle);
    const nodeType = newNodeType || this.inferNodeType(parentNode.node_depth + 1);

    // Re-check DB for existing node under parent
    const existingNode = await this.findExistingCanonicalNode(parentId, normName, slug, client, isPg);
    let canonicalId: string;
    let reused = false;

    if (existingNode) {
      canonicalId = existingNode.id;
      reused = true;
    } else {
      // Insert new canonical node
      const displayOrder = sylNode.display_order || 99;
      if (isPg) {
        const insRes = await client.query(
          `INSERT INTO public.canonical_taxonomy_nodes (
            parent_id, name, slug, node_type, display_order, is_active, metadata
          ) VALUES ($1, $2, $3, $4, $5, true, $6::jsonb)
          ON CONFLICT (COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), slug)
          DO UPDATE SET name = EXCLUDED.name
          RETURNING id`,
          [
            parentId,
            rawTitle,
            slug,
            nodeType,
            displayOrder,
            JSON.stringify({ created_by_resolution: true, reviewer: reviewerUserId, created_at: new Date().toISOString() }),
          ]
        );
        canonicalId = insRes.rows[0].id;
      } else {
        const { data: insData, error: insErr } = await client
          .from('canonical_taxonomy_nodes')
          .upsert(
            {
              parent_id: parentId,
              name: rawTitle,
              slug,
              node_type: nodeType,
              display_order: displayOrder,
              is_active: true,
              metadata: { created_by_resolution: true, reviewer: reviewerUserId, created_at: new Date().toISOString() },
            },
            { onConflict: 'parent_id,slug' }
          )
          .select('id')
          .single();

        if (insErr) throw new Error(`Failed to create canonical node: ${insErr.message}`);
        canonicalId = insData.id;
      }
    }

    const current = await this.fetchMapping(syllabusNodeId, client, isPg);
    const historyRecord = this.buildHistoryRecord(current, 'CREATE_NEW_CANONICAL_NODE', notes);

    const mappingId = await this.upsertMapping(
      {
        syllabusNodeId,
        canonicalNodeId: canonicalId,
        matchStatus: 'MANUALLY_MAPPED',
        matchConfidence: 1.00,
        matchMethod: 'MANUAL',
        matchNotes: notes || (reused ? `Reused existing canonical node "${rawTitle}"` : `Created new canonical node "${rawTitle}" under "${parentNode.name}"`),
        reviewedBy: reviewerUserId,
        reviewedAt: new Date().toISOString(),
        candidateMatches: current?.candidate_matches || [],
        metadata: {
          ...(current?.reconciliation_metadata || {}),
          resolution_action: 'CREATE_NEW_CANONICAL_NODE',
          history: [...(current?.reconciliation_metadata?.history || []), historyRecord],
        },
      },
      client,
      isPg
    );

    return {
      success: true,
      action: 'CREATE_NEW_CANONICAL_NODE',
      syllabusNodeId,
      canonicalNodeId: canonicalId,
      mappingId,
      createdCanonicalNodeIds: reused ? [] : [canonicalId],
      reusedExistingNode: reused,
      message: reused
        ? `Reused pre-existing canonical node "${rawTitle}" (${canonicalId})`
        : `Successfully created new canonical node "${rawTitle}" under "${parentNode.name}"`,
      historicalState: historyRecord,
    };
  }

  // ---------------------------------------------------------------------------
  // 4. Create New Subject (Root Node, Depth 1)
  // ---------------------------------------------------------------------------
  private static async createSubject(
    params: ResolveMatchParams,
    client: any,
    isPg: boolean
  ): Promise<ResolutionResult> {
    const { syllabusNodeId, newNodeName, newNodeSlug, reviewerUserId, notes } = params;

    const sylNode = await this.fetchSyllabusNode(syllabusNodeId, client, isPg);
    if (!sylNode) {
      throw new Error(`Syllabus node ${syllabusNodeId} not found.`);
    }

    const rawTitle = newNodeName || sylNode.raw_title;
    const normName = ReconciliationNormalizer.normalize(rawTitle);
    const slug = newNodeSlug || sylNode.raw_slug || ReconciliationNormalizer.slugify(rawTitle);

    // Re-check DB for existing root subject
    const existingSubject = await this.findExistingCanonicalNode(null, normName, slug, client, isPg);
    let subjectId: string;
    let reused = false;

    if (existingSubject) {
      subjectId = existingSubject.id;
      reused = true;
    } else {
      const displayOrder = sylNode.display_order || 99;
      if (isPg) {
        const insRes = await client.query(
          `INSERT INTO public.canonical_taxonomy_nodes (
            parent_id, name, slug, node_type, display_order, is_active, metadata
          ) VALUES (NULL, $1, $2, 'SUBJECT', $3, true, $4::jsonb)
          ON CONFLICT (COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), slug)
          DO UPDATE SET name = EXCLUDED.name
          RETURNING id`,
          [
            rawTitle,
            slug,
            displayOrder,
            JSON.stringify({ created_by_resolution: true, reviewer: reviewerUserId, created_at: new Date().toISOString() }),
          ]
        );
        subjectId = insRes.rows[0].id;
      } else {
        const { data: insData, error: insErr } = await client
          .from('canonical_taxonomy_nodes')
          .upsert(
            {
              parent_id: null,
              name: rawTitle,
              slug,
              node_type: 'SUBJECT',
              display_order: displayOrder,
              is_active: true,
              metadata: { created_by_resolution: true, reviewer: reviewerUserId, created_at: new Date().toISOString() },
            },
            { onConflict: 'slug' }
          )
          .select('id')
          .single();

        if (insErr) throw new Error(`Failed to create canonical subject: ${insErr.message}`);
        subjectId = insData.id;
      }
    }

    const current = await this.fetchMapping(syllabusNodeId, client, isPg);
    const historyRecord = this.buildHistoryRecord(current, 'CREATE_NEW_SUBJECT', notes);

    const mappingId = await this.upsertMapping(
      {
        syllabusNodeId,
        canonicalNodeId: subjectId,
        matchStatus: 'MANUALLY_MAPPED',
        matchConfidence: 1.00,
        matchMethod: 'MANUAL',
        matchNotes: notes || (reused ? `Reused existing canonical subject "${rawTitle}"` : `Created new canonical subject "${rawTitle}"`),
        reviewedBy: reviewerUserId,
        reviewedAt: new Date().toISOString(),
        candidateMatches: current?.candidate_matches || [],
        metadata: {
          ...(current?.reconciliation_metadata || {}),
          resolution_action: 'CREATE_NEW_SUBJECT',
          history: [...(current?.reconciliation_metadata?.history || []), historyRecord],
        },
      },
      client,
      isPg
    );

    return {
      success: true,
      action: 'CREATE_NEW_SUBJECT',
      syllabusNodeId,
      canonicalNodeId: subjectId,
      mappingId,
      createdCanonicalNodeIds: reused ? [] : [subjectId],
      reusedExistingNode: reused,
      message: reused
        ? `Reused pre-existing canonical subject "${rawTitle}" (${subjectId})`
        : `Successfully created new canonical subject "${rawTitle}"`,
      historicalState: historyRecord,
    };
  }

  // ---------------------------------------------------------------------------
  // 5. Create New Subtree (Atomic Rollback on Any Failure)
  // ---------------------------------------------------------------------------
  private static async createSubtree(
    params: ResolveMatchParams,
    client: any,
    isPg: boolean
  ): Promise<ResolutionResult> {
    const { syllabusNodeId, reviewerUserId, subtreeNodes = [], notes } = params;

    if (!isPg) {
      throw new Error('Atomic subtree creation requires transactional PostgreSQL client connection.');
    }

    const createdNodeIds: string[] = [];
    const syllabusToCanonicalMap = new Map<string, string>();

    try {
      await client.query('BEGIN');

      // 1. Create Root Subject
      const rootRes = await this.createSubject(params, client, true);
      syllabusToCanonicalMap.set(syllabusNodeId, rootRes.canonicalNodeId!);
      if (rootRes.createdCanonicalNodeIds && rootRes.createdCanonicalNodeIds.length > 0) {
        createdNodeIds.push(...rootRes.createdCanonicalNodeIds);
      }

      // 2. Create Descendant Nodes in Topological Order
      for (const childItem of subtreeNodes) {
        const parentSyllabusId = childItem.parentSyllabusNodeId || syllabusNodeId;
        const parentCanonicalId = syllabusToCanonicalMap.get(parentSyllabusId);

        if (!parentCanonicalId) {
          throw new Error(`Parent node mapping for syllabus ID ${parentSyllabusId} not found in subtree context.`);
        }

        const childRes = await this.createCanonicalNode(
          {
            syllabusNodeId: childItem.syllabusNodeId,
            action: 'CREATE_NEW_CANONICAL_NODE',
            targetParentId: parentCanonicalId,
            newNodeName: childItem.name,
            newNodeSlug: childItem.slug,
            newNodeType: childItem.nodeType,
            reviewerUserId,
            notes: notes || 'Subtree bulk creation',
          },
          client,
          true
        );

        syllabusToCanonicalMap.set(childItem.syllabusNodeId, childRes.canonicalNodeId!);
        if (childRes.createdCanonicalNodeIds && childRes.createdCanonicalNodeIds.length > 0) {
          createdNodeIds.push(...childRes.createdCanonicalNodeIds);
        }
      }

      await client.query('COMMIT');

      const rootMapping = await this.fetchMapping(syllabusNodeId, client, true);

      return {
        success: true,
        action: 'CREATE_NEW_SUBTREE',
        syllabusNodeId,
        canonicalNodeId: rootRes.canonicalNodeId,
        mappingId: rootMapping?.id || '',
        createdCanonicalNodeIds: createdNodeIds,
        reusedExistingNode: rootRes.reusedExistingNode,
        message: `Successfully created subtree with ${subtreeNodes.length + 1} total nodes in single atomic transaction.`,
      };
    } catch (err: any) {
      await client.query('ROLLBACK');
      throw new Error(`Subtree creation transaction rolled back: ${err.message}`);
    }
  }

  // ---------------------------------------------------------------------------
  // 6. Explicit Human-Approved Alias Creation
  // ---------------------------------------------------------------------------
  private static async addTaxonomyAlias(
    params: ResolveMatchParams,
    client: any,
    isPg: boolean
  ): Promise<ResolutionResult> {
    const { canonicalNodeId, aliasName, aliasContext = 'GENERAL', syllabusNodeId } = params;

    if (!canonicalNodeId || !aliasName) {
      throw new Error('canonicalNodeId and aliasName are required to create a taxonomy alias.');
    }

    const canonNode = await this.fetchCanonicalNode(canonicalNodeId, client, isPg);
    if (!canonNode) {
      throw new Error(`Canonical node ${canonicalNodeId} not found.`);
    }

    const normAlias = ReconciliationNormalizer.normalize(aliasName);
    let aliasId: string;
    let reused = false;

    if (isPg) {
      const insRes = await client.query(
        `INSERT INTO public.taxonomy_aliases (
          canonical_node_id, alias_name, normalized_alias, alias_context
        ) VALUES ($1, $2, $3, $4)
        ON CONFLICT (canonical_node_id, normalized_alias, alias_context)
        DO UPDATE SET alias_name = EXCLUDED.alias_name
        RETURNING id`,
        [canonicalNodeId, aliasName, normAlias, aliasContext]
      );
      aliasId = insRes.rows[0].id;
    } else {
      const { data: insData, error: insErr } = await client
        .from('taxonomy_aliases')
        .upsert(
          {
            canonical_node_id: canonicalNodeId,
            alias_name: aliasName,
            normalized_alias: normAlias,
            alias_context: aliasContext,
          },
          { onConflict: 'canonical_node_id,normalized_alias,alias_context' }
        )
        .select('id')
        .single();

      if (insErr) throw new Error(`Failed to create alias: ${insErr.message}`);
      aliasId = insData.id;
    }

    const current = syllabusNodeId ? await this.fetchMapping(syllabusNodeId, client, isPg) : null;

    return {
      success: true,
      action: 'ADD_ALIAS',
      syllabusNodeId: syllabusNodeId || '',
      canonicalNodeId,
      mappingId: current?.id || '',
      createdAliasIds: [aliasId],
      reusedExistingNode: false,
      message: `Successfully registered alias "${aliasName}" for canonical node "${canonNode.name}"`,
    };
  }

  // ---------------------------------------------------------------------------
  // 7. Ignore Requirement
  // ---------------------------------------------------------------------------
  private static async ignoreRequirement(
    params: ResolveMatchParams,
    client: any,
    isPg: boolean
  ): Promise<ResolutionResult> {
    const { syllabusNodeId, reviewerUserId, notes } = params;

    const current = await this.fetchMapping(syllabusNodeId, client, isPg);
    const historyRecord = this.buildHistoryRecord(current, 'IGNORE_REQUIREMENT', notes);

    const mappingId = await this.upsertMapping(
      {
        syllabusNodeId,
        canonicalNodeId: null,
        matchStatus: 'IGNORED',
        matchConfidence: 0.00,
        matchMethod: 'MANUAL',
        matchNotes: notes || 'Requirement explicitly ignored by reviewer',
        reviewedBy: reviewerUserId,
        reviewedAt: new Date().toISOString(),
        candidateMatches: current?.candidate_matches || [],
        metadata: {
          ...(current?.reconciliation_metadata || {}),
          resolution_action: 'IGNORE_REQUIREMENT',
          history: [...(current?.reconciliation_metadata?.history || []), historyRecord],
        },
      },
      client,
      isPg
    );

    return {
      success: true,
      action: 'IGNORE_REQUIREMENT',
      syllabusNodeId,
      canonicalNodeId: null,
      mappingId,
      reusedExistingNode: false,
      message: 'Syllabus requirement marked as IGNORED.',
      historicalState: historyRecord,
    };
  }

  // ---------------------------------------------------------------------------
  // 8. Reject Proposal
  // ---------------------------------------------------------------------------
  private static async rejectProposal(
    params: ResolveMatchParams,
    client: any,
    isPg: boolean
  ): Promise<ResolutionResult> {
    const { syllabusNodeId, reviewerUserId, notes } = params;

    const current = await this.fetchMapping(syllabusNodeId, client, isPg);
    const historyRecord = this.buildHistoryRecord(current, 'REJECT_PROPOSAL', notes);

    const mappingId = await this.upsertMapping(
      {
        syllabusNodeId,
        canonicalNodeId: null,
        matchStatus: 'REJECTED',
        matchConfidence: 0.00,
        matchMethod: 'MANUAL',
        matchNotes: notes || 'Proposed match rejected by reviewer',
        reviewedBy: reviewerUserId,
        reviewedAt: new Date().toISOString(),
        candidateMatches: current?.candidate_matches || [],
        metadata: {
          ...(current?.reconciliation_metadata || {}),
          resolution_action: 'REJECT_PROPOSAL',
          history: [...(current?.reconciliation_metadata?.history || []), historyRecord],
        },
      },
      client,
      isPg
    );

    return {
      success: true,
      action: 'REJECT_PROPOSAL',
      syllabusNodeId,
      canonicalNodeId: null,
      mappingId,
      reusedExistingNode: false,
      message: 'Proposed match rejected. Node remains staged for review/authoring.',
      historicalState: historyRecord,
    };
  }

  // ---------------------------------------------------------------------------
  // 9. Unmap and Review
  // ---------------------------------------------------------------------------
  private static async unmapAndReview(
    params: ResolveMatchParams,
    client: any,
    isPg: boolean
  ): Promise<ResolutionResult> {
    const { syllabusNodeId, notes } = params;

    const current = await this.fetchMapping(syllabusNodeId, client, isPg);
    const historyRecord = this.buildHistoryRecord(current, 'UNMAP_AND_REVIEW', notes);

    const mappingId = await this.upsertMapping(
      {
        syllabusNodeId,
        canonicalNodeId: null,
        matchStatus: 'NEW_NODE_GAP',
        matchConfidence: 0.00,
        matchMethod: 'UNMATCHED_GAP',
        matchNotes: notes || 'Reset mapping to unmapped state for re-review',
        reviewedBy: null,
        reviewedAt: null,
        candidateMatches: current?.candidate_matches || [],
        metadata: {
          ...(current?.reconciliation_metadata || {}),
          resolution_action: 'UNMAP_AND_REVIEW',
          history: [...(current?.reconciliation_metadata?.history || []), historyRecord],
        },
      },
      client,
      isPg
    );

    return {
      success: true,
      action: 'UNMAP_AND_REVIEW',
      syllabusNodeId,
      canonicalNodeId: null,
      mappingId,
      reusedExistingNode: false,
      message: 'Syllabus node mapping reset to unmapped state.',
      historicalState: historyRecord,
    };
  }

  // ---------------------------------------------------------------------------
  // 10. Taxonomy Work Item Queue Generator
  // ---------------------------------------------------------------------------
  static async getWorkItems(
    syllabusVersionId: string,
    clientOrSupabase?: any
  ): Promise<TaxonomyWorkItem[]> {
    const isPg = clientOrSupabase && typeof clientOrSupabase.query === 'function';
    const supabase = !isPg ? (clientOrSupabase || createAdminServerSupabaseClient()) : null;

    let syllabusNodes: ExamSyllabusNode[] = [];
    let mappings: ExamSyllabusCanonicalMapping[] = [];

    if (isPg) {
      const sRes = await clientOrSupabase.query(
        `SELECT * FROM public.exam_syllabus_nodes WHERE syllabus_version_id = $1 ORDER BY node_depth ASC, display_order ASC`,
        [syllabusVersionId]
      );
      syllabusNodes = sRes.rows;

      const mRes = await clientOrSupabase.query(
        `SELECT m.*, c.hierarchy_path as matched_canonical_path
         FROM public.exam_syllabus_canonical_mappings m
         LEFT JOIN public.canonical_taxonomy_nodes c ON c.id = m.canonical_node_id
         WHERE m.syllabus_node_id IN (SELECT id FROM public.exam_syllabus_nodes WHERE syllabus_version_id = $1)`,
        [syllabusVersionId]
      );
      mappings = mRes.rows;
    } else {
      const { data: sData } = await supabase
        .from('exam_syllabus_nodes')
        .select('*')
        .eq('syllabus_version_id', syllabusVersionId)
        .order('node_depth', { ascending: true })
        .order('display_order', { ascending: true });
      syllabusNodes = sData || [];

      const { data: mData } = await supabase
        .from('exam_syllabus_canonical_mappings')
        .select('*, canonical_node:canonical_taxonomy_nodes(hierarchy_path)')
        .in('syllabus_node_id', syllabusNodes.map((n) => n.id));
      mappings = mData || [];
    }

    const mappingMap = new Map<string, any>();
    mappings.forEach((m) => mappingMap.set(m.syllabus_node_id, m));

    return syllabusNodes.map((node) => {
      const mapObj = mappingMap.get(node.id);
      const status: SyllabusMatchStatus = mapObj?.match_status || 'NEW_NODE_GAP';

      let suggestedAction: ResolutionAction = 'ACCEPT_EXISTING_MATCH';
      let requiresReview = false;

      if (status === 'PROPOSED_MATCH') {
        suggestedAction = 'ACCEPT_PROPOSED_MATCH';
        requiresReview = true;
      } else if (status === 'AMBIGUOUS') {
        suggestedAction = 'RESOLVE_AMBIGUOUS';
        requiresReview = true;
      } else if (status === 'NEW_SUBJECT_GAP') {
        suggestedAction = 'CREATE_NEW_SUBJECT';
        requiresReview = true;
      } else if (status === 'NEW_NODE_GAP') {
        suggestedAction = 'CREATE_NEW_CANONICAL_NODE';
        requiresReview = true;
      } else if (status === 'REJECTED') {
        suggestedAction = 'CREATE_NEW_CANONICAL_NODE';
        requiresReview = true;
      }

      return {
        syllabusNodeId: node.id,
        syllabusVersionId: node.syllabus_version_id,
        rawTitle: node.raw_title,
        rawSlug: node.raw_slug,
        nodeDepth: node.node_depth,
        displayOrder: node.display_order,
        currentMapping: mapObj
          ? {
              id: mapObj.id,
              matchStatus: mapObj.match_status,
              matchConfidence: Number(mapObj.match_confidence),
              matchMethod: mapObj.match_method || 'UNMATCHED_GAP',
              matchedCanonicalNodeId: mapObj.canonical_node_id,
              matchedCanonicalPath: mapObj.matched_canonical_path || mapObj.canonical_node?.hierarchy_path || null,
              candidateMatches: mapObj.candidate_matches || [],
              matchNotes: mapObj.match_notes,
              reviewedBy: mapObj.reviewed_by,
              reviewedAt: mapObj.reviewed_at,
            }
          : null,
        suggestedAction,
        requiresReview,
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Internal Helpers & Invariant Protections
  // ---------------------------------------------------------------------------
  private static async fetchMapping(syllabusNodeId: string, client: any, isPg: boolean): Promise<any | null> {
    if (isPg) {
      const res = await client.query(`SELECT * FROM public.exam_syllabus_canonical_mappings WHERE syllabus_node_id = $1`, [syllabusNodeId]);
      return res.rows[0] || null;
    } else {
      const { data } = await client.from('exam_syllabus_canonical_mappings').select('*').eq('syllabus_node_id', syllabusNodeId).single();
      return data || null;
    }
  }

  private static async fetchSyllabusNode(id: string, client: any, isPg: boolean): Promise<ExamSyllabusNode | null> {
    if (isPg) {
      const res = await client.query(`SELECT * FROM public.exam_syllabus_nodes WHERE id = $1`, [id]);
      return res.rows[0] || null;
    } else {
      const { data } = await client.from('exam_syllabus_nodes').select('*').eq('id', id).single();
      return data || null;
    }
  }

  private static async fetchCanonicalNode(id: string, client: any, isPg: boolean): Promise<CanonicalTaxonomyNode | null> {
    if (isPg) {
      const res = await client.query(`SELECT * FROM public.canonical_taxonomy_nodes WHERE id = $1`, [id]);
      return res.rows[0] || null;
    } else {
      const { data } = await client.from('canonical_taxonomy_nodes').select('*').eq('id', id).single();
      return data || null;
    }
  }

  private static async findExistingCanonicalNode(
    parentId: string | null,
    normalizedName: string,
    slug: string,
    client: any,
    isPg: boolean
  ): Promise<CanonicalTaxonomyNode | null> {
    if (isPg) {
      const res = await client.query(
        `SELECT * FROM public.canonical_taxonomy_nodes 
         WHERE (parent_id IS NOT DISTINCT FROM $1) AND (slug = $2 OR name ILIKE $3)`,
        [parentId, slug, normalizedName]
      );
      return res.rows[0] || null;
    } else {
      let query = client.from('canonical_taxonomy_nodes').select('*');
      if (parentId) query = query.eq('parent_id', parentId);
      else query = query.is('parent_id', null);
      query = query.or(`slug.eq.${slug},name.ilike.${normalizedName}`);
      const { data } = await query.limit(1);
      return (data && data[0]) || null;
    }
  }

  private static async upsertMapping(
    payload: {
      syllabusNodeId: string;
      canonicalNodeId: string | null;
      matchStatus: SyllabusMatchStatus;
      matchConfidence: number;
      matchMethod: string;
      matchNotes: string;
      reviewedBy: string | null;
      reviewedAt: string | null;
      candidateMatches: any[];
      metadata: Record<string, any>;
    },
    client: any,
    isPg: boolean
  ): Promise<string> {
    if (isPg) {
      const res = await client.query(
        `INSERT INTO public.exam_syllabus_canonical_mappings (
          syllabus_node_id, canonical_node_id, match_status, match_confidence,
          match_method, match_notes, reviewed_by, reviewed_at,
          candidate_matches, reconciliation_metadata, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, now())
        ON CONFLICT (syllabus_node_id) DO UPDATE SET
          canonical_node_id = EXCLUDED.canonical_node_id,
          match_status = EXCLUDED.match_status,
          match_confidence = EXCLUDED.match_confidence,
          match_method = EXCLUDED.match_method,
          match_notes = EXCLUDED.match_notes,
          reviewed_by = EXCLUDED.reviewed_by,
          reviewed_at = EXCLUDED.reviewed_at,
          candidate_matches = EXCLUDED.candidate_matches,
          reconciliation_metadata = EXCLUDED.reconciliation_metadata,
          updated_at = now()
        RETURNING id`,
        [
          payload.syllabusNodeId,
          payload.canonicalNodeId,
          payload.matchStatus,
          payload.matchConfidence,
          payload.matchMethod,
          payload.matchNotes,
          payload.reviewedBy,
          payload.reviewedAt,
          JSON.stringify(payload.candidateMatches || []),
          JSON.stringify(payload.metadata || {}),
        ]
      );
      return res.rows[0].id;
    } else {
      const { data, error } = await client
        .from('exam_syllabus_canonical_mappings')
        .upsert(
          {
            syllabus_node_id: payload.syllabusNodeId,
            canonical_node_id: payload.canonicalNodeId,
            match_status: payload.matchStatus,
            match_confidence: payload.matchConfidence,
            match_method: payload.matchMethod,
            match_notes: payload.matchNotes,
            reviewed_by: payload.reviewedBy,
            reviewed_at: payload.reviewedAt,
            candidate_matches: payload.candidateMatches || [],
            reconciliation_metadata: payload.metadata || {},
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'syllabus_node_id' }
        )
        .select('id')
        .single();

      if (error) throw new Error(`Failed to upsert mapping: ${error.message}`);
      return data.id;
    }
  }

  private static buildHistoryRecord(
    current: any,
    action: ResolutionAction,
    notes?: string
  ): Record<string, any> {
    return {
      previous_status: current?.match_status || 'NEW_NODE_GAP',
      previous_canonical_node_id: current?.canonical_node_id || null,
      previous_confidence: current?.match_confidence || 0.00,
      previous_method: current?.match_method || 'UNMATCHED_GAP',
      resolution_action: action,
      resolution_notes: notes || '',
      timestamp: new Date().toISOString(),
    };
  }

  private static inferNodeType(depth: number): CanonicalNodeType {
    switch (depth) {
      case 1:
        return 'SUBJECT';
      case 2:
        return 'TOPIC';
      case 3:
        return 'SUBTOPIC';
      case 4:
        return 'CONCEPT';
      default:
        return 'METHOD';
    }
  }
}
