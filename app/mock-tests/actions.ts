"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSessionState } from "@/lib/auth/session-state";

export type ExamGoalCode = "ADDED" | "REMOVED" | "SIGN_IN" | "NOT_FOUND" | "NO_CYCLE" | "GOALS_FULL" | "FAILED";

export interface ExamGoalActionResult {
  success?: boolean;
  code?: ExamGoalCode;
  message?: string;
  error?: string;
}

/** Fixed copy only — never database text (F1-a). */
const COPY: Record<ExamGoalCode, string> = {
  ADDED: "Added to your exams.",
  REMOVED: "Removed from your exams.",
  SIGN_IN: "Please sign in to manage your exams.",
  NOT_FOUND: "This exam is not available.",
  NO_CYCLE: "This exam can't be added yet.",
  GOALS_FULL: "You can follow up to 3 exams. Remove one first to add this one.",
  FAILED: "Could not update your exams right now. Please try again.",
};
const fail = (code: ExamGoalCode): ExamGoalActionResult => ({ success: false, code, error: COPY[code] });

const MAX_ACTIVE_GOALS = 3; // same rule as onboarding; enforced in the database by trg_user_exam_goals_guard (092)

/**
 * Server Action: follow an exam (F1-a). Attaches the goal to the exam's EXISTING active / upcoming cycle (active first,
 * newest year) — never creates a cycle (exam_cycles is admin-only). At most 3 active goals: checked here for a clear
 * message, enforced by the database trigger for every path (a GOALS_LIMIT error maps to the same fixed copy).
 */
export async function addUserExamGoalAction(examId: string): Promise<ExamGoalActionResult> {
  const supabase = await createServerSupabaseClient();
  const session = await getSessionState(supabase);
  if (session.state !== "user") return fail(session.state === "none" ? "SIGN_IN" : "FAILED");
  const userId = session.user.id;

  const { data: exam, error: examErr } = await supabase.from("exams").select("id, is_active").eq("id", examId).maybeSingle();
  if (examErr) return fail("FAILED");
  if (!exam || !exam.is_active) return fail("NOT_FOUND");

  const { data: cycles, error: cycleErr } = await supabase
    .from("exam_cycles")
    .select("id, status, cycle_year")
    .eq("exam_id", examId)
    .in("status", ["active", "upcoming"]);
  if (cycleErr) return fail("FAILED");
  const cycle = [...(cycles ?? [])].sort((a, b) => Number(b.status === "active") - Number(a.status === "active") || b.cycle_year - a.cycle_year)[0];
  if (!cycle) return fail("NO_CYCLE");

  const { data: goals, error: goalsErr } = await supabase.from("user_exam_goals").select("id, exam_id, exam_cycle_id, is_active").eq("user_id", userId);
  if (goalsErr) return fail("FAILED");
  const mine = goals ?? [];
  if (mine.some((g) => g.is_active && g.exam_id === examId)) return { success: true, code: "ADDED", message: COPY.ADDED };
  if (mine.filter((g) => g.is_active).length >= MAX_ACTIVE_GOALS) return fail("GOALS_FULL");

  const existing = mine.find((g) => g.exam_id === examId && g.exam_cycle_id === cycle.id);
  const { error: writeErr } = existing
    ? await supabase.from("user_exam_goals").update({ is_active: true, updated_at: new Date().toISOString() }).eq("id", existing.id).eq("user_id", userId)
    : await supabase.from("user_exam_goals").insert({
        user_id: userId,
        exam_id: examId,
        exam_cycle_id: cycle.id,
        is_active: true,
        priority_rank: mine.filter((g) => g.is_active).length + 1,
      });
  if (writeErr) return fail(/GOALS_LIMIT/.test(writeErr.message) ? "GOALS_FULL" : "FAILED");

  revalidatePath("/mock-tests");
  revalidatePath("/exams/[slug]", "page");
  return { success: true, code: "ADDED", message: COPY.ADDED };
}

/**
 * Server Action: stop following an exam (deactivates the student's goal rows for it; never deletes).
 */
export async function removeUserExamGoalAction(examId: string): Promise<ExamGoalActionResult> {
  const supabase = await createServerSupabaseClient();
  const session = await getSessionState(supabase);
  if (session.state !== "user") return fail(session.state === "none" ? "SIGN_IN" : "FAILED");

  const { error: updateErr } = await supabase
    .from("user_exam_goals")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("user_id", session.user.id)
    .eq("exam_id", examId);
  if (updateErr) return fail("FAILED");

  revalidatePath("/mock-tests");
  revalidatePath("/exams/[slug]", "page");
  return { success: true, code: "REMOVED", message: COPY.REMOVED };
}
