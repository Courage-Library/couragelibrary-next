/**
 * COURAGE LIBRARY — OPERATIONAL SYLLABUS RECONCILIATION SERVICE
 * Phase 3R.6: Operational API & Admin Workflow Foundation
 * 
 * Central orchestration service providing a secure, authorized, deterministic,
 * and auditable boundary between the Admin UI / API endpoints and the authoritative
 * Step 3-5 reconciliation and resolution engines.
 * 
 * STRICT INVARIANTS:
 * 1. Read-Model Authority: Reuses Step 5.1 ExamSyllabusReadinessService & TaxonomyWorkQueueService.
 * 2. Mutation Boundary: All mutations delegate strictly to Step 4 ExamSyllabusResolutionService.
 * 3. Server-Derived Identity: Reviewer UUID is always derived from the server session (never client payload).
 * 4. Authoritative State Recheck: Validates current DB state and expected state prior to execution.
 * 5. Concurrency & Idempotency: Protects against double-submission and stale browser tabs.
 * 6. Bounded Pagination: Deterministic sort orders with capped result sizes.
 */

import { createAdminServerSupabaseClient } from '@/lib/supabase/server';
import { ExamSyllabusReadinessService, TaxonomyWorkQueueService } from '@/services/exam-syllabus-readiness.service';
import { ExamSyllabusResolutionService } from '@/services/exam-syllabus-resolution.service';
import type {
  ApiErrorCode,
  CanonicalNodeType,
  CanonicalTaxonomyNode,
  ExamSyllabusCanonicalMapping,
  ExamSyllabusNode,
  ResolutionAction,
  ResolutionResult,
  ResolutionSubtreeItem,
  ResolveMatchParams,
  ResolveWorkItemApiPayload,
  ResolveWorkItemApiResponse,
  SubjectReadinessSummary,
  SyllabusReadinessReport,
  SyllabusReadinessState,
  SyllabusReadinessSummary,
  SyllabusVersionListItem,
  SyllabusVersionListResponse,
  SyllabusVersionStatus,
  TaxonomyWorkQueueItem,
  WorkItemDetailResponse,
  WorkQueueAction,
  WorkQueueListResponse,
  WorkQueuePriority,
} from '@/types/dynamic-syllabus-reconciliation';

export class OperationalSyllabusReconciliationError extends Error {
  code: ApiErrorCode;
  statusCode: number;
  details?: Record<string, any> | null;

  constructor(code: ApiErrorCode, message: string, statusCode = 400, details: Record<string, any> | null = null) {
    super(message);
    this.name = 'OperationalSyllabusReconciliationError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export interface ListSyllabusVersionsParams {
  examId?: string;
  examCycleId?: string;
  status?: SyllabusVersionStatus;
  page?: number;
  limit?: number;
  supabaseClient?: any;
}

export interface GetWorkQueueParams {
  syllabusVersionId?: string;
  priority?: WorkQueuePriority;
  readinessState?: SyllabusReadinessState;
  isMandatory?: boolean;
  subjectId?: string;
  search?: string;
  page?: number;
  limit?: number;
  supabaseClient?: any;
}

export interface GetWorkItemDetailParams {
  syllabusVersionId: string;
  syllabusNodeId: string;
  supabaseClient?: any;
}

export interface ExecuteResolutionParams {
  payload: ResolveWorkItemApiPayload;
  reviewerUserId: string;
  supabaseClient?: any;
}

export class OperationalSyllabusReconciliationService {
  /**
   * 1. List Syllabus Versions with Bounded Pagination & Readiness Previews
   */
  static async listSyllabusVersions(
    params: ListSyllabusVersionsParams = {}
  ): Promise<SyllabusVersionListResponse> {
    const {
      examId,
      examCycleId,
      status,
      page = 1,
      limit = 20,
      supabaseClient,
    } = params;

    const boundedPage = Math.max(1, Number(page) || 1);
    const boundedLimit = Math.min(100, Math.max(1, Number(limit) || 20));
    const offset = (boundedPage - 1) * boundedLimit;

    const supabase = supabaseClient || (await createAdminServerSupabaseClient());

    let query = supabase
      .from('exam_syllabus_versions')
      .select(`
        id,
        exam_id,
        exam_cycle_id,
        version_tag,
        raw_payload_hash,
        status,
        is_active,
        created_at,
        updated_at,
        exam:exams(id, title, slug),
        exam_cycle:exam_cycles(id, cycle_year)
      `, { count: 'exact' });

    if (examId) {
      query = query.eq('exam_id', examId);
    }
    if (examCycleId) {
      query = query.eq('exam_cycle_id', examCycleId);
    }
    if (status) {
      query = query.eq('status', status);
    }

    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + boundedLimit - 1);

    const { data: versionsData, count, error } = await query;

    if (error) {
      throw new OperationalSyllabusReconciliationError(
        'INTERNAL_ERROR',
        `Failed to query syllabus versions: ${error.message}`,
        500
      );
    }

    const totalCount = count || 0;
    const totalPages = Math.ceil(totalCount / boundedLimit);

    // Compute readiness reports for each returned version in parallel
    const versionItems: SyllabusVersionListItem[] = await Promise.all(
      (versionsData || []).map(async (v: any) => {
        const report = await ExamSyllabusReadinessService.getSyllabusReadiness({
          syllabusVersionId: v.id,
          supabaseClient: supabase,
        });

        return {
          id: v.id,
          examId: v.exam_id,
          examName: v.exam?.title || 'Unknown Exam',
          examSlug: v.exam?.slug || '',
          examCycleId: v.exam_cycle_id,
          cycleYear: v.exam_cycle?.cycle_year || null,
          versionTag: v.version_tag,
          status: v.status,
          isActive: v.is_active,
          rawPayloadHash: v.raw_payload_hash,
          totalNodes: report.summary.totalSyllabusNodes,
          readinessSummary: report.summary,
          reconciliationHealth: report.health,
          createdAt: v.created_at,
          updatedAt: v.updated_at,
        };
      })
    );

    return {
      versions: versionItems,
      totalCount,
      page: boundedPage,
      limit: boundedLimit,
      totalPages,
    };
  }

  /**
   * 2. Get Comprehensive Syllabus Version Detail & Full Readiness Report
   */
  static async getSyllabusVersionDetail(
    syllabusVersionId: string,
    supabaseClient?: any
  ): Promise<SyllabusReadinessReport> {
    if (!syllabusVersionId) {
      throw new OperationalSyllabusReconciliationError(
        'INVALID_INPUT',
        'syllabusVersionId is required',
        400
      );
    }

    const supabase = supabaseClient || (await createAdminServerSupabaseClient());

    try {
      return await ExamSyllabusReadinessService.getSyllabusReadiness({
        syllabusVersionId,
        supabaseClient: supabase,
      });
    } catch (err: any) {
      if (err.message?.includes('not found')) {
        throw new OperationalSyllabusReconciliationError(
          'NOT_FOUND',
          `Syllabus version not found: ${syllabusVersionId}`,
          404
        );
      }
      throw new OperationalSyllabusReconciliationError(
        'INTERNAL_ERROR',
        `Error generating readiness detail: ${err.message}`,
        500
      );
    }
  }

  /**
   * 3. Get Filtered, Deterministically Sorted & Bounded Work Queue
   */
  static async getWorkQueue(
    params: GetWorkQueueParams = {}
  ): Promise<WorkQueueListResponse> {
    const {
      syllabusVersionId,
      priority,
      readinessState,
      isMandatory,
      subjectId,
      search,
      page = 1,
      limit = 20,
      supabaseClient,
    } = params;

    const boundedPage = Math.max(1, Number(page) || 1);
    const boundedLimit = Math.min(100, Math.max(1, Number(limit) || 20));

    const supabase = supabaseClient || (await createAdminServerSupabaseClient());

    // Fetch derived work queue items via TaxonomyWorkQueueService
    let allItems = await TaxonomyWorkQueueService.getWorkQueue({
      syllabusVersionId,
      supabaseClient: supabase,
    });

    // Apply server-side filters on derived read model
    if (priority) {
      allItems = allItems.filter((item) => item.priority === priority);
    }
    if (readinessState) {
      allItems = allItems.filter((item) => item.currentStatus === readinessState);
    }
    if (typeof isMandatory === 'boolean') {
      allItems = allItems.filter((item) => item.isMandatory === isMandatory);
    }
    if (subjectId) {
      // Filter items whose path or root matches
      allItems = allItems.filter(
        (item) => item.syllabusNodeId === subjectId || item.syllabusPath.includes(subjectId)
      );
    }
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      allItems = allItems.filter(
        (item) =>
          item.syllabusTitle.toLowerCase().includes(q) ||
          item.syllabusSlug.toLowerCase().includes(q) ||
          item.syllabusPath.toLowerCase().includes(q)
      );
    }

    // Deterministic Sort Invariant:
    // 1. Priority: BLOCKING (4) > HIGH (3) > MEDIUM (2) > LOW (1)
    // 2. Syllabus Depth ascending
    // 3. Syllabus Path ascending
    // 4. Syllabus Title ascending
    // 5. Syllabus Node ID stable tie-breaker
    const priorityWeights: Record<WorkQueuePriority, number> = {
      BLOCKING: 4,
      HIGH: 3,
      MEDIUM: 2,
      LOW: 1,
    };

    allItems.sort((a, b) => {
      const pDiff = priorityWeights[b.priority] - priorityWeights[a.priority];
      if (pDiff !== 0) return pDiff;
      if (a.syllabusDepth !== b.syllabusDepth) return a.syllabusDepth - b.syllabusDepth;
      const pathDiff = a.syllabusPath.localeCompare(b.syllabusPath);
      if (pathDiff !== 0) return pathDiff;
      const titleDiff = a.syllabusTitle.localeCompare(b.syllabusTitle);
      if (titleDiff !== 0) return titleDiff;
      return a.syllabusNodeId.localeCompare(b.syllabusNodeId);
    });

    const totalCount = allItems.length;
    const totalPages = Math.ceil(totalCount / boundedLimit);
    const offset = (boundedPage - 1) * boundedLimit;
    const pagedItems = allItems.slice(offset, offset + boundedLimit);

    return {
      items: pagedItems,
      totalCount,
      page: boundedPage,
      limit: boundedLimit,
      totalPages,
      filters: {
        syllabusVersionId,
        priority,
        readinessState,
        isMandatory,
        subjectId,
        search,
      },
    };
  }

  /**
   * 4. Get Work Item Detail for Admin Workbench Review
   */
  static async getWorkItemDetail(
    params: GetWorkItemDetailParams
  ): Promise<WorkItemDetailResponse> {
    const { syllabusVersionId, syllabusNodeId, supabaseClient } = params;

    if (!syllabusVersionId || !syllabusNodeId) {
      throw new OperationalSyllabusReconciliationError(
        'INVALID_INPUT',
        'syllabusVersionId and syllabusNodeId are required',
        400
      );
    }

    const supabase = supabaseClient || (await createAdminServerSupabaseClient());

    // 1. Load syllabus node
    const { data: sNode, error: sErr } = await supabase
      .from('exam_syllabus_nodes')
      .select('*')
      .eq('id', syllabusNodeId)
      .eq('syllabus_version_id', syllabusVersionId)
      .single();

    if (sErr || !sNode) {
      throw new OperationalSyllabusReconciliationError(
        'NOT_FOUND',
        `Syllabus node not found in version ${syllabusVersionId}: ${syllabusNodeId}`,
        404
      );
    }

    // 2. Load existing mapping if present
    const { data: mapping } = await supabase
      .from('exam_syllabus_canonical_mappings')
      .select('*')
      .eq('syllabus_node_id', syllabusNodeId)
      .maybeSingle();

    // 3. Load canonical target if mapped
    let canonicalTarget: CanonicalTaxonomyNode | null = null;
    if (mapping?.canonical_node_id) {
      const { data: cNode } = await supabase
        .from('canonical_taxonomy_nodes')
        .select('*')
        .eq('id', mapping.canonical_node_id)
        .maybeSingle();
      canonicalTarget = cNode || null;
    }

    // 4. Derive readiness state & available resolution actions
    let readinessState: SyllabusReadinessState = 'UNREVIEWED';
    let availableActions: ResolutionAction[] = [];
    let requiredAction: WorkQueueAction = 'NO_ACTION';

    if (mapping) {
      switch (mapping.match_status) {
        case 'EXACT_MATCH':
        case 'ALIAS_MATCH':
          readinessState = 'MATCHED';
          availableActions = ['ACCEPT_EXISTING_MATCH', 'UNMAP_AND_REVIEW', 'IGNORE_REQUIREMENT'];
          break;
        case 'MANUALLY_MAPPED':
          readinessState = 'MANUALLY_MAPPED';
          availableActions = ['UNMAP_AND_REVIEW', 'IGNORE_REQUIREMENT', 'ADD_ALIAS'];
          break;
        case 'PROPOSED_MATCH':
          readinessState = 'PROPOSED_REVIEW';
          requiredAction = 'REVIEW_PROPOSED_MATCH';
          availableActions = [
            'ACCEPT_PROPOSED_MATCH',
            'REJECT_PROPOSAL',
            'CREATE_NEW_CANONICAL_NODE',
            'ADD_ALIAS',
            'IGNORE_REQUIREMENT',
          ];
          break;
        case 'AMBIGUOUS':
          readinessState = 'AMBIGUOUS_REVIEW';
          requiredAction = 'RESOLVE_AMBIGUITY';
          availableActions = [
            'RESOLVE_AMBIGUOUS',
            'CREATE_NEW_CANONICAL_NODE',
            'REJECT_PROPOSAL',
            'IGNORE_REQUIREMENT',
          ];
          break;
        case 'NEW_SUBJECT_GAP':
          readinessState = 'NEW_SUBJECT_GAP';
          requiredAction = 'CREATE_CANONICAL_SUBJECT';
          availableActions = [
            'CREATE_NEW_SUBJECT',
            'CREATE_NEW_SUBTREE',
            'RESOLVE_AMBIGUOUS',
            'IGNORE_REQUIREMENT',
          ];
          break;
        case 'NEW_NODE_GAP':
          readinessState = 'NEW_NODE_GAP';
          requiredAction = 'CREATE_CANONICAL_NODE';
          availableActions = [
            'CREATE_NEW_CANONICAL_NODE',
            'CREATE_NEW_SUBTREE',
            'RESOLVE_AMBIGUOUS',
            'IGNORE_REQUIREMENT',
          ];
          break;
        case 'IGNORED':
          readinessState = 'IGNORED';
          availableActions = ['UNMAP_AND_REVIEW'];
          break;
        case 'REJECTED':
          readinessState = 'REJECTED';
          requiredAction = 'REVIEW_REJECTED_PROPOSAL';
          availableActions = [
            'CREATE_NEW_CANONICAL_NODE',
            'CREATE_NEW_SUBJECT',
            'RESOLVE_AMBIGUOUS',
            'IGNORE_REQUIREMENT',
          ];
          break;
        default:
          readinessState = 'UNREVIEWED';
          availableActions = [
            sNode.node_depth === 1 ? 'CREATE_NEW_SUBJECT' : 'CREATE_NEW_CANONICAL_NODE',
            'RESOLVE_AMBIGUOUS',
            'IGNORE_REQUIREMENT',
          ];
      }
    } else {
      readinessState = 'UNREVIEWED';
      availableActions = [
        sNode.node_depth === 1 ? 'CREATE_NEW_SUBJECT' : 'CREATE_NEW_CANONICAL_NODE',
        'RESOLVE_AMBIGUOUS',
        'IGNORE_REQUIREMENT',
      ];
    }

    // Priority derivation
    const isMandatory = sNode.is_mandatory !== false;
    let priority: WorkQueuePriority = 'LOW';
    if (isMandatory) {
      if (
        readinessState === 'NEW_SUBJECT_GAP' ||
        readinessState === 'NEW_NODE_GAP' ||
        readinessState === 'AMBIGUOUS_REVIEW'
      ) {
        priority = 'BLOCKING';
      } else if (readinessState === 'PROPOSED_REVIEW' || readinessState === 'REJECTED') {
        priority = 'HIGH';
      } else {
        priority = 'LOW';
      }
    } else {
      if (readinessState === 'NEW_SUBJECT_GAP' || readinessState === 'AMBIGUOUS_REVIEW') {
        priority = 'HIGH';
      } else if (readinessState === 'NEW_NODE_GAP' || readinessState === 'PROPOSED_REVIEW') {
        priority = 'MEDIUM';
      } else {
        priority = 'LOW';
      }
    }
    const isBlocking = priority === 'BLOCKING';

    // 5. Extract resolution audit history from mapping metadata
    const rawHistory: Array<any> = [];
    if (mapping?.reconciliation_metadata?.history && Array.isArray(mapping.reconciliation_metadata.history)) {
      rawHistory.push(...mapping.reconciliation_metadata.history);
    } else if (mapping?.reconciliation_metadata?.resolutionHistory && Array.isArray(mapping.reconciliation_metadata.resolutionHistory)) {
      rawHistory.push(...mapping.reconciliation_metadata.resolutionHistory);
    } else if (mapping?.reviewed_at) {
      rawHistory.push({
        action: mapping.match_method || 'MANUAL',
        previousStatus: 'UNREVIEWED',
        newStatus: mapping.match_status,
        reviewedBy: mapping.reviewed_by,
        reviewedAt: mapping.reviewed_at,
        notes: mapping.match_notes,
      });
    }

    const historyList = rawHistory.map((h) => ({
      action: h.resolution_action || h.action || 'RESOLUTION_MUTATION',
      previousStatus: h.previous_status || h.previousStatus || 'UNKNOWN',
      newStatus: h.new_status || h.newStatus || mapping?.match_status || 'UNKNOWN',
      reviewedBy: h.reviewed_by || h.reviewedBy || mapping?.reviewed_by || null,
      reviewedAt: h.timestamp || h.reviewed_at || h.reviewedAt || new Date().toISOString(),
      notes: h.resolution_notes || h.notes || null,
    }));

    return {
      syllabusNode: {
        id: sNode.id,
        syllabusVersionId: sNode.syllabus_version_id,
        parentNodeId: sNode.parent_node_id,
        rawTitle: sNode.raw_title,
        rawSlug: sNode.raw_slug,
        nodeDepth: sNode.node_depth,
        displayOrder: sNode.display_order,
        isMandatory: sNode.is_mandatory !== false,
        weightageTier: sNode.weightage_tier,
        cognitiveDepth: sNode.required_cognitive_depth,
      },
      path: sNode.raw_title,
      readinessState,
      priority,
      isBlocking,
      requiredAction,
      availableActions,
      currentMapping: mapping || null,
      canonicalTarget,
      candidateMatches: mapping?.candidate_matches || [],
      resolutionHistory: historyList,
    };
  }

  /**
   * 5. Execute Authorized Human Resolution Action with State Re-check & Audit
   */
  static async resolveWorkItem(
    params: ExecuteResolutionParams
  ): Promise<ResolveWorkItemApiResponse> {
    const { payload, reviewerUserId, supabaseClient } = params;
    const {
      syllabusVersionId,
      syllabusNodeId,
      action,
      expectedState,
      canonicalNodeId,
      targetParentId,
      newNodeName,
      newNodeSlug,
      newNodeType,
      aliasName,
      aliasContext,
      notes,
      subtreeNodes,
    } = payload;

    if (!syllabusVersionId || !syllabusNodeId || !action) {
      throw new OperationalSyllabusReconciliationError(
        'INVALID_INPUT',
        'syllabusVersionId, syllabusNodeId, and action are required fields',
        400
      );
    }
    if (!reviewerUserId) {
      throw new OperationalSyllabusReconciliationError(
        'UNAUTHENTICATED',
        'Authenticated reviewer identity is required',
        401
      );
    }

    const supabase = supabaseClient || (await createAdminServerSupabaseClient());

    // 1. Authoritative State Recheck: Verify syllabus node exists in specified version
    const { data: sNode, error: nodeErr } = await supabase
      .from('exam_syllabus_nodes')
      .select('*')
      .eq('id', syllabusNodeId)
      .eq('syllabus_version_id', syllabusVersionId)
      .single();

    if (nodeErr || !sNode) {
      throw new OperationalSyllabusReconciliationError(
        'NOT_FOUND',
        `Syllabus node ${syllabusNodeId} not found in version ${syllabusVersionId}`,
        404
      );
    }

    // 2. Load current mapping to determine actual server-side readiness state
    const { data: currentMapping } = await supabase
      .from('exam_syllabus_canonical_mappings')
      .select('*')
      .eq('syllabus_node_id', syllabusNodeId)
      .maybeSingle();

    let actualState: SyllabusReadinessState = 'UNREVIEWED';
    if (currentMapping) {
      switch (currentMapping.match_status) {
        case 'EXACT_MATCH':
        case 'ALIAS_MATCH':
          actualState = 'MATCHED';
          break;
        case 'MANUALLY_MAPPED':
          actualState = 'MANUALLY_MAPPED';
          break;
        case 'PROPOSED_MATCH':
          actualState = 'PROPOSED_REVIEW';
          break;
        case 'AMBIGUOUS':
          actualState = 'AMBIGUOUS_REVIEW';
          break;
        case 'NEW_SUBJECT_GAP':
          actualState = 'NEW_SUBJECT_GAP';
          break;
        case 'NEW_NODE_GAP':
          actualState = 'NEW_NODE_GAP';
          break;
        case 'IGNORED':
          actualState = 'IGNORED';
          break;
        case 'REJECTED':
          actualState = 'REJECTED';
          break;
        default:
          actualState = 'UNREVIEWED';
      }
    }

    // 3. Concurrency Protection: If expectedState was supplied, verify it matches
    if (expectedState && expectedState !== actualState) {
      throw new OperationalSyllabusReconciliationError(
        'RESOLUTION_CONFLICT',
        `State conflict: node is currently '${actualState}', but client expected '${expectedState}'. Refresh your view.`,
        409,
        { actualState, expectedState }
      );
    }

    // Normalize action names (e.g. legacy/alternate aliases to canonical Step 4 actions)
    let normalizedAction = action as ResolutionAction;
    if ((action as string) === 'CREATE_NEW_CANONICAL_SUBJECT') {
      normalizedAction = 'CREATE_NEW_SUBJECT';
    } else if ((action as string) === 'ADD_TAXONOMY_ALIAS') {
      normalizedAction = 'ADD_ALIAS';
    }

    // 4. Action Applicability Validation
    switch (normalizedAction) {
      case 'ACCEPT_EXISTING_MATCH':
        if (!canonicalNodeId && !currentMapping?.canonical_node_id) {
          throw new OperationalSyllabusReconciliationError(
            'INVALID_INPUT',
            'ACCEPT_EXISTING_MATCH requires a target canonical node ID',
            400
          );
        }
        break;
      case 'ACCEPT_PROPOSED_MATCH':
        if (actualState !== 'PROPOSED_REVIEW') {
          throw new OperationalSyllabusReconciliationError(
            'INVALID_STATE',
            `Cannot ACCEPT_PROPOSED_MATCH on node with state '${actualState}'. Must be 'PROPOSED_REVIEW'.`,
            400
          );
        }
        break;
      case 'RESOLVE_AMBIGUOUS':
        if (!canonicalNodeId && !newNodeName) {
          throw new OperationalSyllabusReconciliationError(
            'INVALID_INPUT',
            'RESOLVE_AMBIGUOUS requires either canonicalNodeId or newNodeName',
            400
          );
        }
        break;
      case 'CREATE_NEW_CANONICAL_NODE':
        if (!newNodeName && !sNode.raw_title) {
          throw new OperationalSyllabusReconciliationError(
            'INVALID_INPUT',
            'Node name is required for creating a canonical node',
            400
          );
        }
        break;
      case 'CREATE_NEW_SUBJECT':
        if (sNode.node_depth !== 1) {
          throw new OperationalSyllabusReconciliationError(
            'INVALID_INPUT',
            'CREATE_NEW_SUBJECT can only be performed on root syllabus nodes (depth 1)',
            400
          );
        }
        break;
      case 'CREATE_NEW_SUBTREE':
        if (!Array.isArray(subtreeNodes)) {
          throw new OperationalSyllabusReconciliationError(
            'INVALID_INPUT',
            'CREATE_NEW_SUBTREE requires a subtreeNodes array',
            400
          );
        }
        break;
      case 'ADD_ALIAS':
        if (!canonicalNodeId || !aliasName) {
          throw new OperationalSyllabusReconciliationError(
            'INVALID_INPUT',
            'ADD_ALIAS requires canonicalNodeId and aliasName',
            400
          );
        }
        break;
      case 'IGNORE_REQUIREMENT':
      case 'REJECT_PROPOSAL':
      case 'UNMAP_AND_REVIEW':
        break;
      default:
        throw new OperationalSyllabusReconciliationError(
          'INVALID_INPUT',
          `Unsupported resolution action: ${action}`,
          400
        );
    }

    // 5. Delegate mutation to authoritative Step 4 ExamSyllabusResolutionService
    const resolveParams: ResolveMatchParams = {
      syllabusNodeId,
      action: normalizedAction,
      canonicalNodeId: canonicalNodeId || currentMapping?.canonical_node_id,
      targetParentId,
      newNodeName: newNodeName || sNode.raw_title,
      newNodeSlug: newNodeSlug || sNode.raw_slug,
      newNodeType: newNodeType || (sNode.node_depth === 1 ? 'SUBJECT' : 'TOPIC'),
      aliasName,
      aliasContext,
      notes,
      reviewerUserId,
      subtreeNodes,
    };

    let resolutionRes: ResolutionResult;
    try {
      resolutionRes = await ExamSyllabusResolutionService.resolveWorkItem(
        resolveParams,
        supabase
      );
    } catch (mutationErr: any) {
      throw new OperationalSyllabusReconciliationError(
        'INTERNAL_ERROR',
        `Resolution mutation failed: ${mutationErr.message}`,
        500
      );
    }

    if (!resolutionRes.success) {
      throw new OperationalSyllabusReconciliationError(
        'VALIDATION_FAILED',
        resolutionRes.message || 'Resolution failed validation',
        422
      );
    }

    // 6. Compute Fresh Post-Mutation Readiness & Work Queue Snapshot
    const freshReport = await ExamSyllabusReadinessService.getSyllabusReadiness({
      syllabusVersionId,
      supabaseClient: supabase,
    });

    // Find affected subject summary
    let affectedSubjectSummary: SubjectReadinessSummary | null = null;
    const treeNode = freshReport.tree.find((t) => t.syllabusNodeId === sNode.id);
    if (treeNode) {
      affectedSubjectSummary = freshReport.subjects.find((s) => s.subjectId === treeNode.syllabusNodeId) || null;
    }
    if (!affectedSubjectSummary && freshReport.subjects.length > 0) {
      affectedSubjectSummary = freshReport.subjects[0];
    }

    // Derive new state for response
    let resultingState: SyllabusReadinessState = 'UNREVIEWED';
    if (normalizedAction === 'IGNORE_REQUIREMENT') resultingState = 'IGNORED';
    else if (normalizedAction === 'REJECT_PROPOSAL') resultingState = 'REJECTED';
    else if (normalizedAction === 'UNMAP_AND_REVIEW') {
      resultingState = sNode.node_depth === 1 ? 'NEW_SUBJECT_GAP' : 'NEW_NODE_GAP';
    } else {
      resultingState = 'MANUALLY_MAPPED';
    }

    // Get next available work item in deterministic order
    const nextItem = freshReport.workQueue.length > 0 ? freshReport.workQueue[0] : null;

    return {
      resolution: {
        action: normalizedAction,
        syllabusNodeId,
        newState: resultingState,
        canonicalNodeId: resolutionRes.canonicalNodeId,
        reviewedAt: new Date().toISOString(),
        message: resolutionRes.message,
      },
      readiness: {
        affectedSubjectSummary,
        updatedSummary: freshReport.summary,
      },
      workQueue: {
        remainingActionableCount: freshReport.workQueue.length,
        nextItem,
      },
    };
  }
}
