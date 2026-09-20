/**
 * COURAGE LIBRARY — CURRICULUM AI CONTEXT TYPES
 * Phase 3E.2: Curriculum-Aware AI Context Builder & First Production Provider
 * 
 * Defines authoritative domain contracts for:
 * 1. Strongly typed CurriculumAIContext
 * 2. Academic hierarchy & exam projection metadata
 * 3. Bounded topic relationship structures
 * 4. Question Bank & Approved Content reference boundaries
 * 5. Admin generation directive contracts & validation constraints
 */

import { ContentLanguage, DifficultyTier, DocumentType } from './learning-compiler';
import { RequiredDepth, RelationshipType, RelationshipStrength, LearningUnitType } from './learning-taxonomy';

/**
 * Admin-configurable directives for AI generation
 */
export interface AdminGenerationDirectives {
  focusKeywords?: string[];
  includeFormulas?: boolean;
  includeWorkedExamples?: boolean;
  includeTraps?: boolean;
  quickCheckCount?: number;
  customInstructions?: string;
  targetExamId?: string;
  preferredLanguage?: ContentLanguage;
  targetDifficultyTier?: DifficultyTier;
}

/**
 * Resolved Exam-Specific Projection
 */
export interface ExamContextProjection {
  examId: string;
  examName: string;
  requiredDepth: RequiredDepth;
  importanceTier: string;
  isMandatory: boolean;
  weightagePct?: number | null;
  sequenceOrder?: number;
}

/**
 * Bounded Topic Relationship Context
 */
export interface BoundedTopicRelationship {
  topicId: string;
  topicName: string;
  relationshipType: RelationshipType;
  strength: RelationshipStrength;
  notes?: string | null;
}

/**
 * Canonical Question Bank Reference for AI Context
 */
export interface CanonicalQuestionReferenceContext {
  questionVersionId: string;
  questionId: string;
  questionTextSnippet: string;
  difficultyTier: DifficultyTier;
  examContext?: string;
  pyqYear?: number;
  relevanceRationale?: string;
}

/**
 * Approved Learning Reference Context (Strictly Approved/Published Only)
 */
export interface ApprovedLearningReferenceContext {
  documentId: string;
  versionId: string;
  documentType: DocumentType;
  title: string;
  summaryKeyTakeaways: string[];
}

/**
 * Authoritative Curriculum Context Model
 */
export interface CurriculumAIContext {
  learningUnit: {
    id: string;
    title: string;
    slug: string;
    unitType: LearningUnitType | DocumentType;
    estimatedMinutes: number;
  };
  taxonomy: {
    subjectId: string;
    subjectName: string;
    subjectSlug: string;
    topicId: string;
    topicName: string;
    topicSlug: string;
    subtopicId?: string | null;
    subtopicName?: string | null;
    subtopicSlug?: string | null;
    canonicalPath: string; // "Subject > Topic > Subtopic"
  };
  examContext: ExamContextProjection[];
  selectedExamProjection?: ExamContextProjection;
  requiredDepth: RequiredDepth;
  relationships: {
    prerequisites: BoundedTopicRelationship[];
    relatedTopics: BoundedTopicRelationship[];
    advancedApplications: BoundedTopicRelationship[];
    corequisites: BoundedTopicRelationship[];
  };
  questionReferences: CanonicalQuestionReferenceContext[];
  existingLearningReferences: ApprovedLearningReferenceContext[];
  language: {
    canonicalLanguage: ContentLanguage;
    requestedLanguage: ContentLanguage;
  };
  generationDirectives: AdminGenerationDirectives;
  contextHash: string; // Deterministic SHA-256
  totalCharacterCount: number;
}
