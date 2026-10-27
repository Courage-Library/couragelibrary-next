/** GAP2-4 canonical syllabus — shapes shared by the admin editor, server actions and the student read model. */

export type SyllabusNodeKind = "PAPER" | "SECTION" | "UNIT";
export type SyllabusWeightageTier = "HIGH_YIELD" | "CORE" | "MODERATE" | "LOW" | "OPTIONAL";
export type SyllabusVersionStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
export type SyllabusSourceKind = "MANUAL" | "EXAM_KNOWLEDGE_DRAFT" | "LEGACY_MIGRATION" | "IMPORT";

export const WEIGHTAGE_TIER_LABEL: Record<SyllabusWeightageTier, string> = {
  HIGH_YIELD: "High yield",
  CORE: "Core",
  MODERATE: "Moderate",
  LOW: "Low",
  OPTIONAL: "Optional",
};

/** Partial node payload for fn_syllabus_upsert_node (omitted keys are unchanged on update). */
export interface SyllabusNodeInput {
  id?: string;
  parent_id?: string | null;
  kind?: SyllabusNodeKind;
  title?: string;
  description?: string | null;
  display_order?: number | null;
  weightage_tier?: SyllabusWeightageTier | null;
  expected_questions_min?: number | null;
  expected_questions_max?: number | null;
  is_mandatory?: boolean;
}

export interface SyllabusIssue {
  code: string;
  node_id: string | null;
  topic_id: string | null;
  message: string;
}

export interface SyllabusValidationReport {
  version_id: string;
  status: SyllabusVersionStatus;
  ok: boolean;
  error_count: number;
  warning_count: number;
  errors: SyllabusIssue[];
  warnings: SyllabusIssue[];
  counts: { nodes: number; papers: number; sections: number; units: number; mappings: number; topics: number };
}

/** Admin editor view of a version (read through the admin / staff RLS read policy). */
export interface SyllabusVersionRow {
  id: string;
  exam_id: string;
  exam_cycle_id: string | null;
  /** CA-2: exam tier / stage; null = the exam's only or all tiers */
  tier: string | null;
  version_number: number;
  version_tag: string;
  status: SyllabusVersionStatus;
  source_kind: SyllabusSourceKind;
  is_active: boolean;
  created_at: string;
  published_at: string | null;
  archived_at: string | null;
  supersedes_version_id: string | null;
}

export interface SyllabusEditorNode {
  id: string;
  parent_id: string | null;
  kind: SyllabusNodeKind;
  title: string;
  slug: string;
  description: string | null;
  display_order: number;
  depth: number;
  weightage_tier: SyllabusWeightageTier | null;
  expected_questions_min: number | null;
  expected_questions_max: number | null;
  is_mandatory: boolean;
  mappings: Array<{ topic_id: string; weight: number | null }>;
}

export interface SyllabusTopicOption {
  id: string;
  name: string;
  slug: string;
  subject_id: string | null;
  subject_name: string | null;
}

// ---------------------------------------------------------------- student read model (fn_exam_syllabus_read_model)
export interface SyllabusReadModelTopic {
  topic_id: string;
  name: string;
  slug: string;
  subject_id: string | null;
  weight: number | null;
  published_questions: number;
  servable_documents: number;
}

export interface SyllabusReadModelNode {
  id: string;
  parent_id: string | null;
  kind: SyllabusNodeKind;
  title: string;
  slug: string;
  description: string | null;
  order: number;
  depth: number;
  weightage_tier: SyllabusWeightageTier | null;
  expected_questions_min: number | null;
  expected_questions_max: number | null;
  is_mandatory: boolean;
  topics: SyllabusReadModelTopic[];
  counts: { topics: number; published_questions: number; servable_documents: number; topics_with_questions: number; topics_with_documents: number };
}

export type SyllabusReadModel =
  | { state: "NO_SYLLABUS"; exam_id: string; version: null; nodes: []; totals: null }
  | {
      state: "AVAILABLE";
      exam_id: string;
      version: { id: string; version_number: number; version_tag: string; exam_cycle_id: string | null; published_at: string };
      nodes: SyllabusReadModelNode[];
      totals: { nodes: number; topics: number; published_questions: number; servable_documents: number };
    }
  | { state: "UNAVAILABLE"; exam_id: string; version: null; nodes: []; totals: null };
