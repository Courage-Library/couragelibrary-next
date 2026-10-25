import "server-only";

/**
 * F2 "Report this question" — ONE submission path for practice, mock review, drills and the mock player.
 *   PRACTICE_ENABLED (migration 093 applied) → fn_report_question (SECURITY DEFINER): 4 reasons, optional note ≤ 500,
 *     one report per user per question, 20 per day, admin-only read.
 *   flag off (pre-093) → the earlier service-role insert into the same canonical store (question_errata_reports), with
 *     the same input rules and per-question dedupe, so behaviour does not change shape when the flag flips.
 * Returns a fixed code only (copy: content/practice.ts PRACTICE_COPY.report.results) — never database text.
 */
import { createAdminServerSupabaseClient } from "@/lib/supabase/server";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import { isPracticeEnabled } from "./flag";
import { validateReport, type ReportReason } from "./engine";

export type ReportCode = "REPORTED" | "ALREADY_REPORTED" | "RATE_LIMITED" | "NOTE_TOO_LONG" | "NOT_SIGNED_IN" | "INVALID_INPUT" | "NOT_FOUND" | "FAILED";
const RPC_CODES: ReportCode[] = ["REPORTED", "ALREADY_REPORTED", "RATE_LIMITED", "NOTE_TOO_LONG", "NOT_SIGNED_IN", "INVALID_INPUT", "NOT_FOUND"];
const LEGACY_ISSUE: Record<ReportReason, string> = { WRONG_ANSWER_KEY: "INCORRECT_ANSWER", TYPO_OR_UNCLEAR: "TYPO", TRANSLATION_ERROR: "OTHER", OTHER: "OTHER" };
const ID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function submitQuestionReport(
  supabase: AppSupabaseClient,
  userId: string,
  input: { questionId: unknown; questionVersionId?: unknown; reason: unknown; note: unknown },
): Promise<ReportCode> {
  const v = validateReport(input.reason, input.note);
  if (!v.ok) return v.code;
  const questionId = String(input.questionId ?? "");
  if (!ID_RX.test(questionId)) return "INVALID_INPUT";
  // surfaces that know only the question (drill results) report its current version
  let versionId = input.questionVersionId == null ? "" : String(input.questionVersionId);
  if (!versionId) {
    const { data } = await supabase.from("question_versions").select("id").eq("question_id", questionId).eq("is_current", true).maybeSingle();
    versionId = data?.id ?? "";
    if (!versionId) return "NOT_FOUND";
  }
  if (!ID_RX.test(versionId)) return "INVALID_INPUT";

  if (isPracticeEnabled()) {
    const { data, error } = await supabase.rpc("fn_report_question", { p_question_id: questionId, p_question_version_id: versionId, p_reason: v.reason, p_note: v.note });
    if (error || !data || typeof data !== "object" || Array.isArray(data)) return "FAILED";
    const code = (data as { code?: unknown }).code;
    return RPC_CODES.includes(code as ReportCode) ? (code as ReportCode) : "FAILED";
  }

  // pre-093 path (same store; the old description CHECK needs ≥ 10 characters)
  try {
    const admin = createAdminServerSupabaseClient();
    const { data: version } = await admin.from("question_versions").select("id").eq("id", versionId).eq("question_id", questionId).maybeSingle();
    if (!version) return "NOT_FOUND";
    const { data: existing } = await admin.from("question_errata_reports").select("id").eq("reporter_user_id", userId).eq("question_id", questionId).limit(1);
    if ((existing ?? []).length > 0) return "ALREADY_REPORTED";
    const since = new Date(Date.now() - 24 * 3600e3).toISOString();
    const { count } = await admin.from("question_errata_reports").select("id", { count: "exact", head: true }).eq("reporter_user_id", userId).gte("created_at", since);
    if ((count ?? 0) >= 20) return "RATE_LIMITED";
    const description = (v.note || `Reported: ${v.reason}`).padEnd(10, ".");
    const { error } = await admin.from("question_errata_reports").insert({
      reporter_user_id: userId,
      question_id: questionId,
      question_version_id: versionId,
      issue_type: LEGACY_ISSUE[v.reason],
      description,
      status: "OPEN",
    });
    return error ? "FAILED" : "REPORTED";
  } catch {
    return "FAILED";
  }
}
