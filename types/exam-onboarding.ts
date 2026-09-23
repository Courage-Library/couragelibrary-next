/**
 * COURAGE LIBRARY — EXAM ONBOARDING & AI-ASSISTED DOMAIN TYPES
 * Phase 3K: AI-Assisted Exam Onboarding & Master Prompt Ingestion Architecture
 */

import { ExamReadinessReport } from '@/services/exam-onboarding/exam-readiness.service';

export const ONBOARDING_PROMPT_CONTRACT_VERSION = 'CL-EXAM-ONBOARDING-v1.0';

export type OnboardingSourceType =
  | 'OFFICIAL_NOTIFICATION'
  | 'OFFICIAL_WEBSITE'
  | 'OFFICIAL_CORRIGENDUM'
  | 'GAZETTE_ORDER'
  | 'GOVERNMENT_CIRCULAR'
  | 'AUTHENTICATED_ANALYSIS'
  | 'OTHER_AUTHORITY';

export type OnboardingFieldStatus =
  | 'UNKNOWN'
  | 'NOT_FOUND'
  | 'NOT_APPLICABLE'
  | 'CONFLICTING'
  | 'UNVERIFIED';

/**
 * Canonical Structured Specification for AI-Assisted Onboarding
 */
export interface ExamOnboardingSpec {
  schema_version: 'CL-EXAM-ONBOARDING-v1.0';
  prompt_version?: string;
  context_hash?: string;
  generated_at?: string;
  target_exam_name: string;
  target_cycle_year?: number;

  exam: {
    title: string;
    short_name?: string;
    slug?: string;
    category?: string;
    description?: string;
    official_website?: string;
    portal_url?: string;
  };

  organization: {
    name: string;
    short_name?: string;
    slug?: string;
    official_website?: string;
    org_type?: string;
  };

  cycle?: {
    cycle_year: number;
    cycle_name?: string;
    notification_date?: string | null;
    application_start_date?: string | null;
    application_end_date?: string | null;
    correction_window_end_date?: string | null;
    admit_card_date?: string | null;
    exam_start_date?: string | null;
    exam_end_date?: string | null;
    result_date?: string | null;
    status?: 'upcoming' | 'ongoing' | 'completed';
  } | null;

  posts?: Array<{
    post_name: string;
    post_code?: string;
    department?: string;
    ministry?: string;
    classification_group?: string;
    is_gazetted?: boolean;
    pay_level?: number | null;
    grade_pay?: number | null;
    cpc_basic_pay_min?: number | null;
    cpc_basic_pay_max?: number | null;
    pay_scale_description?: string;
    vacancies_count?: number | null;
    age_min?: number | null;
    age_max?: number | null;
    qualification_summary?: string;
  }>;

  eligibility?: {
    nationality?: string[];
    age_min?: number | null;
    age_max?: number | null;
    age_reference_date?: string | null;
    age_relaxations?: Array<{ category: string; relaxation_years: number; notes?: string }>;
    educational_qualifications?: Array<{ degree: string; stream?: string; min_percentage?: number; mandatory: boolean }>;
    experience_requirements?: string;
    physical_standards?: Record<string, any>;
  };

  selection_process?: {
    stages: Array<{
      stage_number: number;
      stage_name: string;
      stage_type: string;
      is_qualifying: boolean;
      counts_for_merit: boolean;
    }>;
    interview_marks?: number | null;
    total_merit_marks?: number | null;
    normalization_applied?: boolean;
  };

  exam_pattern?: {
    tiers_or_stages: Array<{
      stage_name: string;
      mode?: string;
      duration_minutes?: number;
      total_questions?: number;
      total_marks?: number;
      negative_marking_per_question?: number;
      sectional_timing_minutes?: number;
      sections?: Array<{
        section_name: string;
        subject_name?: string;
        questions_count?: number;
        marks_count?: number;
        negative_marks?: number;
        timing_minutes?: number;
      }>;
    }>;
  };

  syllabus?: {
    subjects: Array<{
      subject_name: string;
      display_order?: number;
      topics: Array<{
        topic_name: string;
        subtopics?: string[];
        weightage_level?: 'high' | 'medium' | 'low';
        priority?: number;
        expected_questions?: number;
        is_new_canonical_candidate?: boolean;
      }>;
    }>;
  };

  knowledge_modules?: Array<{
    module_key: string;
    title: string;
    summary_markdown: string;
    detailed_markdown: string;
    key_points?: string[];
    faqs?: Array<{ question: string; answer: string }>;
  }>;

  sources?: Array<{
    source_type: OnboardingSourceType | string;
    title: string;
    url: string;
    issuing_authority: string;
    published_date?: string | null;
    is_official: boolean;
    claims_supported?: string[];
  }>;

  claims?: Array<{
    claim_key: string;
    stated_value: string;
    data_type?: 'STRING' | 'INTEGER' | 'NUMERIC' | 'DATE' | 'BOOLEAN' | 'JSON';
    source_url?: string;
    page_or_clause?: string;
    verification_status?: 'UNVERIFIED' | 'VERIFIED' | 'CONFLICTING';
  }>;

  seo?: {
    meta_title?: string;
    meta_description?: string;
    focus_keywords?: string[];
    canonical_slug?: string;
  };

  validation_notes?: string[];
  unresolved_items?: Array<{
    field: string;
    status: OnboardingFieldStatus;
    reason: string;
  }>;
}

/**
 * Onboarding Context Snapshot
 */
export interface OnboardingContextSnapshot {
  targetExamName: string;
  examId?: string;
  examSlug?: string;
  category?: string;
  description?: string;
  conductingOrgName?: string;
  conductingOrgSlug?: string;
  officialWebsite?: string;
  cycleYear?: number;
  cycleName?: string;
  notificationDate?: string;
  applicationStartDate?: string;
  applicationEndDate?: string;
  existingPostsCount: number;
  existingPosts: Array<{
    postName: string;
    payLevel?: number | null;
    classificationGroup?: string | null;
  }>;
  availableCanonicalSubjects: Array<{
    id: string;
    name: string;
    slug: string;
    topics: Array<{ id: string; name: string; slug: string }>;
  }>;
  registeredKnowledgeModules: Array<{
    key: string;
    displayName: string;
    purpose: string;
    isCycleSpecific: boolean;
    requiresSources: boolean;
  }>;
  contextHash: string;
  generatedAt: string;
}

/**
 * Validation Issue & Outcome
 */
export interface OnboardingValidationIssue {
  gate: 'SYNTAX' | 'TARGET' | 'SECURITY' | 'PROVENANCE' | 'CANONICAL' | 'CONFLICT';
  severity: 'BLOCKING' | 'WARNING';
  field?: string;
  message: string;
}

export interface OnboardingConflictItem {
  field: string;
  label: string;
  existingValue: any;
  importedValue: any;
  sourceCitation?: string;
  cycleYear?: number;
  status: 'CONFLICT';
}

export interface ExamOnboardingValidationResult {
  isValid: boolean;
  canImportAsDraft: boolean;
  spec?: ExamOnboardingSpec;
  issues: OnboardingValidationIssue[];
  blockingIssuesCount: number;
  warningsCount: number;
  conflicts: OnboardingConflictItem[];
}

/**
 * Import Preview & Diff Summary
 */
export interface ExamOnboardingImportPreview {
  validationResult: ExamOnboardingValidationResult;
  diffSummary: {
    organization: { status: 'NEW' | 'MATCHED'; name: string; slug: string; id?: string };
    exam: { status: 'NEW' | 'MATCHED'; title: string; slug: string; id?: string };
    cycle: { status: 'NEW' | 'MATCHED' | 'SKIPPED'; cycleYear?: number; id?: string };
    posts: Array<{ status: 'NEW' | 'MATCHED'; postName: string; payLevel?: number | null }>;
    syllabus: Array<{
      subjectName: string;
      isMatched: boolean;
      topics: Array<{ topicName: string; isMatched: boolean; canonicalTopicId?: string; isNewCandidate: boolean }>;
    }>;
    knowledgeModules: Array<{ moduleKey: string; title: string; status: 'NEW' | 'UPDATE' }>;
    sourcesCount: number;
    claimsCount: number;
    unresolvedCount: number;
  };
  contextHash: string;
}

/**
 * Import Commit Outcome
 */
export interface ExamOnboardingImportCommitResult {
  success: boolean;
  examId: string;
  examSlug: string;
  examTitle: string;
  cycleId?: string | null;
  readinessReport: ExamReadinessReport;
  importedEntities: {
    organizationId: string;
    postsCount: number;
    syllabusTopicsMapped: number;
    knowledgeDocsCreated: number;
    sourcesCount: number;
    claimsCount: number;
  };
}
