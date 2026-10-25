"use server";

/**
 * F5 Memory Lock server actions — thin, validated wrappers over the two RPCs (migration 095):
 *   checkMemoryLockAnswerAction  fn_memory_lock_answer — checks + records + reschedules in ONE transaction
 *   addToMemoryLockAction        fn_memory_lock_add — "Add to Memory Lock"
 * auth.uid() is taken in the database; nothing from the database is passed through as text except the explanation.
 */
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSessionState } from "@/lib/auth/session-state";
import { isMemoryLockEnabled } from "@/lib/memory-lock/flag";
import { backInLabel, istDay } from "@/lib/memory-lock/scheduler";

const ID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEYS = ["A", "B", "C", "D"] as const;
const DAY_RX = /^\d{4}-\d{2}-\d{2}$/;

export type MemoryLockAnswerResult =
  | { ok: true; isCorrect: boolean; correctKey: string; explanation: string | null; savedToMistakes: boolean; backIn: string }
  | { ok: false; code: "RATE_LIMITED" | "NOT_FOUND" | "NOT_SIGNED_IN" | "NOT_IN_MEMORY_LOCK" | "FAILED" };

export async function checkMemoryLockAnswerAction(input: { versionId: string; selected: string | null; timeMs: number; sessionId: string }): Promise<MemoryLockAnswerResult> {
  if (!isMemoryLockEnabled()) return { ok: false, code: "FAILED" };
  // the runner only checks a chosen option ("Choose an option first"); the generated RPC type takes a non-null key
  const selected = KEYS.find((k) => k === input.selected);
  const timeMs = Number.isFinite(input.timeMs) ? Math.min(3600000, Math.max(0, Math.round(input.timeMs))) : null;
  if (!ID_RX.test(String(input.versionId)) || !ID_RX.test(String(input.sessionId)) || selected === undefined) return { ok: false, code: "FAILED" };
  const supabase = await createServerSupabaseClient();
  const session = await getSessionState(supabase);
  if (session.state !== "user") return { ok: false, code: session.state === "none" ? "NOT_SIGNED_IN" : "FAILED" };

  const { data, error } = await supabase.rpc("fn_memory_lock_answer", {
    p_question_version_id: input.versionId,
    p_selected_option_key: selected,
    p_time_taken_ms: timeMs ?? 0,
    p_session_id: input.sessionId,
  });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) return { ok: false, code: "FAILED" };
  const r = data as Record<string, unknown>;
  if (r.success !== true) {
    const code = String(r.code);
    return { ok: false, code: (["RATE_LIMITED", "NOT_FOUND", "NOT_SIGNED_IN", "NOT_IN_MEMORY_LOCK"] as const).find((c) => c === code) ?? "FAILED" };
  }
  const correctKey = KEYS.find((k) => k === r.correct_option_key);
  const dueOn = typeof r.due_on === "string" && DAY_RX.test(r.due_on) ? r.due_on : null;
  if (!correctKey || !dueOn) return { ok: false, code: "FAILED" };
  return {
    ok: true,
    isCorrect: r.is_correct === true,
    correctKey,
    explanation: typeof r.explanation_md === "string" && r.explanation_md.trim() ? r.explanation_md : null,
    savedToMistakes: r.is_correct !== true,
    backIn: backInLabel(istDay(new Date()), dueOn),
  };
}

export type AddToMemoryLockCode = "ADDED" | "ALREADY_ADDED" | "RATE_LIMITED" | "NOT_SIGNED_IN" | "NOT_FOUND" | "FAILED";

export async function addToMemoryLockAction(input: { questionId: string }): Promise<AddToMemoryLockCode> {
  if (!isMemoryLockEnabled() || !ID_RX.test(String(input?.questionId))) return "FAILED";
  const supabase = await createServerSupabaseClient();
  const session = await getSessionState(supabase);
  if (session.state !== "user") return session.state === "none" ? "NOT_SIGNED_IN" : "FAILED";
  const { data, error } = await supabase.rpc("fn_memory_lock_add", { p_question_id: input.questionId });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) return "FAILED";
  const code = String((data as Record<string, unknown>).code);
  return (["ADDED", "ALREADY_ADDED", "RATE_LIMITED", "NOT_SIGNED_IN", "NOT_FOUND"] as const).find((c) => c === code) ?? "FAILED";
}
