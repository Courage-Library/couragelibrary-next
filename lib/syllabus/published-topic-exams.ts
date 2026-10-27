/**
 * GAP2-4b: which exams a canonical topic belongs to, from PUBLISHED syllabus versions (UNIT node mappings).
 * Replaces the retired exam_unit_mappings / exam_topics paths: a learning unit is relevant to an exam when its topic is
 * mapped in that exam's published syllabus. One query for any number of topics. Read failures return null (callers
 * show "unavailable", never invented links).
 */
import type { AppSupabaseClient } from "@/lib/supabase/types";

export interface PublishedTopicExam {
  examId: string;
  examTitle: string;
  /** UNIT node fields of the published syllabus (null when not set). */
  weightageTier: string | null;
  requiredDepth: string | null;
  isMandatory: boolean;
}

export async function loadPublishedExamsForTopics(
  supabase: AppSupabaseClient,
  topicIds: string[],
): Promise<Map<string, PublishedTopicExam[]> | null> {
  const ids = Array.from(new Set(topicIds.filter(Boolean)));
  const out = new Map<string, PublishedTopicExam[]>();
  if (ids.length === 0) return out;
  const { data, error } = await supabase
    .from("exam_syllabus_canonical_mappings")
    .select(
      "topic_id, node:exam_syllabus_nodes!inner(weightage_tier, required_cognitive_depth, is_mandatory, version:exam_syllabus_versions!inner(exam:exams(id, title)))",
    )
    .in("topic_id", ids) // CA-2: a SUBTOPIC / CONCEPT mapping counts for its topic
    .eq("node.node_kind", "UNIT")
    .eq("node.version.status", "PUBLISHED")
    .eq("node.version.is_active", true);
  if (error) return null;
  for (const row of data ?? []) {
    const exam = row.node?.version?.exam;
    if (!row.topic_id || !row.node || !exam) continue;
    const list = out.get(row.topic_id) ?? [];
    if (!list.some((e) => e.examId === exam.id)) {
      list.push({
        examId: exam.id,
        examTitle: exam.title,
        weightageTier: row.node.weightage_tier,
        requiredDepth: row.node.required_cognitive_depth,
        isMandatory: row.node.is_mandatory,
      });
    }
    out.set(row.topic_id, list);
  }
  return out;
}
