/**
 * COURAGE LIBRARY — EXAM SYLLABUS READINESS & TAXONOMY WORK QUEUE SERVICE
 * Phase 3R.5: Syllabus Readiness, Gap Work Queue & Operational Read Model
 * 
 * Answers the fundamental operational question:
 * "For this exam syllabus version, how much of the required syllabus is represented
 * in our canonical academic taxonomy, what remains unresolved, and what action should the team take?"
 * 
 * SACRED ARCHITECTURAL INVARIANTS:
 * 1. STRICTLY READ-ONLY: Never creates, updates, or deletes taxonomy nodes or syllabus records.
 * 2. NO PARALLEL RECONCILIATION: Consumes authoritative persistent mappings without running parallel heuristics.
 * 3. ARBITRARY DEPTH & TREE PRESERVATION: Preserves complete recursive hierarchy at any depth.
 * 4. CANONICAL DEPTH VS SYLLABUS DEPTH: Richer canonical depth is never classified as a gap.
 * 5. VERSION ISOLATION: Readiness is strictly bound to exam + cycle + syllabus version.
 * 6. DETERMINISTIC WORK QUEUE: Work items, priorities, and blocking flags are computed deterministically.
 * 7. BATCHED / NO N+1 QUERIES: Loads all required entities in single batched queries.
 */

import { createAdminServerSupabaseClient, createServerSupabaseClient } from '@/lib/supabase/server';
import {
  CanonicalTaxonomyNode,
  ExamSyllabusNode,
  ExamSyllabusCanonicalMapping,
  SyllabusMatchStatus,
  MatchMethod,
  SyllabusReadinessState,
  WorkQueueAction,
  WorkQueuePriority,
  SyllabusReadinessSummary,
  SubjectReadinessSummary,
  HierarchicalReadinessNode,
  TaxonomyWorkQueueItem,
  ReconciliationHealth,
  SyllabusReadinessReport,
  SyllabusStructuralDeltaReport,
  SyllabusDeltaItem,
  SyllabusDeltaType,
} from '@/types/dynamic-syllabus-reconciliation';

export interface GetSyllabusReadinessParams {
  syllabusVersionId: string;
  examId?: string;
  supabaseClient?: any;
}

export interface GetWorkQueueParams {
  syllabusVersionId?: string;
  examId?: string;
  priority?: WorkQueuePriority;
  blockingOnly?: boolean;
  limit?: number;
  supabaseClient?: any;
}

export interface CompareSyllabusVersionsParams {
  versionAId: string;
  versionBId: string;
  supabaseClient?: any;
}

export class ExamSyllabusReadinessService {
  /**
   * Generates the comprehensive operational readiness model for an exam syllabus version.
   */
  static async getSyllabusReadiness(
    params: GetSyllabusReadinessParams
  ): Promise<SyllabusReadinessReport> {
    const { syllabusVersionId, supabaseClient } = params;
    const supabase = supabaseClient || (await createAdminServerSupabaseClient());

    // -------------------------------------------------------------------------
    // 1. Batch Load Version, Exam, Syllabus Nodes, Mappings, and Canonical Nodes
    // -------------------------------------------------------------------------
    const [
      versionRes,
      rawSyllabusNodesRes,
      rawCanonicalNodesRes,
    ] = await Promise.all([
      supabase
        .from('exam_syllabus_versions')
        .select(`
          id,
          exam_id,
          exam_cycle_id,
          version_tag,
          raw_payload_hash,
          status,
          created_at,
          updated_at,
          exam:exams(id, title, slug)
        `)
        .eq('id', syllabusVersionId)
        .single(),
      supabase
        .from('exam_syllabus_nodes')
        .select('*')
        .eq('syllabus_version_id', syllabusVersionId)
        .order('node_depth', { ascending: true })
        .order('display_order', { ascending: true }),
      supabase
        .from('canonical_taxonomy_nodes')
        .select('id, root_subject_id, parent_id, name, slug, hierarchy_path, node_depth, node_type, is_active, updated_at, created_at')
        .eq('is_active', true),
    ]);

    if (versionRes.error || !versionRes.data) {
      throw new Error(`Syllabus version not found: ${syllabusVersionId}`);
    }
    const versionData = versionRes.data;
    const examData = (versionData as any).exam;
    const examId = versionData.exam_id;
    const examName = examData?.title || 'Unknown Exam';
    const examCycleId = versionData.exam_cycle_id || null;
    const versionTag = versionData.version_tag;

    if (rawSyllabusNodesRes.error) {
      throw new Error(`Failed to fetch syllabus nodes: ${rawSyllabusNodesRes.error.message}`);
    }
    const syllabusNodes: ExamSyllabusNode[] = rawSyllabusNodesRes.data || [];

    if (rawCanonicalNodesRes.error) {
      throw new Error(`Failed to fetch canonical nodes: ${rawCanonicalNodesRes.error.message}`);
    }
    const canonicalNodes = rawCanonicalNodesRes.data || [];
    const canonicalMap = new Map<string, any>(canonicalNodes.map((n: any) => [n.id, n]));

    // Fetch mappings for these syllabus nodes
    let mappings: ExamSyllabusCanonicalMapping[] = [];
    if (syllabusNodes.length > 0) {
      const nodeIds = syllabusNodes.map((n) => n.id);
      const mappingsRes = await supabase
        .from('exam_syllabus_canonical_mappings')
        .select('*')
        .in('syllabus_node_id', nodeIds);

      if (mappingsRes.error) {
        throw new Error(`Failed to fetch syllabus mappings: ${mappingsRes.error.message}`);
      }
      mappings = mappingsRes.data || [];
    }

    const mappingMap = new Map<string, ExamSyllabusCanonicalMapping>(
      mappings.map((m) => [m.syllabus_node_id, m])
    );

    // Build fast lookup maps for syllabus nodes
    const nodeMap = new Map<string, ExamSyllabusNode>(syllabusNodes.map((n) => [n.id, n]));
    const childrenMap = new Map<string | null, ExamSyllabusNode[]>();
    for (const node of syllabusNodes) {
      const pId = node.parent_node_id;
      if (!childrenMap.has(pId)) {
        childrenMap.set(pId, []);
      }
      childrenMap.get(pId)!.push(node);
    }

    // -------------------------------------------------------------------------
    // 2. Derive Node Path and Root Subject Association in Memory
    // -------------------------------------------------------------------------
    const pathMap = new Map<string, string>();
    const rootSubjectMap = new Map<string, string>(); // syllabusNodeId -> rootSubjectSyllabusNodeId

    function computePathAndRoot(node: ExamSyllabusNode): { path: string; rootId: string } {
      if (pathMap.has(node.id) && rootSubjectMap.has(node.id)) {
        return { path: pathMap.get(node.id)!, rootId: rootSubjectMap.get(node.id)! };
      }

      if (!node.parent_node_id) {
        pathMap.set(node.id, node.raw_title);
        rootSubjectMap.set(node.id, node.id);
        return { path: node.raw_title, rootId: node.id };
      }

      const parentNode = nodeMap.get(node.parent_node_id);
      if (!parentNode) {
        pathMap.set(node.id, node.raw_title);
        rootSubjectMap.set(node.id, node.id);
        return { path: node.raw_title, rootId: node.id };
      }

      const parentInfo = computePathAndRoot(parentNode);
      const computedPath = `${parentInfo.path} > ${node.raw_title}`;
      pathMap.set(node.id, computedPath);
      rootSubjectMap.set(node.id, parentInfo.rootId);
      return { path: computedPath, rootId: parentInfo.rootId };
    }

    for (const node of syllabusNodes) {
      computePathAndRoot(node);
    }

    // -------------------------------------------------------------------------
    // 3. Annotate Nodes: State, Action, Priority, Blocking
    // -------------------------------------------------------------------------
    interface AnnotatedSyllabusNode {
      node: ExamSyllabusNode;
      mapping: ExamSyllabusCanonicalMapping | null;
      readinessState: SyllabusReadinessState;
      requiredAction: WorkQueueAction;
      priority: WorkQueuePriority;
      isBlocking: boolean;
      mappedCanonicalNode: any | null;
      canonicalCandidate: any | null;
      confidence: number;
      matchMethod: string | null;
    }

    const annotatedMap = new Map<string, AnnotatedSyllabusNode>();

    for (const node of syllabusNodes) {
      const mapping = mappingMap.get(node.id) || null;
      let readinessState: SyllabusReadinessState = 'UNREVIEWED';
      let confidence = mapping?.match_confidence ?? 0;
      let matchMethod = mapping?.match_method ?? null;
      let mappedCanonicalNode: any = null;
      let canonicalCandidate: any = null;

      if (mapping) {
        if (mapping.canonical_node_id && canonicalMap.has(mapping.canonical_node_id)) {
          mappedCanonicalNode = canonicalMap.get(mapping.canonical_node_id);
        }

        switch (mapping.match_status) {
          case 'EXACT_MATCH':
          case 'ALIAS_MATCH':
            readinessState = 'MATCHED';
            break;
          case 'MANUALLY_MAPPED':
            readinessState = 'MANUALLY_MAPPED';
            break;
          case 'PROPOSED_MATCH':
            readinessState = 'PROPOSED_REVIEW';
            break;
          case 'AMBIGUOUS':
            readinessState = 'AMBIGUOUS_REVIEW';
            break;
          case 'NEW_SUBJECT_GAP':
            readinessState = 'NEW_SUBJECT_GAP';
            break;
          case 'NEW_NODE_GAP':
            readinessState = 'NEW_NODE_GAP';
            break;
          case 'IGNORED':
            readinessState = 'IGNORED';
            break;
          case 'REJECTED':
            readinessState = 'REJECTED';
            break;
          default:
            readinessState = 'UNREVIEWED';
        }

        // Candidate match metadata for review items
        if (mapping.candidate_matches && mapping.candidate_matches.length > 0) {
          const topCand = mapping.candidate_matches[0];
          canonicalCandidate = {
            id: topCand.canonicalNodeId,
            name: topCand.name,
            slug: topCand.slug,
            hierarchyPath: topCand.hierarchyPath,
            nodeDepth: topCand.nodeDepth,
          };
        } else if (mappedCanonicalNode) {
          canonicalCandidate = {
            id: mappedCanonicalNode.id,
            name: mappedCanonicalNode.name,
            slug: mappedCanonicalNode.slug,
            hierarchyPath: mappedCanonicalNode.hierarchy_path,
            nodeDepth: mappedCanonicalNode.node_depth,
          };
        }
      } else {
        // No mapping record present
        readinessState = 'UNREVIEWED';
      }

      // Derive required action
      let requiredAction: WorkQueueAction = 'NO_ACTION';
      switch (readinessState) {
        case 'PROPOSED_REVIEW':
          requiredAction = 'REVIEW_PROPOSED_MATCH';
          break;
        case 'AMBIGUOUS_REVIEW':
          requiredAction = 'RESOLVE_AMBIGUITY';
          break;
        case 'NEW_SUBJECT_GAP':
          requiredAction = 'CREATE_CANONICAL_SUBJECT';
          break;
        case 'NEW_NODE_GAP':
          requiredAction = 'CREATE_CANONICAL_NODE';
          break;
        case 'REJECTED':
          requiredAction = 'REVIEW_REJECTED_PROPOSAL';
          break;
        case 'UNREVIEWED':
          requiredAction = node.node_depth === 1 ? 'CREATE_CANONICAL_SUBJECT' : 'CREATE_CANONICAL_NODE';
          break;
        case 'IGNORED':
        case 'MATCHED':
        case 'MANUALLY_MAPPED':
        default:
          requiredAction = 'NO_ACTION';
      }

      // Priority derivation based on strict Step 5.1 canonical rules:
      // BLOCKING: mandatory NEW_SUBJECT_GAP, mandatory NEW_NODE_GAP, mandatory AMBIGUOUS_REVIEW
      // HIGH: mandatory PROPOSED_REVIEW, mandatory REJECTED, non-mandatory NEW_SUBJECT_GAP, non-mandatory AMBIGUOUS_REVIEW
      // MEDIUM: non-mandatory NEW_NODE_GAP, non-mandatory PROPOSED_REVIEW
      // LOW: UNREVIEWED, non-mandatory REJECTED, and default items
      const isMandatory = node.is_mandatory !== false;
      let priority: WorkQueuePriority = 'LOW';

      if (isMandatory) {
        if (readinessState === 'NEW_SUBJECT_GAP' || readinessState === 'NEW_NODE_GAP' || readinessState === 'AMBIGUOUS_REVIEW') {
          priority = 'BLOCKING';
        } else if (readinessState === 'PROPOSED_REVIEW' || readinessState === 'REJECTED') {
          priority = 'HIGH';
        } else {
          priority = 'LOW';
        }
      } else {
        // Non-mandatory
        if (readinessState === 'NEW_SUBJECT_GAP' || readinessState === 'AMBIGUOUS_REVIEW') {
          priority = 'HIGH';
        } else if (readinessState === 'NEW_NODE_GAP' || readinessState === 'PROPOSED_REVIEW') {
          priority = 'MEDIUM';
        } else {
          priority = 'LOW';
        }
      }

      // Blocking flag is strictly true for BLOCKING priority items
      const isBlocking = priority === 'BLOCKING';

      annotatedMap.set(node.id, {
        node,
        mapping,
        readinessState,
        requiredAction,
        priority,
        isBlocking,
        mappedCanonicalNode,
        canonicalCandidate,
        confidence,
        matchMethod,
      });
    }

    // -------------------------------------------------------------------------
    // 4. Compute Aggregate Readiness Summary (Exact Denominator & Semantic Partitions)
    // -------------------------------------------------------------------------
    const totalSyllabusNodes = syllabusNodes.length;
    const rootNodes = syllabusNodes.filter((n) => !n.parent_node_id);
    const totalRootSubjects = rootNodes.length;

    let matchedNodes = 0;
    let manuallyMappedNodes = 0;
    let proposedMatches = 0;
    let ambiguousNodes = 0;
    let newSubjectGaps = 0;
    let newNodeGaps = 0;
    let ignoredRequirements = 0;
    let rejectedProposals = 0;
    let unreviewedNodes = 0;

    for (const item of annotatedMap.values()) {
      switch (item.readinessState) {
        case 'MATCHED':
          matchedNodes++;
          break;
        case 'MANUALLY_MAPPED':
          manuallyMappedNodes++;
          break;
        case 'PROPOSED_REVIEW':
          proposedMatches++;
          break;
        case 'AMBIGUOUS_REVIEW':
          ambiguousNodes++;
          break;
        case 'NEW_SUBJECT_GAP':
          newSubjectGaps++;
          break;
        case 'NEW_NODE_GAP':
          newNodeGaps++;
          break;
        case 'IGNORED':
          ignoredRequirements++;
          break;
        case 'REJECTED':
          rejectedProposals++;
          break;
        case 'UNREVIEWED':
          unreviewedNodes++;
          break;
      }
    }

    // Semantic Partitions:
    // Partition A: Mapped / Resolved (MATCHED + MANUALLY_MAPPED)
    const mappedNodes = matchedNodes + manuallyMappedNodes;

    // Partition B: Intentionally Excluded (IGNORED)
    const excludedNodes = ignoredRequirements;

    // Partition C: Action Required / Unresolved (PROPOSED_REVIEW + AMBIGUOUS_REVIEW + NEW_SUBJECT_GAP + NEW_NODE_GAP + REJECTED + UNREVIEWED)
    const unresolvedNodes = proposedMatches + ambiguousNodes + newSubjectGaps + newNodeGaps + rejectedProposals + unreviewedNodes;
    const actionRequiredNodes = unresolvedNodes;

    const calcPct = (count: number) =>
      totalSyllabusNodes > 0 ? Number(((count / totalSyllabusNodes) * 100).toFixed(1)) : 0.0;

    const taxonomyCoveragePercentage = calcPct(mappedNodes);
    const excludedPercentage = calcPct(excludedNodes);
    const unresolvedPercentage = calcPct(unresolvedNodes);

    const summary: SyllabusReadinessSummary = {
      totalSyllabusNodes,
      totalRootSubjects,

      // Partition 1
      mappedNodes,
      matchedNodes,
      manuallyMappedNodes,

      // Partition 2
      excludedNodes,
      ignoredRequirements,

      // Partition 3
      unresolvedNodes,
      actionRequiredNodes,
      proposedMatches,
      ambiguousNodes,
      newSubjectGaps,
      newNodeGaps,
      rejectedProposals,
      unreviewedNodes,

      // Primary Percentages
      taxonomyCoveragePercentage,
      excludedPercentage,
      unresolvedPercentage,

      // Granular Percentages
      matchedPercentage: calcPct(matchedNodes),
      manuallyMappedPercentage: calcPct(manuallyMappedNodes),
      proposedPercentage: calcPct(proposedMatches),
      ambiguousPercentage: calcPct(ambiguousNodes),
      newSubjectGapsPercentage: calcPct(newSubjectGaps),
      newNodeGapsPercentage: calcPct(newNodeGaps),
      ignoredPercentage: calcPct(ignoredRequirements),
      rejectedPercentage: calcPct(rejectedProposals),
      unreviewedPercentage: calcPct(unreviewedNodes),

      // Backward Compatibility
      resolvedNodes: mappedNodes,
      resolvedPercentage: taxonomyCoveragePercentage,
    };

    // -------------------------------------------------------------------------
    // 5. Compute Subject-Level Readiness
    // -------------------------------------------------------------------------
    const subjectSummaries: SubjectReadinessSummary[] = [];

    for (const rootNode of rootNodes) {
      // Find all descendants of this root node
      const descendantIds = new Set<string>();
      function collectDescendants(parentId: string) {
        descendantIds.add(parentId);
        const children = childrenMap.get(parentId) || [];
        for (const child of children) {
          collectDescendants(child.id);
        }
      }
      collectDescendants(rootNode.id);

      let subMapped = 0;
      let subExcluded = 0;
      let subUnresolved = 0;
      let subBlockingGaps = 0;
      let subReview = 0;
      let subGaps = 0;
      const subRequired = descendantIds.size;

      for (const id of descendantIds) {
        const item = annotatedMap.get(id);
        if (!item) continue;
        if (item.readinessState === 'MATCHED' || item.readinessState === 'MANUALLY_MAPPED') {
          subMapped++;
        } else if (item.readinessState === 'IGNORED') {
          subExcluded++;
        } else {
          subUnresolved++;
          if (item.isBlocking) {
            subBlockingGaps++;
          }
          if (item.readinessState === 'PROPOSED_REVIEW' || item.readinessState === 'AMBIGUOUS_REVIEW') {
            subReview++;
          } else {
            subGaps++;
          }
        }
      }

      const subTaxonomyCoveragePct = subRequired > 0 ? Number(((subMapped / subRequired) * 100).toFixed(1)) : 0.0;

      // Status semantics:
      // READY: 0 unresolved/action-required nodes (may contain excludedNodes)
      // ACTION_REQUIRED: contains at least one BLOCKING priority unresolved item
      // IN_PROGRESS: unresolved items exist, but none are BLOCKING
      let subStatus: 'READY' | 'ACTION_REQUIRED' | 'IN_PROGRESS' = 'READY';
      if (subUnresolved === 0) {
        subStatus = 'READY';
      } else if (subBlockingGaps > 0) {
        subStatus = 'ACTION_REQUIRED';
      } else {
        subStatus = 'IN_PROGRESS';
      }

      subjectSummaries.push({
        subjectId: rootNode.id,
        subjectTitle: rootNode.raw_title,
        subjectSlug: rootNode.raw_slug,
        status: subStatus,
        requiredNodes: subRequired,
        mappedNodes: subMapped,
        excludedNodes: subExcluded,
        unresolvedNodes: subUnresolved,
        blockingGapCount: subBlockingGaps,
        taxonomyCoveragePercentage: subTaxonomyCoveragePct,
        resolvedNodes: subMapped,
        reviewNodes: subReview,
        gapNodes: subGaps,
        resolvedPercentage: subTaxonomyCoveragePct,
      });
    }

    // -------------------------------------------------------------------------
    // 6. Build Recursive Hierarchical Readiness Tree
    // -------------------------------------------------------------------------
    function buildHierarchy(parentId: string | null): HierarchicalReadinessNode[] {
      const childNodes = childrenMap.get(parentId) || [];
      return childNodes.map((node) => {
        const annotated = annotatedMap.get(node.id)!;
        return {
          syllabusNodeId: node.id,
          rawTitle: node.raw_title,
          rawSlug: node.raw_slug,
          nodeDepth: node.node_depth,
          displayOrder: node.display_order,
          isMandatory: node.is_mandatory !== false,
          readinessState: annotated.readinessState,
          mappedCanonicalNodeId: annotated.mappedCanonicalNode?.id || null,
          mappedCanonicalPath: annotated.mappedCanonicalNode?.hierarchy_path || null,
          confidence: annotated.confidence,
          matchMethod: annotated.matchMethod,
          requiredAction: annotated.requiredAction,
          priority: annotated.priority,
          isBlocking: annotated.isBlocking,
          children: buildHierarchy(node.id),
        };
      });
    }

    const tree = buildHierarchy(null);

    // -------------------------------------------------------------------------
    // 7. Build Actionable Work Queue
    // -------------------------------------------------------------------------
    const now = Date.now();
    const workQueue: TaxonomyWorkQueueItem[] = [];

    const priorityWeights: Record<WorkQueuePriority, number> = {
      BLOCKING: 4,
      HIGH: 3,
      MEDIUM: 2,
      LOW: 1,
    };

    for (const item of annotatedMap.values()) {
      if (
        item.requiredAction === 'NO_ACTION' ||
        item.readinessState === 'MATCHED' ||
        item.readinessState === 'MANUALLY_MAPPED' ||
        item.readinessState === 'IGNORED'
      ) {
        continue;
      }

      const createdTime = new Date(item.node.created_at).getTime();
      const ageMs = Math.max(0, now - createdTime);
      const ageHours = Math.floor(ageMs / (1000 * 60 * 60));
      const ageDays = Math.floor(ageHours / 24);
      const ageString = ageDays > 0 ? `${ageDays}d` : `${ageHours}h`;

      workQueue.push({
        examId,
        examName,
        examCycleId,
        syllabusVersionId,
        syllabusVersionTag: versionTag,
        syllabusNodeId: item.node.id,
        syllabusTitle: item.node.raw_title,
        syllabusSlug: item.node.raw_slug,
        syllabusPath: pathMap.get(item.node.id) || item.node.raw_title,
        syllabusDepth: item.node.node_depth,
        isMandatory: item.node.is_mandatory !== false,
        currentStatus: item.readinessState,
        canonicalCandidate: item.canonicalCandidate,
        confidence: item.confidence,
        matchMethod: item.matchMethod,
        requiredAction: item.requiredAction,
        priority: item.priority,
        isBlocking: item.isBlocking,
        reviewedBy: item.mapping?.reviewed_by || null,
        reviewedAt: item.mapping?.reviewed_at || null,
        ageMs,
        ageString,
      });
    }

    // Sort work queue: Priority desc -> nodeDepth asc -> displayOrder asc -> title asc
    workQueue.sort((a, b) => {
      const pDiff = priorityWeights[b.priority] - priorityWeights[a.priority];
      if (pDiff !== 0) return pDiff;
      if (a.syllabusDepth !== b.syllabusDepth) return a.syllabusDepth - b.syllabusDepth;
      const orderA = nodeMap.get(a.syllabusNodeId)?.display_order || 0;
      const orderB = nodeMap.get(b.syllabusNodeId)?.display_order || 0;
      if (orderA !== orderB) return orderA - orderB;
      return a.syllabusTitle.localeCompare(b.syllabusTitle);
    });

    // -------------------------------------------------------------------------
    // 8. Relevant-Scope Staleness Detection
    // -------------------------------------------------------------------------
    let latestMappingUpdate: string | null = null;
    for (const m of mappings) {
      const ts = m.updated_at || m.created_at;
      if (!latestMappingUpdate || new Date(ts).getTime() > new Date(latestMappingUpdate).getTime()) {
        latestMappingUpdate = ts;
      }
    }

    // Determine relevant canonical scope:
    // 1. All canonical node IDs mapped directly
    // 2. All canonical candidates referenced in mappings
    // 3. All root subjects associated with (1) & (2)
    // 4. All ancestor and descendant nodes within those relevant root subjects
    const relevantRootSubjectIds = new Set<string>();
    const relevantCanonicalNodeIds = new Set<string>();

    for (const m of mappings) {
      if (m.canonical_node_id) {
        relevantCanonicalNodeIds.add(m.canonical_node_id);
        const node = canonicalMap.get(m.canonical_node_id);
        if (node?.root_subject_id) {
          relevantRootSubjectIds.add(node.root_subject_id);
        }
      }
      if (m.candidate_matches && Array.isArray(m.candidate_matches)) {
        for (const cand of m.candidate_matches) {
          if (cand.canonicalNodeId) {
            relevantCanonicalNodeIds.add(cand.canonicalNodeId);
            const node = canonicalMap.get(cand.canonicalNodeId);
            if (node?.root_subject_id) {
              relevantRootSubjectIds.add(node.root_subject_id);
            }
          }
        }
      }
    }

    // Collect all canonical nodes belonging to relevant root subjects or referenced sets
    const relevantCanonicalNodes = canonicalNodes.filter((c: any) => {
      return (
        relevantCanonicalNodeIds.has(c.id) ||
        (c.root_subject_id && relevantRootSubjectIds.has(c.root_subject_id))
      );
    });

    let latestRelevantCanonicalUpdate: string | null = null;
    for (const c of relevantCanonicalNodes) {
      const ts = c.updated_at || c.created_at;
      if (!latestRelevantCanonicalUpdate || new Date(ts).getTime() > new Date(latestRelevantCanonicalUpdate).getTime()) {
        latestRelevantCanonicalUpdate = ts;
      }
    }

    let isStale = false;
    let reconciliationStatus: 'FRESH' | 'RECONCILIATION_STALE' | 'NOT_RECONCILED' = 'FRESH';
    let staleReason: string | null = null;

    if (totalSyllabusNodes > 0 && mappings.length === 0) {
      reconciliationStatus = 'NOT_RECONCILED';
      isStale = false;
    } else if (
      latestMappingUpdate &&
      latestRelevantCanonicalUpdate &&
      new Date(latestRelevantCanonicalUpdate).getTime() > new Date(latestMappingUpdate).getTime()
    ) {
      isStale = true;
      reconciliationStatus = 'RECONCILIATION_STALE';
      staleReason = 'One or more relevant canonical taxonomy nodes in the reconciled scope were updated after reconciliation.';
    }

    const health: ReconciliationHealth = {
      lastReconciliationAt: latestMappingUpdate,
      syllabusVersionHash: versionData.raw_payload_hash,
      canonicalTaxonomyLatestUpdatedAt: latestRelevantCanonicalUpdate,
      relevantCanonicalNodeCount: relevantCanonicalNodes.length,
      totalMappings: mappings.length,
      unresolvedNodes,
      isStale,
      reconciliationStatus,
      recommendReconciliation: isStale || reconciliationStatus === 'NOT_RECONCILED',
      staleReason,
    };

    return {
      examId,
      examName,
      examCycleId,
      syllabusVersionId,
      versionTag,
      generatedAt: new Date().toISOString(),
      summary,
      subjects: subjectSummaries,
      tree,
      workQueue,
      health,
    };
  }

  /**
   * Compares two syllabus versions and generates a structural delta report.
   */
  static async compareSyllabusVersions(
    params: CompareSyllabusVersionsParams
  ): Promise<SyllabusStructuralDeltaReport> {
    const { versionAId, versionBId, supabaseClient } = params;
    const supabase = supabaseClient || (await createAdminServerSupabaseClient());

    const [vARes, vBRes, nodesARes, nodesBRes] = await Promise.all([
      supabase.from('exam_syllabus_versions').select('id, version_tag').eq('id', versionAId).single(),
      supabase.from('exam_syllabus_versions').select('id, version_tag').eq('id', versionBId).single(),
      supabase.from('exam_syllabus_nodes').select('*').eq('syllabus_version_id', versionAId).order('node_depth'),
      supabase.from('exam_syllabus_nodes').select('*').eq('syllabus_version_id', versionBId).order('node_depth'),
    ]);

    if (vARes.error || !vARes.data) throw new Error(`Syllabus version A not found: ${versionAId}`);
    if (vBRes.error || !vBRes.data) throw new Error(`Syllabus version B not found: ${versionBId}`);

    const versionA = vARes.data;
    const versionB = vBRes.data;
    const nodesA: ExamSyllabusNode[] = nodesARes.data || [];
    const nodesB: ExamSyllabusNode[] = nodesBRes.data || [];

    const mapABySlug = new Map<string, ExamSyllabusNode>(nodesA.map((n) => [n.raw_slug, n]));
    const mapBBySlug = new Map<string, ExamSyllabusNode>(nodesB.map((n) => [n.raw_slug, n]));
    const mapAByTitle = new Map<string, ExamSyllabusNode>(nodesA.map((n) => [n.raw_title.toLowerCase().trim(), n]));
    const mapBByTitle = new Map<string, ExamSyllabusNode>(nodesB.map((n) => [n.raw_title.toLowerCase().trim(), n]));

    const deltas: SyllabusDeltaItem[] = [];
    let added = 0;
    let removed = 0;
    let unchanged = 0;
    let depthExpanded = 0;
    let depthReduced = 0;
    let possibleRenamed = 0;

    // Check additions, modifications, expansions in Version B
    for (const bNode of nodesB) {
      if (mapABySlug.has(bNode.raw_slug)) {
        const aNode = mapABySlug.get(bNode.raw_slug)!;
        if (bNode.node_depth > aNode.node_depth) {
          depthExpanded++;
          deltas.push({
            deltaType: 'DEPTH_EXPANDED',
            syllabusNodeId: bNode.id,
            rawTitle: bNode.raw_title,
            previousVersionNodeId: aNode.id,
            details: `Depth expanded from ${aNode.node_depth} to ${bNode.node_depth}`,
          });
        } else if (bNode.node_depth < aNode.node_depth) {
          depthReduced++;
          deltas.push({
            deltaType: 'DEPTH_REDUCED',
            syllabusNodeId: bNode.id,
            rawTitle: bNode.raw_title,
            previousVersionNodeId: aNode.id,
            details: `Depth reduced from ${aNode.node_depth} to ${bNode.node_depth}`,
          });
        } else {
          unchanged++;
          deltas.push({
            deltaType: 'UNCHANGED',
            syllabusNodeId: bNode.id,
            rawTitle: bNode.raw_title,
            previousVersionNodeId: aNode.id,
            details: `Node identical across versions`,
          });
        }
      } else {
        // Check if title exists under a different slug
        const normTitle = bNode.raw_title.toLowerCase().trim();
        if (mapAByTitle.has(normTitle)) {
          const aNode = mapAByTitle.get(normTitle)!;
          possibleRenamed++;
          deltas.push({
            deltaType: 'POSSIBLE_RENAMED',
            syllabusNodeId: bNode.id,
            rawTitle: bNode.raw_title,
            previousVersionNodeId: aNode.id,
            details: `Slug changed from "${aNode.raw_slug}" to "${bNode.raw_slug}"`,
          });
        } else {
          added++;
          deltas.push({
            deltaType: 'ADDED',
            syllabusNodeId: bNode.id,
            rawTitle: bNode.raw_title,
            details: `New syllabus node added in version ${versionB.version_tag}`,
          });
        }
      }
    }

    // Check removals from Version A
    for (const aNode of nodesA) {
      if (!mapBBySlug.has(aNode.raw_slug) && !mapBByTitle.has(aNode.raw_title.toLowerCase().trim())) {
        removed++;
        deltas.push({
          deltaType: 'REMOVED',
          syllabusNodeId: aNode.id,
          rawTitle: aNode.raw_title,
          details: `Syllabus node removed in version ${versionB.version_tag}`,
        });
      }
    }

    return {
      versionAId,
      versionATag: versionA.version_tag,
      versionBId,
      versionBTag: versionB.version_tag,
      generatedAt: new Date().toISOString(),
      deltas,
      summary: {
        added,
        removed,
        unchanged,
        depthExpanded,
        depthReduced,
        possibleRenamed,
      },
    };
  }
}

/**
 * TAXONOMY WORK QUEUE SERVICE
 * Operational query interface for listing and prioritizing taxonomy review items.
 */
export class TaxonomyWorkQueueService {
  /**
   * Retrieves actionable work items across one or all syllabus versions.
   */
  static async getWorkQueue(params: GetWorkQueueParams = {}): Promise<TaxonomyWorkQueueItem[]> {
    const { syllabusVersionId, priority, blockingOnly = false, limit, supabaseClient } = params;

    if (syllabusVersionId) {
      const report = await ExamSyllabusReadinessService.getSyllabusReadiness({
        syllabusVersionId,
        supabaseClient,
      });

      let items = report.workQueue;
      if (priority) {
        items = items.filter((i) => i.priority === priority);
      }
      if (blockingOnly) {
        items = items.filter((i) => i.isBlocking);
      }
      if (limit && limit > 0) {
        items = items.slice(0, limit);
      }
      return items;
    }

    const supabase = supabaseClient || (await createAdminServerSupabaseClient());
    const { data: versions, error } = await supabase
      .from('exam_syllabus_versions')
      .select('id')
      .eq('is_active', true);

    if (error || !versions) {
      return [];
    }

    const allItems: TaxonomyWorkQueueItem[] = [];
    for (const v of versions) {
      const report = await ExamSyllabusReadinessService.getSyllabusReadiness({
        syllabusVersionId: v.id,
        supabaseClient,
      });
      allItems.push(...report.workQueue);
    }

    let filtered = allItems;
    if (priority) {
      filtered = filtered.filter((i) => i.priority === priority);
    }
    if (blockingOnly) {
      filtered = filtered.filter((i) => i.isBlocking);
    }

    const priorityWeights: Record<WorkQueuePriority, number> = {
      BLOCKING: 4,
      HIGH: 3,
      MEDIUM: 2,
      LOW: 1,
    };

    filtered.sort((a, b) => {
      const pDiff = priorityWeights[b.priority] - priorityWeights[a.priority];
      if (pDiff !== 0) return pDiff;
      if (a.syllabusDepth !== b.syllabusDepth) return a.syllabusDepth - b.syllabusDepth;
      return a.syllabusTitle.localeCompare(b.syllabusTitle);
    });

    if (limit && limit > 0) {
      filtered = filtered.slice(0, limit);
    }

    return filtered;
  }
}
