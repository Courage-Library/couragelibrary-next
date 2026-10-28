import "server-only";

import { guardAdminAction } from "@/lib/auth/require-admin";
import { createAdminServerSupabaseClient } from "@/lib/supabase/server";
import { computeCoverage, coverageSnapshot, type Coverage, type CoverageExam, type CoverageNodeInput, type CoverageView } from "@/lib/learning/coverage";

export type { CoverageExam, CoverageView };

/**
 * CA-7 coverage matrix + launch (design H). Reads with the server's admin client AFTER the admin / staff guard; the
 * launch / pause is admin-only and goes through fn_exam_course_launch_set (audited EXAM_COURSE_LAUNCH / _PAUSE) with a
 * coverage snapshot computed here, at the moment of the click.
 */
type Result<T> = { success: true; data: T } | { success: false; code: string; error: string };
const fail = <T>(code: string, error: string): Result<T> => ({ success: false, code, error });

async function ctx(adminOnly: boolean) {
  const auth = await guardAdminAction({ allowStaff: !adminOnly });
  if (!auth.ok) return null;
  return { userId: auth.userId || null, userEmail: auth.userEmail || "unknown", db: createAdminServerSupabaseClient() };
}

export class CoverageService {
  static async listExams(): Promise<Result<CoverageExam[]>> {
    const c = await ctx(false);
    if (!c) return fail("UNAUTHORIZED", "Unauthorized.");
    const [exams, launches] = await Promise.all([
      c.db.from("exams").select("id, title, slug").eq("is_active", true).order("title"),
      c.db.from("exam_course_launches").select("exam_id, exam_cycle_id, status, launched_at, changed_at, changed_by_email"),
    ]);
    if (exams.error || launches.error) return fail("DB_ERROR", "Could not load the exams.");
    const byExam = new Map((launches.data || []).map((l) => [l.exam_id, l]));
    return {
      success: true,
      data: (exams.data || []).map((e) => {
        const l = byExam.get(e.id);
        return { id: e.id, title: e.title, slug: e.slug, launch: l ? { status: l.status as "LIVE" | "PAUSED", launchedAt: l.launched_at, changedAt: l.changed_at, changedBy: l.changed_by_email, cycleId: l.exam_cycle_id } : null };
      }),
    };
  }

  /** The matrix for one exam: the cycle the course uses (fn_exam_course_outline's choice) and its mapped nodes. */
  static async forExam(examId: string): Promise<Result<CoverageView>> {
    const c = await ctx(false);
    if (!c) return fail("UNAUTHORIZED", "Unauthorized.");
    const exams = await CoverageService.listExams();
    if (!exams.success) return exams;
    const exam = exams.data.find((e) => e.id === examId);
    if (!exam) return fail("NOT_FOUND", "Exam not found.");
    const outline = await c.db.rpc("fn_exam_course_outline", { p_exam_id: examId, p_language: "en" });
    if (outline.error) return fail("DB_ERROR", "Could not read the course outline.");
    const o = (outline.data ?? {}) as { state?: string; exam_cycle_id?: string | null };
    const empty: Coverage = computeCoverage([], []);
    if (o.state === "NO_SYLLABUS") return { success: true, data: { exam, cycleId: null, cycleYear: null, state: "NO_SYLLABUS", coverage: empty } };
    const cycleId = o.exam_cycle_id ?? null;

    let vq = c.db.from("exam_syllabus_versions").select("id").eq("exam_id", examId).eq("status", "PUBLISHED").eq("is_active", true);
    vq = cycleId ? vq.eq("exam_cycle_id", cycleId) : vq.is("exam_cycle_id", null);
    const [versions, cycle, tree, servable] = await Promise.all([
      vq,
      cycleId ? c.db.from("exam_cycles").select("cycle_year").eq("id", cycleId).maybeSingle() : Promise.resolve({ data: null, error: null }),
      c.db.from("canonical_taxonomy_nodes").select("id, parent_id, name, hierarchy_path, node_type, is_active, is_internal"),
      c.db.rpc("fn_servable_node_lessons"),
    ]);
    if (versions.error || tree.error || servable.error) return fail("DB_ERROR", "Could not load the coverage.");
    const versionIds = (versions.data || []).map((v) => v.id);
    const units = versionIds.length
      ? await c.db.from("exam_syllabus_nodes").select("id, weightage_tier").in("syllabus_version_id", versionIds)
      : { data: [] as { id: string; weightage_tier: string | null }[], error: null };
    if (units.error) return fail("DB_ERROR", "Could not load the syllabus.");
    const unitWeight = new Map((units.data || []).map((u) => [u.id, u.weightage_tier]));
    const unitIds = [...unitWeight.keys()];
    const maps = unitIds.length
      ? await c.db.from("exam_syllabus_canonical_mappings").select("syllabus_node_id, canonical_node_id").in("syllabus_node_id", unitIds).not("canonical_node_id", "is", null)
      : { data: [] as { syllabus_node_id: string; canonical_node_id: string | null }[], error: null };
    if (maps.error) return fail("DB_ERROR", "Could not load the mappings.");

    const nodes = new Map((tree.data || []).map((n) => [n.id, n]));
    const underInternal = (id: string) => {
      for (let p = nodes.get(id)?.parent_id ?? null, i = 0; p && i < 6; p = nodes.get(p)?.parent_id ?? null, i++) if (nodes.get(p)?.is_internal) return true;
      return false;
    };
    const order = ["HIGH_YIELD", "CORE", "MODERATE", "LOW", "OPTIONAL"];
    const weight = new Map<string, string | null>();
    for (const m of maps.data || []) {
      if (!m.canonical_node_id) continue;
      const w = unitWeight.get(m.syllabus_node_id) ?? null;
      const prev = weight.get(m.canonical_node_id);
      if (prev === undefined || (w && (!prev || order.indexOf(w) < order.indexOf(prev)))) weight.set(m.canonical_node_id, w);
    }
    const inputs: CoverageNodeInput[] = [...weight.entries()].flatMap(([id, w]) => {
      const n = nodes.get(id);
      return n && n.is_active ? [{ id, name: n.name, path: n.hierarchy_path, nodeType: n.node_type, isInternal: n.is_internal, underInternal: underInternal(id), weightageTier: w }] : [];
    });
    const lessons = ((servable.data || []) as { document_id: string; node_id: string; hi_current: boolean }[]).map((s) => ({ nodeId: s.node_id, documentId: s.document_id, hiCurrent: s.hi_current }));
    return {
      success: true,
      data: { exam, cycleId, cycleYear: (cycle.data as { cycle_year: number } | null)?.cycle_year ?? null, state: "OK", coverage: computeCoverage(inputs, lessons) },
    };
  }

  /** LIVE (launch) or PAUSED — admin only; the snapshot is recomputed now, never sent by the browser. */
  static async setLaunch(examId: string, status: "LIVE" | "PAUSED"): Promise<Result<{ status: string }>> {
    const c = await ctx(true);
    if (!c) return fail("UNAUTHORIZED", "Only an admin can launch or pause a course.");
    const view = await CoverageService.forExam(examId);
    if (!view.success) return view;
    if (status === "LIVE" && view.data.state !== "OK") return fail("NO_SYLLABUS", "The exam has no published syllabus.");
    const { data, error } = await c.db.rpc("fn_exam_course_launch_set", {
      p_exam_id: examId,
      // generated RPC argument types are never nullable; NULL = the exam-wide course (the function accepts it)
      p_exam_cycle_id: view.data.cycleId as string,
      p_status: status,
      p_coverage: { ...coverageSnapshot(view.data.coverage), cycle_year: view.data.cycleYear },
      p_actor_id: c.userId as string,
      p_actor_email: c.userEmail,
    });
    if (error) {
      const m = String(error.message || "");
      return fail("LAUNCH_RULE", m.includes("LAUNCH:") ? m.slice(m.indexOf("LAUNCH:") + 7).trim() : "The change could not be saved.");
    }
    return { success: true, data: { status: (data as { status?: string } | null)?.status ?? status } };
  }
}
