/**
 * COURAGE LIBRARY — EXAM KNOWLEDGE DOMAIN TYPES
 * Phase 3H.1: Core Data Model & Schema Foundation
 * 
 * Defines domain entities, enums, document specs, and review states
 * for the centralized Exam Knowledge System.
 */

export type ExamModuleKey =
  | 'EXAM_OVERVIEW'
  | 'IMPORTANT_DATES'
  | 'ELIGIBILITY'
  | 'AGE_LIMIT'
  | 'QUALIFICATION'
  | 'PHYSICAL_STANDARDS'
  | 'APPLICATION_PROCESS'
  | 'SELECTION_PROCESS'
  | 'EXAM_PATTERN'
  | 'SYLLABUS'
  | 'SYLLABUS_OVERVIEW'
  | 'POSTS'
  | 'SALARY'
  | 'POST_PREFERENCE_SALARY'
  | 'CAREER'
  | 'VACANCIES'
  | 'CUTOFF'
  | 'CUTOFF_TRENDS'
  | 'ADMIT_CARD'
  | 'RESULT'
  | 'PREPARATION'
  | 'PREPARATION_STRATEGY'
  | 'FAQ'
  | 'NOTIFICATIONS';

export type ExamSourceType =
  | 'OFFICIAL_NOTIFICATION'
  | 'OFFICIAL_WEBSITE'
  | 'OFFICIAL_CORRIGENDUM'
  | 'GAZETTE_ORDER'
  | 'GOVERNMENT_CIRCULAR'
  | 'AUTHENTICATED_ANALYSIS'
  | 'OTHER_AUTHORITY';

export type ExamSourceVerificationStatus =
  | 'UNVERIFIED'
  | 'SOURCE_VERIFIED'
  | 'FLAGGED_OUTDATED'
  | 'REJECTED'
  | 'SUPERSEDED';

export type ExamKnowledgeDocumentStatus =
  | 'DRAFT'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'PUBLISHED'
  | 'ARCHIVED';

export type ExamDocReviewStatus =
  | 'DRAFT'
  | 'AI_GENERATED'
  | 'STRUCTURALLY_VALID'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'PUBLISHED'
  | 'REJECTED'
  | 'SUPERSEDED';

/**
 * Authoritative Section Types allowed in Exam Knowledge contentSections
 */
export type ExamKnowledgeSectionType =
  | 'SUMMARY'
  | 'DETAILED_GUIDE'
  | 'IMPORTANT_INSTRUCTIONS'
  | 'FAQS';

export const EXAM_KNOWLEDGE_SECTION_TYPES: readonly ExamKnowledgeSectionType[] = [
  'SUMMARY',
  'DETAILED_GUIDE',
  'IMPORTANT_INSTRUCTIONS',
  'FAQS',
] as const;

export type ExamAuthorType = 'HUMAN' | 'AI_ASSISTED' | 'EXTERNAL_IMPORT';

export type ExamClaimVerificationStatus =
  | 'UNVERIFIED'
  | 'VERIFIED'
  | 'FLAGGED_OUTDATED'
  | 'REJECTED';

export type ExamClaimDataType =
  | 'STRING'
  | 'INTEGER'
  | 'NUMERIC'
  | 'DATE'
  | 'BOOLEAN'
  | 'JSON';

export interface ExamPost {
  id: string;
  exam_id: string;
  post_name: string;
  post_code?: string | null;
  department?: string | null;
  ministry?: string | null;
  classification_group?: string | null;
  is_gazetted: boolean;
  pay_level: number;
  grade_pay?: number | null;
  cpc_basic_pay_min?: number | null;
  cpc_basic_pay_max?: number | null;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface ExamSource {
  id: string;
  exam_id: string;
  exam_cycle_id?: string | null;
  source_type: ExamSourceType;
  title: string;
  issuing_authority: string;
  source_url: string;
  published_date?: string | null;
  effective_date?: string | null;
  verification_status: ExamSourceVerificationStatus;
  verified_by_user_id?: string | null;
  verified_at?: string | null;
  notes?: string | null;
  document_checksum?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExamKnowledgeDocument {
  id: string;
  exam_id: string;
  exam_cycle_id?: string | null;
  module_key: ExamModuleKey;
  canonical_slug: string;
  current_published_version_id?: string | null;
  status: ExamKnowledgeDocumentStatus;
  language: string;
  created_at: string;
  updated_at: string;
}

export interface ExamDocVersion {
  id: string;
  document_id: string;
  version_number: number;
  schema_version: string;
  author_type: ExamAuthorType;
  review_status: ExamDocReviewStatus;
  source_spec_storage_key?: string | null;
  source_spec_hash?: string | null;
  compiled_artifact_storage_key?: string | null;
  compiled_artifact_hash?: string | null;
  structured_payload: Record<string, any>;
  compiled_mdx?: string | null;
  is_published: boolean;
  approved_by_user_id?: string | null;
  reviewed_at?: string | null;
  review_feedback?: string | null;
  published_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExamClaim {
  id: string;
  exam_id: string;
  exam_cycle_id?: string | null;
  doc_version_id?: string | null;
  claim_key: string;
  stated_value: string;
  value_data_type: ExamClaimDataType;
  effective_start_date?: string | null;
  effective_end_date?: string | null;
  verification_status: ExamClaimVerificationStatus;
  created_at: string;
  updated_at: string;
}

export interface ExamClaimSource {
  claim_id: string;
  source_id: string;
  page_or_clause_reference?: string | null;
  created_at: string;
}

/**
 * Structured specification payload for external AI authoring and import
 */
export interface ExamKnowledgeDocumentSpec {
  schemaVersion: '1.0.0';
  documentId: string;
  examSlug: string;
  cycleYear?: number;
  moduleKey: ExamModuleKey;
  language: string;
  metadata: {
    title: string;
    description: string;
    lastVerifiedDate: string;
    targetExamCategory: string;
    authoritativeKeywords: string[];
  };
  structuredData: {
    dates?: Array<{ eventKey: string; label: string; dateValue: string; isTentative: boolean }>;
    parameters?: Record<string, string | number | boolean>;
    tables?: Array<{ tableId: string; title: string; headers: string[]; rows: string[][] }>;
    claims?: Array<{
      claimKey: string;
      statedValue: string;
      sourceCitation: string;
      sourceUrl?: string;
    }>;
  };
  contentSections: Array<{
    id: string;
    heading: string;
    sectionType: ExamKnowledgeSectionType;
    bodyMarkdown: string;
    calloutNotes?: Array<{ variant: 'INFO' | 'WARNING' | 'CRITICAL'; title: string; body: string }>;
  }>;
  faqs?: Array<{ question: string; answer: string }>;
  officialSources: Array<{
    sourceType: ExamSourceType;
    title: string;
    url: string;
    issuingAuthority: string;
    publishedDate?: string;
  }>;
  seo: {
    metaTitle: string;
    metaDescription: string;
    focusKeywords: string[];
    canonicalUrlSlug: string;
  };
}

/**
 * Version of the Authoritative Exam Knowledge Prompt Contract
 */
export const EXAM_PROMPT_CONTRACT_VERSION = 'CL-EXAM-AUTHOR-v1.0';

/**
 * Module applicability lifecycle states
 */
export type ModuleApplicabilityStatus =
  | 'APPLICABLE'
  | 'NOT_APPLICABLE'
  | 'REQUIRES_CYCLE'
  | 'REQUIRES_SOURCE'
  | 'INSUFFICIENT_CONTEXT';

export interface ModuleApplicabilityReport {
  status: ModuleApplicabilityStatus;
  reason: string;
  isApplicable: boolean;
  warnings: string[];
}

export interface ExamModuleDefinition {
  key: ExamModuleKey;
  displayName: string;
  purpose: string;
  isCycleSpecific: boolean;
  requiresSources: boolean;
  allowedSectionTypes: ExamKnowledgeSectionType[];
  requiredClaimTypes: string[];
  freshnessRule: string;
  outputGuidance: string;
}

export interface ExamKnowledgeTarget {
  examId: string;
  examSlug: string;
  examName: string;
  examCycleId?: string | null;
  cycleLabel?: string | null;
  cycleYear?: number | null;
  moduleKey: ExamModuleKey;
  language: string;
  promptContractVersion: string;
}

export interface AuthoritativeExamContext {
  target: ExamKnowledgeTarget;
  exam: {
    id: string;
    title: string;
    slug: string;
    category: string;
    description: string | null;
    conductingOrgName: string;
    officialWebsite: string | null;
    isActive: boolean;
  };
  cycle?: {
    id: string;
    cycleYear: number;
    cycleLabel: string;
    notificationDate?: string | null;
    applicationStartDate?: string | null;
    applicationEndDate?: string | null;
    examStartDate?: string | null;
    examEndDate?: string | null;
    totalVacancies?: number | null;
    status: string;
  } | null;
  module: ExamModuleDefinition;
  applicability: ModuleApplicabilityReport;
  structuredFacts: {
    patterns: Array<{
      id: string;
      name: string;
      tierName?: string | null;
      durationMinutes: number;
      totalQuestions: number;
      totalMarks: number;
      negativeMarkValue: number;
    }>;
    posts: Array<{
      id: string;
      postName: string;
      postCode?: string | null;
      department?: string | null;
      classificationGroup?: string | null;
      payLevel: number;
      gradePay?: number | null;
      isGazetted: boolean;
    }>;
    dates: Array<{
      eventKey: string;
      label: string;
      dateValue: string;
      isTentative: boolean;
    }>;
    vacancies: Array<{
      category: string;
      postName?: string | null;
      count: number;
    }>;
    parameters: Record<string, string | number | boolean>;
  };
  canonicalCurriculum: {
    subjects: Array<{
      id: string;
      name: string;
      slug: string;
      topicsCount: number;
    }>;
    topics: Array<{
      id: string;
      name: string;
      subjectName: string;
      depth?: string;
      weightage?: number;
    }>;
    subtopicsCount: number;
    totalLearningUnits: number;
  };
  questionBankContext?: {
    totalQuestionsAvailable: number;
    subjectDistribution: Record<string, number>;
    questionReferences?: Array<{
      questionVersionId: string;
      questionId: string;
      year?: number;
      tier?: string;
      topicName: string;
    }>;
  };
  existingDocumentState?: {
    documentId?: string;
    currentVersionNumber?: number;
    reviewStatus?: string;
    isPublished: boolean;
    publishedAt?: string | null;
    authorType?: string;
    isRevision: boolean;
  };
  sourceContext: Array<{
    id: string;
    title: string;
    sourceType: ExamSourceType;
    issuingAuthority: string;
    sourceUrl: string;
    publishedDate?: string | null;
    verificationStatus: ExamSourceVerificationStatus;
    isCycleSpecific: boolean;
  }>;
  claimContext: Array<{
    id: string;
    claimKey: string;
    statedValue: string;
    dataType: ExamClaimDataType;
    verificationStatus: ExamClaimVerificationStatus;
    citations: Array<{
      sourceTitle: string;
      pageOrClause?: string | null;
    }>;
  }>;
  authoringRequirements: {
    noFabrication: boolean;
    antiHallucinationRules: string[];
    sourceEvidenceRules: string[];
    requiredOutputSchemaVersion: string;
  };
  contextHash: string;
  generatedAt: string;
}

export interface ExamPromptResult {
  promptText: string;
  promptContractVersion: string;
  schemaVersion: string;
  contextHash: string;
  target: ExamKnowledgeTarget;
  generatedAt: string;
  characterCount: number;
  includedSourcesCount: number;
  includedClaimsCount: number;
  includedTopicsCount: number;
  existingDocumentState?: {
    isRevision: boolean;
    documentId?: string;
    versionNumber?: number;
  };
  applicability: ModuleApplicabilityReport;
  warnings: string[];
}

export type ExamKnowledgeErrorCode =
  | 'INVALID_JSON'
  | 'INVALID_SCHEMA'
  | 'UNSUPPORTED_CONTRACT_VERSION'
  | 'INVALID_MODULE'
  | 'MODULE_NOT_FOUND'
  | 'EXAM_NOT_FOUND'
  | 'CYCLE_NOT_FOUND'
  | 'TARGET_MISMATCH'
  | 'STALE_CONTEXT'
  | 'CONTEXT_MISMATCH'
  | 'SECURITY_VIOLATION'
  | 'INVALID_SOURCE'
  | 'SOURCE_REVIEW_REQUIRED'
  | 'INVALID_CLAIM'
  | 'MISSING_PROVENANCE'
  | 'INVALID_QUESTION_REFERENCE'
  | 'INVALID_CURRICULUM_REFERENCE'
  | 'INVALID_POST_REFERENCE'
  | 'DUPLICATE_IMPORT'
  | 'UNAUTHORIZED'
  | 'PAYLOAD_TOO_LARGE'
  | 'CONTEXT_TOO_LARGE'
  | 'INVALID_CONTEXT'
  | 'CONTRACT_ERROR'
  | 'MODULE_NOT_APPLICABLE'
  | 'MISSING_REQUIRED_AUTHORITY'
  | 'INTERNAL_ERROR';

export class ExamKnowledgeContextError extends Error {
  public readonly code: ExamKnowledgeErrorCode;
  public readonly details?: Record<string, any>;

  constructor(code: ExamKnowledgeErrorCode, message: string, details?: Record<string, any>) {
    super(`[${code}] ${message}`);
    this.name = 'ExamKnowledgeContextError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Single Gate Validation Status
 */
export type GateValidationStatus = 'PASS' | 'WARNING' | 'FAIL';

export interface SingleGateResult {
  name: string;
  gateNumber: number;
  status: GateValidationStatus;
  errors: string[];
  warnings: string[];
}

export interface ClaimConflict {
  claimKey: string;
  verifiedValue: string;
  importedValue: string;
  status: 'CONFLICT_REQUIRES_REVIEW';
}

export interface ExamFiveGateValidationResult {
  overallOutcome: 'PASS' | 'WARNING' | 'BLOCK';
  canImportAsDraft: boolean;
  gates: {
    gate1_schema: SingleGateResult;
    gate2_target: SingleGateResult;
    gate3_security: SingleGateResult;
    gate4_provenance: SingleGateResult;
    gate5_domain: SingleGateResult;
  };
  conflicts: ClaimConflict[];
  summary: {
    totalErrors: number;
    totalWarnings: number;
    blockedGates: string[];
  };
  errors: string[];
  warnings: string[];
}

export interface ExamKnowledgeImportParams {
  rawInput: string;
  expectedTarget: ExamKnowledgeTarget;
  expectedContextHash: string;
  externalAiTool?: string;
  adminUserId?: string;
  supabaseClient?: any;
  prefetchedData?: {
    exam?: any;
    cycle?: any;
    serverCalculatedContextHash?: string;
    verifiedClaims?: any[];
    verifiedSources?: any[];
    questionsAllowlist?: string[];
    canonicalSubjects?: any[];
    canonicalTopics?: any[];
    canonicalPosts?: any[];
    existingDocument?: any;
    existingVersions?: any[];
  };
}

export interface ExamKnowledgeImportResult {
  status: 'IMPORTED' | 'DUPLICATE' | 'REJECTED';
  documentId?: string;
  versionId?: string;
  versionNumber?: number;
  reviewStatus?: ExamDocReviewStatus;
  isPublished: boolean;
  validation: ExamFiveGateValidationResult;
  errorCode?: ExamKnowledgeErrorCode;
  errorMessage?: string;
  sourceSpecHash?: string;
  importAuditId?: string;
}

/**
 * Phase 3H.5: Candidate Read Model Types
 */
export interface CandidateExamPost {
  id: string;
  postName: string;
  postCode: string | null;
  department: string | null;
  ministry: string | null;
  classificationGroup: string | null;
  isGazetted: boolean;
  payLevel: number;
  gradePay: number | null;
  cpcBasicPayMin: number | null;
  cpcBasicPayMax: number | null;
  vacanciesCount?: number | null;
}

export interface CandidateExamPatternSection {
  name: string;
  questionCount: number;
  marksPerQuestion: number;
}

export interface CandidateExamPattern {
  id: string;
  name: string;
  tierName: string | null;
  durationMinutes: number;
  totalQuestions: number;
  totalMarks: number;
  negativeMarkValue: number;
  sections: CandidateExamPatternSection[];
}

export interface CandidateExamTopic {
  id: string;
  name: string;
  slug: string;
  importanceTier: 'HIGH_YIELD' | 'CORE' | 'OPTIONAL' | string;
  requiredDepth: 'CONCEPTUAL' | 'APPLICATION' | 'ADVANCED' | string;
  expectedQuestions: { min: number; max: number };
  learningDocumentSlug: string | null;
  pyqCount: number;
  practiceAvailable: boolean;
}

export interface CandidateExamSubject {
  id: string;
  name: string;
  slug: string;
  code: string;
  totalWeightagePercent: number | null;
  topics: CandidateExamTopic[];
}

export interface CandidatePublishedModule {
  documentId: string;
  versionId: string;
  moduleKey: ExamModuleKey;
  displayName: string;
  title: string;
  description: string;
  compiledMdx: string | null;
  faqs: Array<{ question: string; answer: string }>;
  officialSources: Array<{
    title: string;
    issuingAuthority: string;
    sourceUrl: string;
    publishedDate: string | null;
    sourceType: string;
  }>;
  lastVerifiedDate: string | null;
  publishedAt: string;
}

export interface CandidateOfficialSource {
  id: string;
  title: string;
  sourceType: string;
  issuingAuthority: string;
  sourceUrl: string;
  publishedDate: string | null;
}

export interface CandidateVerifiedClaim {
  claimKey: string;
  statedValue: string;
  dataType: string;
  citations: Array<{ sourceTitle: string; pageOrClause?: string }>;
}

export interface ExamKnowledgeCandidateView {
  exam: {
    id: string;
    slug: string;
    title: string;
    category: string;
    conductingOrg: {
      id: string;
      name: string;
      shortName: string;
      websiteUrl: string;
    };
    description: string | null;
    officialWebsite: string | null;
  };
  activeCycle: {
    id: string;
    cycleYear: number;
    cycleLabel: string;
    status: 'UPCOMING' | 'ACTIVE' | 'COMPLETED' | 'ARCHIVED' | string;
    notificationDate: string | null;
    applicationStartDate: string | null;
    applicationEndDate: string | null;
    examStartDate: string | null;
    examEndDate: string | null;
    totalVacancies: number | null;
    isTentative: boolean;
  } | null;
  availableCycles: Array<{
    id: string;
    cycleYear: number;
    cycleLabel: string;
    status: string;
  }>;
  structuredFacts: {
    posts: CandidateExamPost[];
    patterns: CandidateExamPattern[];
    eligibilityParameters: {
      minAge?: number | null;
      maxAge?: number | null;
      educationMin?: string | null;
      nationality?: string | null;
      ageRelaxations?: Array<{ category: string; relaxationYears: number }>;
    };
    verifiedClaims: CandidateVerifiedClaim[];
  };
  curriculum: {
    subjects: CandidateExamSubject[];
  };
  publishedModules: Partial<Record<ExamModuleKey, CandidatePublishedModule | null>>;
  officialSources: CandidateOfficialSource[];
  availableModuleKeys: ExamModuleKey[];
  metadata: {
    generatedAt: string;
    hasActiveCycle: boolean;
    activeCycleYear: number | null;
    totalPublishedModulesCount: number;
    overallFreshnessStatus: 'VERIFIED_CURRENT' | 'HISTORICAL_ONLY' | 'CYCLE_PENDING';
  };
}

export interface ExamKnowledgeCandidateQueryParams {
  examSlug: string;
  cycleYear?: number;
  language?: string;
  supabaseClient?: any;
  prefetchedData?: any;
}

export interface ExamKnowledgeCandidateResult {
  status: 'FOUND' | 'NOT_FOUND' | 'INACTIVE';
  data?: ExamKnowledgeCandidateView;
  errorMessage?: string;
}

export interface CandidateExamDirectoryItem {
  id: string;
  slug: string;
  title: string;
  category: string;
  conductingOrg: {
    id: string;
    name: string;
    shortName: string;
  };
  description: string | null;
  latestCycleYear: number | null;
  publishedModulesCount: number;
}




