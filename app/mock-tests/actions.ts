"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export interface ExamGoalActionResult {
  success?: boolean;
  message?: string;
  error?: string;
}

/**
 * Server Action: Add or activate an exam goal for the current student
 */
export async function addUserExamGoalAction(examId: string): Promise<ExamGoalActionResult> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Please log in to set exam goals." };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;

  // 1. Check if exam exists
  const { data: exam, error: examErr } = await sb
    .from("exams")
    .select("id, title, slug")
    .eq("id", examId)
    .single();

  if (examErr || !exam) {
    return { error: "Selected exam could not be found." };
  }

  // 2. Fetch cycle for foreign key
  const { data: cycle } = await sb
    .from("exam_cycles")
    .select("id")
    .eq("exam_id", examId)
    .limit(1)
    .maybeSingle();

  let cycleId = cycle?.id;
  if (!cycleId) {
    const { data: newCycle } = await sb
      .from("exam_cycles")
      .insert({
        exam_id: examId,
        cycle_year: new Date().getFullYear(),
        status: "active",
      })
      .select("id")
      .single();
    cycleId = newCycle?.id;
  }

  if (!cycleId) {
    return { error: "Could not associate exam cycle." };
  }

  // 3. Upsert into user_exam_goals
  const { data: existingGoal } = await sb
    .from("user_exam_goals")
    .select("id")
    .eq("user_id", user.id)
    .eq("exam_id", examId)
    .maybeSingle();

  if (existingGoal) {
    const { error: updateErr } = await sb
      .from("user_exam_goals")
      .update({ is_active: true, updated_at: new Date().toISOString() })
      .eq("id", existingGoal.id);

    if (updateErr) return { error: updateErr.message };
  } else {
    // Determine next priority rank
    const { data: currentGoals } = await sb
      .from("user_exam_goals")
      .select("priority_rank")
      .eq("user_id", user.id);

    const nextRank = (currentGoals?.length || 0) + 1;

    const { error: insertErr } = await sb
      .from("user_exam_goals")
      .insert({
        user_id: user.id,
        exam_id: examId,
        exam_cycle_id: cycleId,
        is_active: true,
        priority_rank: nextRank,
      });

    if (insertErr) return { error: insertErr.message };
  }

  revalidatePath("/mock-tests");
  return { success: true, message: `${exam.title} added to your preparation goals.` };
}

/**
 * Server Action: Remove or deactivate an exam goal for the current student
 */
export async function removeUserExamGoalAction(examId: string): Promise<ExamGoalActionResult> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Please log in to manage exam goals." };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;

  const { error: updateErr } = await sb
    .from("user_exam_goals")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("exam_id", examId);

  if (updateErr) return { error: updateErr.message };

  revalidatePath("/mock-tests");
  return { success: true, message: "Exam goal updated." };
}
