import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getOnboardingState } from "@/lib/onboarding/server";
import { learnHref } from "@/lib/learn/paths";
import { decideNextStep, type NextStep, type ProgressInput } from "@/lib/learning/next-step";

/**
 * CA-7 dashboard "next step" — the student's OWN rows only (session client; RLS own-row reads): reading progress, the
 * onboarding exam choice, a submitted mock. Any read that fails → no card (never a guessed state, R12).
 */
export async function getNextStep(mistakes: number): Promise<NextStep> {
  try {
    const supabase = await createServerSupabaseClient();
    const [progressRes, attemptsRes, onboarding, liveRes] = await Promise.all([
      supabase.from("user_lesson_progress").select("document_id, status, updated_at").eq("status", "READING").order("updated_at", { ascending: false }).limit(10),
      supabase.from("test_attempts").select("id", { count: "exact", head: true }).not("submitted_at", "is", null),
      getOnboardingState(supabase),
      supabase.rpc("fn_live_course_document_ids"),
    ]);
    if (progressRes.error || attemptsRes.error) return null;
    const live = new Set(liveRes.error || !Array.isArray(liveRes.data) ? [] : (liveRes.data as unknown[]).map(String));
    const ids = (progressRes.data || []).map((r) => r.document_id);
    let progress: ProgressInput[] = [];
    if (ids.length) {
      const { data: docs, error } = await supabase
        .from("learning_documents")
        .select("id, node:canonical_taxonomy_nodes!learning_documents_node_id_fkey(name, hierarchy_path)")
        .in("id", ids)
        .eq("status", "PUBLISHED");
      if (error) return null;
      const byId = new Map((docs || []).map((d) => [d.id, Array.isArray(d.node) ? d.node[0] : d.node]));
      progress = (progressRes.data || []).flatMap((r) => {
        const n = byId.get(r.document_id);
        return n?.hierarchy_path ? [{ documentId: r.document_id, title: n.name, href: learnHref(n.hierarchy_path), status: r.status, updatedAt: r.updated_at, inLiveCourse: live.has(r.document_id) }] : [];
      });
    }
    return decideNextStep({ progress, pickedExam: onboarding.answers.examIds.length > 0, submittedMock: (attemptsRes.count ?? 0) > 0, mistakes });
  } catch {
    return null;
  }
}
