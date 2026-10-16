/**
 * GAP2-4b (TYPES-1 B5): narrow generated database rows to the phase-3R reconciliation domain types.
 * The database stores the enum-like columns as text and JSON as Json; these mappers are the single place where the
 * workbench's typed reads become its domain shapes (no `any` on the query path). The workbench itself is fail-closed
 * for writes and is retired in GAP2-4c.
 */
import type { Database } from "@/types/database";
import type {
  CanonicalCandidateMatch,
  CanonicalNodeType,
  CanonicalTaxonomyNode,
  CognitiveDepth,
  ExamSyllabusCanonicalMapping,
  ExamSyllabusNode,
  ExamSyllabusVersion,
  MatchMethod,
  SyllabusMatchStatus,
  SyllabusVersionStatus,
  SyllabusWeightageTier,
} from "@/types/dynamic-syllabus-reconciliation";

type Tables = Database["public"]["Tables"];
type Json = Database["public"]["Tables"]["exam_syllabus_versions"]["Row"]["metadata"];

/** A domain value (interfaces, arrays of them) as a Json column value. */
export function toJson(v: unknown): Json {
  return JSON.parse(JSON.stringify(v ?? null)) as Json;
}

/** A JSON object column as a plain record (non-objects become {}). */
export function jsonRecord(v: Json | null | undefined): Record<string, any> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, any>) : {};
}

export function toSyllabusNode(r: Tables["exam_syllabus_nodes"]["Row"]): ExamSyllabusNode {
  return {
    ...r,
    weightage_tier: r.weightage_tier as SyllabusWeightageTier | null,
    required_cognitive_depth: r.required_cognitive_depth as CognitiveDepth | null,
    expected_questions_min: r.expected_questions_min ?? undefined,
    expected_questions_max: r.expected_questions_max ?? undefined,
  };
}

export function toSyllabusVersion(r: Tables["exam_syllabus_versions"]["Row"]): ExamSyllabusVersion {
  return {
    ...r,
    status: r.status as SyllabusVersionStatus,
    raw_payload_hash: r.raw_payload_hash ?? "",
    metadata: jsonRecord(r.metadata),
  };
}

export function toCanonicalMapping(r: Tables["exam_syllabus_canonical_mappings"]["Row"]): ExamSyllabusCanonicalMapping {
  return {
    ...r,
    match_status: r.match_status as SyllabusMatchStatus,
    match_method: (r.match_method ?? undefined) as MatchMethod | undefined,
    candidate_matches: Array.isArray(r.candidate_matches) ? (JSON.parse(JSON.stringify(r.candidate_matches)) as CanonicalCandidateMatch[]) : [],
    reconciliation_metadata: jsonRecord(r.reconciliation_metadata),
  };
}

export function toCanonicalNode(r: Tables["canonical_taxonomy_nodes"]["Row"]): CanonicalTaxonomyNode {
  return {
    ...r,
    node_type: r.node_type as CanonicalNodeType,
    root_subject_id: r.root_subject_id ?? "",
    metadata: jsonRecord(r.metadata),
  };
}
