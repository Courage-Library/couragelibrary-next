import "server-only";

/**
 * F1 (#75): data of the exam home page that is not part of the public exam read model. Every read uses the caller's
 * RLS session (anon or the student) — no service role, no writes — and never throws: a failed read degrades to the
 * signed-out / empty view. `cache` dedupes the reads across the page's Suspense boundaries within one request.
 */
import { cache } from "react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSessionState } from "@/lib/auth/session-state";
import { calculateRevisionDueState } from "@/services/mistake.service";
import { AssessmentService } from "@/services/assessment.service";
import { contentLanguage, mockStatuses, type ContentLanguage, type MockAttemptRow, type MockListItem, type MockStatus } from "@/lib/exams/exam-page";

/** Published mocks of the exam (day-window daily tests excluded), full-length first. Public data. */
export const examMocks = cache(async (examId: string): Promise<MockListItem[]> => {
  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("mock_tests")
      .select("id, title, duration_minutes, total_questions, total_marks, is_free, mock_templates!inner(exam_id, test_type)")
      .eq("status", "published")
      .eq("mock_templates.exam_id", examId)
      .order("title", { ascending: true })
      .limit(60);
    if (error || !data) return [];
    const rows = data
      .map((m) => {
        const tpl = Array.isArray(m.mock_templates) ? m.mock_templates[0] : m.mock_templates;
        return {
          id: m.id,
          title: m.title,
          testType: tpl?.test_type ?? null,
          questions: num(m.total_questions),
          minutes: num(m.duration_minutes),
          totalMarks: num(m.total_marks),
          isFree: m.is_free === true,
        };
      })
      .filter((m) => m.testType !== "daily_sectional");
    const rank = (t: string | null) => (t === "full_length" ? 0 : 1);
    return rows.sort((a, b) => rank(a.testType) - rank(b.testType));
  } catch {
    return [];
  }
});

export type ExamPageUser =
  | { signedIn: false }
  | { signedIn: true; following: boolean; statuses: Map<string, MockStatus>; drillsDue: boolean };

/** The signed-in student's view of this exam: following?, per-mock status, any mistake drill due. */
export const examPageUser = cache(async (examId: string): Promise<ExamPageUser> => {
  try {
    const supabase = await createServerSupabaseClient();
    const session = await getSessionState(supabase);
    if (session.state !== "user") return { signedIn: false };
    const uid = session.user.id;
    // EXAM-FINALIZE-1 (finalize-on-read): expired in-progress attempts are scored / abandoned before the status read
    await AssessmentService.finalizeExpiredAttempts({ userId: uid, limit: 20 });
    const mocks = await examMocks(examId);
    const [goals, attempts, vault] = await Promise.all([
      supabase.from("user_exam_goals").select("exam_id").eq("user_id", uid).eq("exam_id", examId).eq("is_active", true).limit(1),
      mocks.length
        ? supabase
            .from("test_attempts")
            .select("id, mock_test_id, status, submitted_at, started_at, test_results(total_score, max_score)")
            .eq("user_id", uid)
            .in("mock_test_id", mocks.map((m) => m.id))
            .limit(500)
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from("user_mistake_vault")
        .select("lifecycle_status, total_mistakes_count, consecutive_correct_in_remediation, last_mistake_at, mastered_at")
        .eq("user_id", uid)
        .neq("lifecycle_status", "MASTERED")
        .gte("total_mistakes_count", 1) // F5: manual Memory Lock items are not mistakes
        .limit(200),
    ]);
    const rows: MockAttemptRow[] = (attempts.data ?? []).map((a) => {
      const r = Array.isArray(a.test_results) ? a.test_results[0] : a.test_results;
      return { id: a.id, mockTestId: a.mock_test_id, status: a.status, submittedAt: a.submitted_at, startedAt: a.started_at, score: num(r?.total_score), maxScore: num(r?.max_score) };
    });
    const drillsDue = (vault.data ?? []).some((v) => {
      try {
        const s = calculateRevisionDueState(v).dueState;
        return s === "DUE_NOW" || s === "DUE_REFRESH";
      } catch {
        return false;
      }
    });
    return {
      signedIn: true,
      following: !goals.error && (goals.data?.length ?? 0) > 0,
      statuses: mockStatuses(mocks, rows),
      drillsDue,
    };
  } catch {
    return { signedIn: false };
  }
});

/** The content language of the signed-in user ("en" when signed out or unknown). */
export const userContentLanguage = cache(async (): Promise<ContentLanguage> => {
  try {
    const supabase = await createServerSupabaseClient();
    const session = await getSessionState(supabase);
    if (session.state !== "user") return "en";
    const { data } = await supabase.from("user_profiles").select("language_preference").eq("id", session.user.id).maybeSingle();
    return contentLanguage(data?.language_preference);
  } catch {
    return "en";
  }
});

function num(v: unknown): number | null {
  return v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v);
}
