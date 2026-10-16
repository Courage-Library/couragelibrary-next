/**
 * GAP2-4b: the syllabus editor's live state (nodes + their topic mappings + the validation report), read with the
 * CALLER's session client (admin / staff RLS read policy; the report through the role-checked fn_syllabus_validate).
 * Shared by the editor page and the editor's server actions: every mutation returns the fresh state, so the editor
 * updates from the action's own round trip instead of depending on a follow-up page refresh (which can fail on a
 * flaky connection and would leave the UI stale or pending).
 * Read failures return null (callers keep their current state); nothing here writes.
 */
import { rpcJsonObject } from "@/lib/supabase/rpc";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import type { SyllabusEditorNode, SyllabusValidationReport } from "@/types/syllabus";

export interface SyllabusEditorState {
  nodes: SyllabusEditorNode[];
  report: SyllabusValidationReport | null;
}

export async function loadSyllabusEditorState(supabase: AppSupabaseClient, versionId: string): Promise<SyllabusEditorState | null> {
  try {
    const [nodesRes, validateRes] = await Promise.all([
      supabase
        .from("exam_syllabus_nodes")
        .select(
          "id, parent_node_id, node_kind, raw_title, raw_slug, description, display_order, node_depth, weightage_tier, expected_questions_min, expected_questions_max, is_mandatory, exam_syllabus_canonical_mappings(canonical_node_id, mapping_weight)",
        )
        .eq("syllabus_version_id", versionId),
      supabase.rpc("fn_syllabus_validate", { p_version_id: versionId }),
    ]);
    if (nodesRes.error) return null;
    const nodes: SyllabusEditorNode[] = (nodesRes.data ?? []).map((n) => ({
      id: n.id,
      parent_id: n.parent_node_id,
      kind: n.node_kind as SyllabusEditorNode["kind"],
      title: n.raw_title,
      slug: n.raw_slug,
      description: n.description,
      display_order: n.display_order,
      depth: n.node_depth,
      weightage_tier: n.weightage_tier as SyllabusEditorNode["weightage_tier"],
      expected_questions_min: n.expected_questions_min,
      expected_questions_max: n.expected_questions_max,
      is_mandatory: n.is_mandatory,
      mappings: (n.exam_syllabus_canonical_mappings ?? [])
        .filter((m) => m.canonical_node_id)
        .map((m) => ({ topic_id: m.canonical_node_id as string, weight: m.mapping_weight })),
    }));
    const report = validateRes.error ? null : rpcJsonObject<SyllabusValidationReport>(validateRes.data);
    return { nodes, report };
  } catch {
    return null;
  }
}
