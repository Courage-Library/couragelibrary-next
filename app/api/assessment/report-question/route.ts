import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminServerSupabaseClient } from "@/lib/supabase/server";
import { getSessionState } from "@/lib/auth/session-state";
import { submitQuestionReport, type ReportCode } from "@/lib/practice/report";
import { PRACTICE_COPY } from "@/content/practice";
import type { ReportReason } from "@/lib/practice/engine";

/**
 * Mock player "Report issue" (components/assessment/report-issue-dialog.tsx) — F2: a thin adapter over the ONE report
 * path (lib/practice/report.ts): the dialog's category keys map onto the four reasons, its text becomes the optional
 * note (≤ 500), and the response carries fixed copy only. The mock question id is resolved to its canonical question
 * and version on the server (never trusted from the client).
 */
const REASON: Record<string, ReportReason> = {
  wrong_answer_key: "WRONG_ANSWER_KEY",
  INCORRECT_ANSWER: "WRONG_ANSWER_KEY",
  typo: "TYPO_OR_UNCLEAR",
  TYPO: "TYPO_OR_UNCLEAR",
  wrong_options: "TYPO_OR_UNCLEAR",
  AMBIGUOUS: "TYPO_OR_UNCLEAR",
  question_text_error: "TYPO_OR_UNCLEAR",
  QUESTION_TEXT_ERROR: "TYPO_OR_UNCLEAR",
  translation_error: "TRANSLATION_ERROR",
  TRANSLATION_ERROR: "TRANSLATION_ERROR",
};
const STATUS: Partial<Record<ReportCode, number>> = { REPORTED: 200, ALREADY_REPORTED: 200, NOT_SIGNED_IN: 401, NOT_FOUND: 404, RATE_LIMITED: 429, FAILED: 500 };

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const session = await getSessionState(supabase);
  const reply = (code: ReportCode) =>
    NextResponse.json(
      { success: code === "REPORTED" || code === "ALREADY_REPORTED", code, message: PRACTICE_COPY.report.results[code], error: code === "REPORTED" || code === "ALREADY_REPORTED" ? undefined : PRACTICE_COPY.report.results[code] },
      { status: STATUS[code] ?? 400 },
    );
  if (session.state !== "user") return reply(session.state === "none" ? "NOT_SIGNED_IN" : "FAILED");

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return reply("INVALID_INPUT");
  }
  let questionId = typeof body.questionId === "string" ? body.questionId : null;
  let questionVersionId = typeof body.questionVersionId === "string" ? body.questionVersionId : null;
  if (typeof body.mockQuestionId === "string") {
    // mock_questions is not client-readable: resolve the canonical question + version server-side
    const { data } = await createAdminServerSupabaseClient()
      .from("mock_questions")
      .select("question_version_id, question_versions(question_id)")
      .eq("id", body.mockQuestionId)
      .maybeSingle();
    const qv = data?.question_versions as unknown as { question_id: string } | null;
    if (!data || !qv) return reply("NOT_FOUND");
    questionId = qv.question_id;
    questionVersionId = data.question_version_id;
  }
  if (!questionId) return reply("INVALID_INPUT");
  const note = typeof body.description === "string" ? body.description.trim().slice(0, 500) : "";
  const code = await submitQuestionReport(supabase, session.user.id, {
    questionId,
    questionVersionId,
    reason: REASON[String(body.issueType)] ?? "OTHER",
    note,
  });
  return reply(code);
}
