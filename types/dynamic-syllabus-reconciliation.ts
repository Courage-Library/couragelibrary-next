/**
 * COURAGE LIBRARY — DYNAMIC EXAM SYLLABUS RECONCILIATION DOMAIN TYPES
 * Phase 3R.3: Context-Aware Reconciliation Engine & Gap Manifest
 * 
 * Defines domain contracts for:
 * 1. canonical_taxonomy_nodes (Recursive canonical academic taxonomy)
 * 2. taxonomy_aliases (Canonical synonym registry)
 * 3. exam_syllabus_versions (Syllabus order containers)
 * 4. exam_syllabus_nodes (Recursive imported syllabus requirement tree)
 * 5. exam_syllabus_canonical_mappings (1:1 syllabus-to-canonical projections)
 * 6. Reconciliation Manifest, Gap analysis & Version Delta models
 */

export type CanonicalNodeType = 'SUBJECT' | 'DOMAIN' | 'TOPIC' | 'SUBTOPIC' | 'CONCEPT' | 'METHOD';

export interface CanonicalTaxonomyNode {
  id: string;
  parent_id: string | null;
  root_subject_id: string;
  name: string;
  slug: string;
  node_type: CanonicalNodeType;
  node_depth: number;
  hierarchy_path: string;
  display_order: number;
  is_active: boolean;
  metadata: Record<string, any>;
  legacy_subject_id?: string | null;
  legacy_topic_id?: string | null;
  legacy_subtopic_id?: string | null;
  created_at: string;
  updated_at: string;
  
  // Optional relations
  parent?: CanonicalTaxonomyNode | null;
  children?: CanonicalTaxonomyNode[];
  aliases?: TaxonomyAlias[];
}

export interface TaxonomyAlias {
  id: string;
  canonical_node_id: string;
  alias_name: string;
  normalized_alias: string;
  alias_context: string;
  created_at: string;
}

export type SyllabusVersionStatus = 'DRAFT' | 'RECONCILED' | 'PUBLISHED' | 'ARCHIVED';

export interface ExamSyllabusVersion {
  id: string;
  exam_id: string;
  exam_cycle_id?: string | null;
  version_tag: string;
  source_document_id?: string | null;
  raw_payload_hash: string;
  status: SyllabusVersionStatus;
  is_active: boolean;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
  
  // Relations
  nodes?: ExamSyllabusNode[];
}

export type SyllabusWeightageTier = 'HIGH_YIELD' | 'CORE' | 'MODERATE' | 'LOW' | 'OPTIONAL';
export type CognitiveDepth = 'RECALL' | 'UNDERSTANDING' | 'APPLICATION' | 'ANALYSIS' | 'COMPLEX_PROBLEM_SOLVING';

export interface ExamSyllabusNode {
  id: string;
  syllabus_version_id: string;
  parent_node_id: string | null;
  raw_title: string;
  raw_slug: string;
  node_depth: number;
  display_order: number;
  weightage_tier?: SyllabusWeightageTier | null;
  expected_questions_min?: number;
  expected_questions_max?: number;
  required_cognitive_depth?: CognitiveDepth | null;
  is_mandatory: boolean;
  created_at: string;
  updated_at: string;
  
  // Relations
  parent?: ExamSyllabusNode | null;
  children?: ExamSyllabusNode[];
  canonical_mapping?: ExamSyllabusCanonicalMapping | null;
}

export type SyllabusMatchStatus = 
  | 'EXACT_MATCH'
  | 'ALIAS_MATCH'
  | 'PROPOSED_MATCH'
  | 'MANUALLY_MAPPED'
  | 'NEW_SUBJECT_GAP'
  | 'NEW_NODE_GAP'
  | 'AMBIGUOUS'
  | 'IGNORED'
  | 'REJECTED';

export type MatchMethod =
  | 'EXACT_CONTEXTUAL'
  | 'NORMALIZED_EXACT'
  | 'ALIAS_REGISTRY'
  | 'CONTEXTUAL_CANDIDATE'
  | 'TRIGRAM_SIMILARITY'
  | 'UNMATCHED_GAP'
  | 'MANUAL';

export type ResolutionAction =
  | 'ACCEPT_EXISTING_MATCH'
  | 'ACCEPT_PROPOSED_MATCH'
  | 'RESOLVE_AMBIGUOUS'
  | 'CREATE_NEW_CANONICAL_NODE'
  | 'CREATE_NEW_SUBJECT'
  | 'CREATE_NEW_SUBTREE'
  | 'IGNORE_REQUIREMENT'
  | 'REJECT_PROPOSAL'
  | 'UNMAP_AND_REVIEW'
  | 'ADD_ALIAS';

export interface CanonicalCandidateMatch {
  canonicalNodeId: string;
  name: string;
  slug: string;
  hierarchyPath: string;
  nodeDepth: number;
  similarity: number;
  matchMethod: MatchMethod;
  reason: string;
}

export interface ExamSyllabusCanonicalMapping {
  id: string;
  syllabus_node_id: string;
  canonical_node_id: string | null;
  match_status: SyllabusMatchStatus;
  match_confidence: number;
  match_method?: MatchMethod;
  match_notes?: string | null;
  candidate_matches?: CanonicalCandidateMatch[];
  reconciliation_metadata?: Record<string, any>;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  created_at: string;
  updated_at: string;
  
  // Relations
  syllabus_node?: ExamSyllabusNode;
  canonical_node?: CanonicalTaxonomyNode | null;
}

// -----------------------------------------------------------------------------
// Reconciliation Manifest & Gap Types
// -----------------------------------------------------------------------------

export interface SyllabusReconciliationItem {
  syllabusNodeId: string;
  rawTitle: string;
  rawSlug: string;
  nodeDepth: number;
  displayOrder: number;
  weightageTier?: SyllabusWeightageTier | null;
  isMandatory: boolean;
  matchStatus: SyllabusMatchStatus;
  matchConfidence: number;
  matchMethod: MatchMethod;
  matchReason: string;
  matchedCanonicalNodeId: string | null;
  matchedCanonicalPath: string | null;
  candidateMatches: CanonicalCandidateMatch[];
  children: SyllabusReconciliationItem[];
}

export type SyllabusGapType = 
  | 'NEW_SUBJECT_GAP'
  | 'NEW_NODE_GAP'
  | 'AMBIGUOUS_MAPPING_GAP'
  | 'DEPTH_DEFICIT_GAP';

export interface SyllabusGapItem {
  gapType: SyllabusGapType;
  syllabusNodeId: string;
  rawTitle: string;
  syllabusPath: string;
  nodeDepth: number;
  parentSyllabusNodeId: string | null;
  parentCanonicalNodeId: string | null;
  requiredAction: string;
  candidates?: CanonicalCandidateMatch[];
}

export type SyllabusDeltaType =
  | 'ADDED'
  | 'REMOVED'
  | 'UNCHANGED'
  | 'DEPTH_EXPANDED'
  | 'DEPTH_REDUCED'
  | 'POSSIBLE_RENAMED';

export interface SyllabusDeltaItem {
  deltaType: SyllabusDeltaType;
  syllabusNodeId: string;
  rawTitle: string;
  previousVersionNodeId?: string;
  details: string;
}

export interface SyllabusReconciliationManifest {
  examId: string;
  examName: string;
  syllabusVersionId: string;
  versionTag: string;
  generatedAt: string;
  summary: {
    totalNodes: number;
    exactMatches: number;
    aliasMatches: number;
    proposedMatches: number;
    manuallyMapped: number;
    newSubjects: number;
    newNodes: number;
    ambiguous: number;
    ignored: number;
    taxonomyCoveragePercentage: number;
  };
  subjects: SyllabusReconciliationItem[];
  gaps: SyllabusGapItem[];
  deltas?: SyllabusDeltaItem[];
}

// -----------------------------------------------------------------------------
// Phase 3R.4: Human Review & Taxonomy Resolution Models
// -----------------------------------------------------------------------------

export interface ResolutionSubtreeItem {
  syllabusNodeId: string;
  name: string;
  slug?: string;
  nodeType?: CanonicalNodeType;
  parentSyllabusNodeId?: string | null;
  displayOrder?: number;
  metadata?: Record<string, any>;
}

export interface ResolveMatchParams {
  syllabusNodeId: string;
  action: ResolutionAction;
  canonicalNodeId?: string | null;
  targetParentId?: string | null;
  newNodeName?: string;
  newNodeSlug?: string;
  newNodeType?: CanonicalNodeType;
  aliasName?: string;
  aliasContext?: string;
  notes?: string;
  reviewerUserId: string;
  subtreeNodes?: ResolutionSubtreeItem[];
}

export interface ResolutionResult {
  success: boolean;
  action: ResolutionAction;
  syllabusNodeId: string;
  canonicalNodeId: string | null;
  mappingId: string;
  createdCanonicalNodeIds?: string[];
  createdAliasIds?: string[];
  reusedExistingNode: boolean;
  message: string;
  historicalState?: Record<string, any>;
}

export interface TaxonomyWorkItem {
  syllabusNodeId: string;
  syllabusVersionId: string;
  rawTitle: string;
  rawSlug: string;
  nodeDepth: number;
  displayOrder: number;
  currentMapping: {
    id: string;
    matchStatus: SyllabusMatchStatus;
    matchConfidence: number;
    matchMethod: MatchMethod;
    matchedCanonicalNodeId: string | null;
    matchedCanonicalPath: string | null;
    candidateMatches: CanonicalCandidateMatch[];
    matchNotes: string | null;
    reviewedBy: string | null;
    reviewedAt: string | null;
  } | null;
  suggestedAction: ResolutionAction;
  requiresReview: boolean;
}

// -----------------------------------------------------------------------------
// Phase 3R.5: Syllabus Readiness, Gap Work Queue & Operational Read Models
// -----------------------------------------------------------------------------

export type SyllabusReadinessState =
  | 'MATCHED'
  | 'MANUALLY_MAPPED'
  | 'PROPOSED_REVIEW'
  | 'AMBIGUOUS_REVIEW'
  | 'NEW_SUBJECT_GAP'
  | 'NEW_NODE_GAP'
  | 'IGNORED'
  | 'REJECTED'
  | 'UNREVIEWED';

export type WorkQueueAction =
  | 'REVIEW_PROPOSED_MATCH'
  | 'RESOLVE_AMBIGUITY'
  | 'CREATE_CANONICAL_NODE'
  | 'CREATE_CANONICAL_SUBJECT'
  | 'REVIEW_IGNORED_REQUIREMENT'
  | 'REVIEW_REJECTED_PROPOSAL'
  | 'NO_ACTION';

export type WorkQueuePriority = 'BLOCKING' | 'HIGH' | 'MEDIUM' | 'LOW';

export type SubjectReadinessStatus = 'READY' | 'ACTION_REQUIRED' | 'IN_PROGRESS';

export interface SyllabusReadinessSummary {
  totalSyllabusNodes: number;
  totalRootSubjects: number;

  // Semantic Partition 1: Mapped / Resolved
  mappedNodes: number;
  matchedNodes: number;
  manuallyMappedNodes: number;

  // Semantic Partition 2: Intentionally Excluded
  excludedNodes: number;
  ignoredRequirements: number;

  // Semantic Partition 3: Action Required / Unresolved
  unresolvedNodes: number;
  actionRequiredNodes: number;
  proposedMatches: number;
  ambiguousNodes: number;
  newSubjectGaps: number;
  newNodeGaps: number;
  rejectedProposals: number;
  unreviewedNodes: number;

  // Primary Percentages (exact denominator: totalSyllabusNodes)
  taxonomyCoveragePercentage: number;
  excludedPercentage: number;
  unresolvedPercentage: number;

  // Granular Percentages
  matchedPercentage: number;
  manuallyMappedPercentage: number;
  proposedPercentage: number;
  ambiguousPercentage: number;
  newSubjectGapsPercentage: number;
  newNodeGapsPercentage: number;
  ignoredPercentage: number;
  rejectedPercentage: number;
  unreviewedPercentage: number;

  // Compatibility aliases
  resolvedNodes: number;
  resolvedPercentage: number;
}

export interface SubjectReadinessSummary {
  subjectId: string;
  subjectTitle: string;
  subjectSlug: string;
  status: SubjectReadinessStatus;
  requiredNodes: number;
  mappedNodes: number;
  excludedNodes: number;
  unresolvedNodes: number;
  blockingGapCount: number;
  taxonomyCoveragePercentage: number;
  resolvedNodes: number;
  reviewNodes: number;
  gapNodes: number;
  resolvedPercentage: number;
  childSummaries?: SubjectReadinessSummary[];
}

export interface HierarchicalReadinessNode {
  syllabusNodeId: string;
  rawTitle: string;
  rawSlug: string;
  nodeDepth: number;
  displayOrder: number;
  isMandatory: boolean;
  readinessState: SyllabusReadinessState;
  mappedCanonicalNodeId: string | null;
  mappedCanonicalPath: string | null;
  confidence: number;
  matchMethod: MatchMethod | string | null;
  requiredAction: WorkQueueAction;
  priority: WorkQueuePriority;
  isBlocking: boolean;
  children: HierarchicalReadinessNode[];
}

export interface TaxonomyWorkQueueItem {
  examId: string;
  examName: string;
  examCycleId: string | null;
  syllabusVersionId: string;
  syllabusVersionTag: string;
  syllabusNodeId: string;
  syllabusTitle: string;
  syllabusSlug: string;
  syllabusPath: string;
  syllabusDepth: number;
  isMandatory: boolean;
  currentStatus: SyllabusReadinessState;
  canonicalCandidate: {
    id: string;
    name: string;
    slug: string;
    hierarchyPath: string;
    nodeDepth: number;
  } | null;
  confidence: number;
  matchMethod: MatchMethod | string | null;
  requiredAction: WorkQueueAction;
  priority: WorkQueuePriority;
  isBlocking: boolean;
  reviewedBy: string | null;
  reviewedAt: string | null;
  ageMs: number;
  ageString: string;
}

export interface ReconciliationHealth {
  lastReconciliationAt: string | null;
  syllabusVersionHash: string;
  canonicalTaxonomyLatestUpdatedAt: string | null;
  relevantCanonicalNodeCount: number;
  totalMappings: number;
  unresolvedNodes: number;
  isStale: boolean;
  reconciliationStatus: 'FRESH' | 'RECONCILIATION_STALE' | 'NOT_RECONCILED';
  recommendReconciliation: boolean;
  staleReason?: string | null;
}

export interface SyllabusReadinessReport {
  examId: string;
  examName: string;
  examCycleId: string | null;
  syllabusVersionId: string;
  versionTag: string;
  generatedAt: string;
  summary: SyllabusReadinessSummary;
  subjects: SubjectReadinessSummary[];
  tree: HierarchicalReadinessNode[];
  workQueue: TaxonomyWorkQueueItem[];
  health: ReconciliationHealth;
}

export interface SyllabusStructuralDeltaReport {
  versionAId: string;
  versionATag: string;
  versionBId: string;
  versionBTag: string;
  generatedAt: string;
  deltas: SyllabusDeltaItem[];
  summary: {
    added: number;
    removed: number;
    unchanged: number;
    depthExpanded: number;
    depthReduced: number;
    possibleRenamed: number;
  };
}


