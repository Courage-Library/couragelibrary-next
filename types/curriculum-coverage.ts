/**
 * COURAGE LIBRARY — CURRICULUM COVERAGE TYPES
 * Phase 3F.2: Curriculum Coverage, Authoring Scale & Content Operations
 */

import { DocumentType, ReviewStatus } from '@/types/learning-compiler';

export const CANONICAL_DOCUMENT_TYPES: DocumentType[] = [
  'CONCEPT_LESSON',
  'WORKED_EXAMPLES',
  'FORMULA_SHORTCUT_SHEET',
  'COMMON_TRAPS_AND_MISTAKES',
  'PYQ_DEEP_DIVE',
  'TOPIC_SUMMARY_REVISION',
];

export type CoverageSlotStatus =
  | 'NOT_CREATED'
  | 'DRAFT'
  | 'AI_GENERATED'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'COMPILED'
  | 'PUBLISHED'
  | 'STALE';

export interface DocumentSlotDetail {
  status: CoverageSlotStatus;
  documentId: string | null;
  canonicalSlug: string | null;
  versionId: string | null;
  versionNumber: number | null;
  authorType?: string | null;
  reviewStatus?: ReviewStatus | null;
  isPublished: boolean;
  updatedAt?: string | null;
}

export interface UnitCoverage {
  unitId: string;
  unitTitle: string;
  unitSlug: string;
  topicId: string;
  topicName: string;
  subjectId: string;
  subjectName: string;
  documentTypes: Record<DocumentType, DocumentSlotDetail>;
  mappedExams: Array<{
    examId: string;
    examTitle: string;
    requiredDepth?: string;
    importanceTier?: string;
    isMandatory?: boolean;
  }>;
  linkedQuestionCount: number;
  publishedDocCount: number;
  totalDocCount: number;
  isFullyPublished: boolean;
  hasAnyPublished: boolean;
}

export interface TopicCoverage {
  topicId: string;
  topicName: string;
  topicSlug: string;
  subjectId: string;
  totalUnits: number;
  publishedUnits: number;
  totalDocSlots: number;
  publishedDocSlots: number;
  coveragePct: number;
  linkedQuestionCount: number;
  units: UnitCoverage[];
}

export interface SubjectCoverage {
  subjectId: string;
  subjectName: string;
  subjectSlug: string;
  totalUnits: number;
  publishedUnits: number;
  totalDocSlots: number;
  publishedDocSlots: number;
  coveragePct: number;
  linkedQuestionCount: number;
  topics: TopicCoverage[];
}

export interface CurriculumCoverageMatrix {
  overall: {
    totalSubjects: number;
    totalTopics: number;
    totalUnits: number;
    totalDocSlots: number;
    publishedDocSlots: number;
    draftDocSlots: number;
    aiGeneratedDocSlots: number;
    inReviewDocSlots: number;
    approvedDocSlots: number;
    compiledDocSlots: number;
    notCreatedDocSlots: number;
    overallCoveragePct: number;
    totalLinkedQuestions: number;
  };
  byDocumentType: Record<
    DocumentType,
    {
      totalSlots: number;
      publishedSlots: number;
      draftSlots: number;
      aiGeneratedSlots: number;
      inReviewSlots: number;
      approvedSlots: number;
      compiledSlots: number;
      notCreatedSlots: number;
      coveragePct: number;
    }
  >;
  subjects: SubjectCoverage[];
  exams: Array<{ id: string; title: string; slug: string }>;
}

export interface CurriculumQualityMetrics {
  totalLearningUnits: number;
  mappedLearningUnits: number;
  unmappedLearningUnits: number;
  topicsWithQuestions: number;
  topicsWithoutQuestions: number;
  totalQuestions: number;
  documentStatusDistribution: Record<CoverageSlotStatus, number>;
  documentTypeReadiness: Record<
    DocumentType,
    {
      total: number;
      published: number;
      percentage: number;
    }
  >;
  examReadiness: Array<{
    examId: string;
    examTitle: string;
    totalUnits: number;
    publishedUnits: number;
    readinessPct: number;
  }>;
}
