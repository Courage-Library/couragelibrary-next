/**
 * COURAGE LIBRARY — LEARNING / COURSES DOMAIN TAXONOMY TYPES
 * Phase 3A: Academic Taxonomy & Exam Syllabus Foundation
 * 
 * Strict Invariants:
 * - Structural Identity & Metadata Only
 * - Zero Content Bodies (Markdown / MDX / HTML)
 * - Canonical Knowledge Graph & Reusable Nodes
 */

export type RelationshipType = 
  | 'PREREQUISITE' 
  | 'RELATED' 
  | 'ADVANCED_APPLICATION' 
  | 'COREQUISITE';

export type RelationshipStrength = 
  | 'CRITICAL' 
  | 'STRONG' 
  | 'RECOMMENDED' 
  | 'OPTIONAL';

export type LearningUnitType = 
  | 'CONCEPT_LESSON'
  | 'WORKED_EXAMPLES'
  | 'FORMULA_SHORTCUT_SHEET'
  | 'COMMON_TRAPS_AND_MISTAKES'
  | 'PYQ_DEEP_DIVE'
  | 'TOPIC_SUMMARY_REVISION';

export type RequiredDepth = 
  | 'FOUNDATIONAL_ONLY'
  | 'INTERMEDIATE_APPLICATION'
  | 'ADVANCED_COMPETITIVE';

export type ImportanceTier = 
  | 'CORE'
  | 'VERY_HIGH'
  | 'HIGH'
  | 'MEDIUM'
  | 'LOW'
  | 'OPTIONAL';

export interface CanonicalSubject {
  id: string;
  name: string;
  slug: string;
  code?: string | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
}

export interface CanonicalTopic {
  id: string;
  subject_id: string;
  name: string;
  slug: string;
  default_importance: ImportanceTier | string;
  display_order: number;
  is_active: boolean;
  created_at: string;
  subject?: CanonicalSubject;
}

export interface CanonicalSubtopic {
  id: string;
  topic_id: string;
  name: string;
  slug: string;
  display_order: number;
  is_active: boolean;
  created_at: string;
}

export interface TopicRelationship {
  id: string;
  from_topic_id: string;
  to_topic_id: string;
  relationship_type: RelationshipType;
  strength: RelationshipStrength;
  notes?: string | null;
  is_active: boolean;
  created_at: string;
  from_topic?: CanonicalTopic;
  to_topic?: CanonicalTopic;
}

export interface LearningUnit {
  id: string;
  topic_id: string;
  subtopic_id?: string | null;
  title: string;
  slug: string;
  unit_type: LearningUnitType;
  estimated_minutes: number;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  topic?: CanonicalTopic;
  subtopic?: CanonicalSubtopic;
}

export interface ExamSyllabusSubject {
  id: string;
  exam_id: string;
  subject_id: string;
  weightage_pct?: number | null;
  expected_questions_count?: number | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
  subject?: CanonicalSubject;
}

export interface ExamTopicMapping {
  id: string;
  exam_id: string;
  subject_id: string;
  topic_id: string;
  importance_tier: ImportanceTier | string;
  required_depth: RequiredDepth;
  is_mandatory: boolean;
  weightage_override?: number | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
  topic?: CanonicalTopic;
}

export interface ExamUnitMapping {
  id: string;
  exam_topic_id: string;
  learning_unit_id: string;
  sequence_order: number;
  is_exam_core: boolean;
  is_active: boolean;
  created_at: string;
  learning_unit?: LearningUnit;
}

export interface TopicHierarchy {
  topic: CanonicalTopic;
  subtopics: CanonicalSubtopic[];
  learning_units: LearningUnit[];
  prerequisites: CanonicalTopic[];
  related_topics: CanonicalTopic[];
  advanced_applications: CanonicalTopic[];
}

export interface ExamSyllabusOverview {
  exam_id: string;
  total_subjects: number;
  total_topics: number;
  total_learning_units: number;
  estimated_total_minutes: number;
  subjects: {
    syllabus: ExamSyllabusSubject;
    topics: {
      mapping: ExamTopicMapping;
      units: ExamUnitMapping[];
    }[];
  }[];
}
