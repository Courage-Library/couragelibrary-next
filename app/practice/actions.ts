"use server";

/**
 * F2 topic practice (decision #79) server actions.
 *   checkPracticeAnswerAction  ONE question: fn_check_practice_answer records the answer, returns correctness + key +
 *                              explanation for that question only, and (wrong / skipped) records the mistake in the
 *                              canonical Mistake Vault in the same transaction. Rate-limited in the database.
 *   reportQuestionAction       "Report this question" (lib/practice/report.ts) — fixed codes only.
 * Inputs are validated here AND in the database; nothing from the database is passed through as text.
 */
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSessionState } from "@/lib/auth/session-state";
import { isPracticeEnabled } from "@/lib/practice/flag";
import { submitQuestionReport, type ReportCode } from "@/lib/practice/report";

const ID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEYS = ["A", "B", "C", "D"] as const;

export type CheckAnswerResult =
  | { ok: true; isCorrect: boolean; correctKey: string; explanation: string | null; savedToMistakes: boolean }
  | { ok: false; code: "RATE_LIMITED" | "NOT_FOUND" | "NOT_SIGNED_IN" | "FAILED" };

export async function checkPracticeAnswerAction(input: { versionId: string; selected: string | null; timeMs: number; setId: string; mode: "TOPIC" | "DIAGNOSTIC" }): Promise<CheckAnswerResult> {
  if (!isPracticeEnabled()) return { ok: false, code: "FAILED" };
  const selected = input.selected === null ? null : KEYS.find((k) => k === input.selected) ?? undefined;
  const timeMs = Number.isFinite(input.timeMs) ? Math.min(3600000, Math.max(0, Math.round(input.timeMs))) : null;
  if (!ID_RX.test(String(input.versionId)) || !ID_RX.test(String(input.setId)) || selected === undefined || !["TOPIC", "DIAGNOSTIC"].includes(input.mode)) {
    return { ok: false, code: "FAILED" };
  }
  const supabase = await createServerSupabaseClient();
  const session = await getSessionState(supabase);
  if (session.state !== "user") return { ok: false, code: session.state === "none" ? "NOT_SIGNED_IN" : "FAILED" };

  const { data, error } = await supabase.rpc("fn_check_practice_answer", {
    p_question_version_id: input.versionId,
    // the generated arg type is non-null; a skipped question is checked as unanswered (NULL)
    p_selected_option_key: selected as string,
    p_time_taken_ms: timeMs as number,
    p_set_id: input.setId,
    p_mode: input.mode,
  });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) return { ok: false, code: "FAILED" };
  const r = data as Record<string, unknown>;
  if (r.success !== true) {
    const code = r.code === "RATE_LIMITED" || r.code === "NOT_FOUND" || r.code === "NOT_SIGNED_IN" ? r.code : "FAILED";
    return { ok: false, code };
  }
  const correctKey = KEYS.find((k) => k === r.correct_option_key);
  if (!correctKey) return { ok: false, code: "FAILED" };
  return {
    ok: true,
    isCorrect: r.is_correct === true,
    correctKey,
    explanation: typeof r.explanation_md === "string" && r.explanation_md.trim() ? r.explanation_md : null,
    savedToMistakes: r.saved_to_mistakes === true,
  };
}

export async function reportQuestionAction(input: { questionId: string; questionVersionId: string | null; reason: string; note: string }): Promise<ReportCode> {
  const supabase = await createServerSupabaseClient();
  const session = await getSessionState(supabase);
  if (session.state !== "user") return session.state === "none" ? "NOT_SIGNED_IN" : "FAILED";
  return submitQuestionReport(supabase, session.user.id, input);
}
