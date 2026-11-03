"use server";

/**
 * COURSE-UX-1 lesson reader actions — thin, validated wrappers over the migration 136 / 137 RPCs. The database takes the
 * student from auth.uid() (the session client; never the service role, never a user id from the caller), checks every
 * id against the PUBLISHED lesson and keeps its own clock. Nothing here decides a completion or a coin.
 *   - recordReadingAction: the furthest block read (resume position; the LAST block = end reached)
 *   - answerQuickCheckAction: the server checks the answer and returns correctness + feedback (rendered here, so math
 *     is server KaTeX); a visitor who is not signed in gets the same check from the published version, nothing recorded
 *   - completeLessonAction: fn_lesson_complete — completed only with the server-recorded evidence; else what is missing
 */
import type { ReactNode } from "react";
import { revalidatePath } from "next/cache";
import { createAdminServerSupabaseClient, createServerSupabaseClient } from "@/lib/supabase/server";
import { getSessionState } from "@/lib/auth/session-state";
import { Rich } from "@/components/learning/lesson-blocks-renderer";
import { renderLatex } from "@/lib/lessons/katex-render";
import type { LessonMathProps } from "@/lib/lessons/blocks";
import { validateLesson } from "@/lib/lessons/blocks";
import { isLessonCoinsEarnEnabled } from "@/lib/coins/flag";

const ID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BLOCK_RX = /^[a-z0-9][a-z0-9-]{0,39}$/;
const PAGE_RX = /^(?:\/hi)?\/learn(?:\/[a-z0-9]+(?:-[a-z0-9]+)*){2,4}$/;
const NO_LINKS = { nodes: {}, images: {} };
const lang = (v: unknown): "en" | "hi" | null => (v === "en" || v === "hi" ? v : null);

export type ReadingResult = { ok: boolean };

export async function recordReadingAction(input: { documentId: string; language: string; blockId: string }): Promise<ReadingResult> {
  const language = lang(input?.language);
  if (!ID_RX.test(String(input?.documentId)) || !language || !BLOCK_RX.test(String(input?.blockId))) return { ok: false };
  const supabase = await createServerSupabaseClient();
  const session = await getSessionState(supabase);
  if (session.state !== "user") return { ok: false };
  const { error } = await supabase.rpc("fn_lesson_progress_save", { p_document_id: input.documentId, p_language: language, p_status: "READING", p_last_block_id: input.blockId });
  return { ok: !error };
}

export type QuickCheckResult =
  | { ok: true; correct: boolean; correctOptionId: string | null; feedback: ReactNode | null; recorded: boolean }
  | { ok: false; code: "INVALID" | "NOT_FOUND" | "FAILED" };

/** The published quick check (visitors): the same rule as fn_lesson_quick_check_answer, nothing recorded. */
async function publishedQuickCheck(documentId: string, language: "en" | "hi", blockId: string) {
  const admin = createAdminServerSupabaseClient();
  const { data: doc } = await admin.from("learning_documents").select("status").eq("id", documentId).maybeSingle();
  if (doc?.status !== "PUBLISHED") return null;
  const { data: v } = await admin
    .from("document_versions")
    .select("lesson_meta, blocks")
    .eq("document_id", documentId)
    .eq("language", language)
    .eq("is_current", true)
    .eq("is_published", true)
    .eq("review_status", "PUBLISHED")
    .eq("content_format", "BLOCKS")
    .maybeSingle();
  const lesson = v ? validateLesson(v.lesson_meta, v.blocks) : null;
  if (!lesson || !lesson.ok) return null;
  const block = lesson.blocks.find((b) => b.id === blockId);
  return block && block.type === "quick_check" ? block : null;
}

/** Feedback math: the same server KaTeX output as KatexMath (its stylesheet is already on the lesson page). */
function FeedbackMath({ latex, reading }: LessonMathProps) {
  const html = renderLatex(latex, "inline");
  return html ? <span data-katex="" dangerouslySetInnerHTML={{ __html: html }} /> : <span className="font-mono">{reading || latex}</span>;
}

const feedbackNode = (text: string | null | undefined) => (text ? <Rich text={text} links={NO_LINKS} Math={FeedbackMath} /> : null);

export async function answerQuickCheckAction(input: { documentId: string; language: string; blockId: string; optionId: string }): Promise<QuickCheckResult> {
  const language = lang(input?.language);
  if (!ID_RX.test(String(input?.documentId)) || !language || !BLOCK_RX.test(String(input?.blockId)) || !BLOCK_RX.test(String(input?.optionId))) return { ok: false, code: "INVALID" };
  const supabase = await createServerSupabaseClient();
  const session = await getSessionState(supabase);
  if (session.state === "user") {
    const { data, error } = await supabase.rpc("fn_lesson_quick_check_answer", { p_document_id: input.documentId, p_language: language, p_block_id: input.blockId, p_option_id: input.optionId });
    if (error) return { ok: false, code: error.code === "P0002" ? "NOT_FOUND" : "FAILED" };
    const r = (data && typeof data === "object" && !Array.isArray(data) ? data : {}) as { correct?: unknown; correct_option_id?: unknown; feedback?: unknown };
    return { ok: true, correct: r.correct === true, correctOptionId: typeof r.correct_option_id === "string" ? r.correct_option_id : null, feedback: feedbackNode(typeof r.feedback === "string" ? r.feedback : null), recorded: true };
  }
  // a session that could not be read is NOT a visitor: answering unrecorded would silently block the completion
  if (session.state !== "none") return { ok: false, code: "FAILED" };
  const block = await publishedQuickCheck(input.documentId, language, input.blockId).catch(() => null);
  const option = block?.options.find((o) => o.id === input.optionId);
  if (!block || !option) return { ok: false, code: "NOT_FOUND" };
  return { ok: true, correct: option.correct, correctOptionId: block.options.find((o) => o.correct)?.id ?? null, feedback: feedbackNode(option.feedback), recorded: false };
}

export type CompleteResult =
  | { ok: true; completed: boolean; missing: ("START" | "END" | "QUICK_CHECKS" | "TIME")[]; secondsLeft: number; quickChecks: { total: number; attempted: number } | null; coins: number | null }
  | { ok: false; code: "NOT_SIGNED_IN" | "INVALID" | "FAILED" };

export async function completeLessonAction(input: { documentId: string; language: string; pagePath: string }): Promise<CompleteResult> {
  const language = lang(input?.language);
  if (!ID_RX.test(String(input?.documentId)) || !language) return { ok: false, code: "INVALID" };
  const supabase = await createServerSupabaseClient();
  const session = await getSessionState(supabase);
  if (session.state !== "user") return { ok: false, code: "NOT_SIGNED_IN" };
  const { data, error } = await supabase.rpc("fn_lesson_complete", { p_document_id: input.documentId, p_language: language });
  if (error) return { ok: false, code: "FAILED" };
  const r = (data && typeof data === "object" && !Array.isArray(data) ? data : {}) as Record<string, unknown>;
  const missing = (Array.isArray(r.missing) ? r.missing : []).filter((m): m is "START" | "END" | "QUICK_CHECKS" | "TIME" => m === "START" || m === "END" || m === "QUICK_CHECKS" || m === "TIME");
  const qc = r.quick_checks && typeof r.quick_checks === "object" ? (r.quick_checks as { total?: unknown; attempted?: unknown }) : null;
  const completed = r.completed === true;
  if (completed && PAGE_RX.test(String(input?.pagePath))) revalidatePath(String(input.pagePath));
  return {
    ok: true,
    completed,
    missing,
    secondsLeft: typeof r.seconds_left === "number" ? r.seconds_left : 0,
    quickChecks: qc && typeof qc.total === "number" && typeof qc.attempted === "number" ? { total: qc.total, attempted: qc.attempted } : null,
    // coins are shown only when the lesson-earn flag is on (the database switch alone decides the award)
    coins: isLessonCoinsEarnEnabled() && typeof r.coins_awarded === "number" ? r.coins_awarded : null,
  };
}
