import "server-only";

/**
 * F7 (R12): the Daily 10Q card states only facts read from its PUBLISHED mock — question count, duration, total marks —
 * never hard-coded numbers. Public, read-only (published mocks are public); any failure → null and the card shows no
 * figures rather than guessed ones.
 */
import { createPublicServerSupabaseClient } from "@/lib/supabase/server";

export type DailyQuizShape = { totalQuestions: number; durationMinutes: number; totalMarks: number };

const ID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function dailyQuizShape(mockTestId: string | null | undefined): Promise<DailyQuizShape | null> {
  if (!mockTestId || !ID_RX.test(mockTestId)) return null;
  try {
    // PAY-1 B2b (145): clients lose direct reads of mock_tests — the narrow public read (figures of ONE published,
    // non-dynamic mock; no row otherwise), through the public client
    const sb = createPublicServerSupabaseClient();
    const { data: rows } = await sb.rpc("fn_public_mock_shape", { p_mock_test_id: mockTestId });
    const data = Array.isArray(rows) ? rows[0] : null;
    if (!data) return null;
    const shape = { totalQuestions: Number(data.total_questions), durationMinutes: Number(data.duration_minutes), totalMarks: Number(data.total_marks) };
    return Object.values(shape).every((n) => Number.isFinite(n) && n > 0) ? shape : null;
  } catch {
    return null;
  }
}
