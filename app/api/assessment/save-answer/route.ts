import { AssessmentService } from "@/services/assessment.service";
import { NextResponse, type NextRequest } from "next/server";

/**
 * F3 (R7): the answer is "saved" only when the server says so — 200 { success: true }. A failed write is NEVER a 200:
 * 409 ATTEMPT_CLOSED (submitted / time over — the player stops retrying), 503 SAVE_FAILED (the player keeps the
 * answer on the device and retries with backoff), 400 INVALID_INPUT. Fixed codes only, never error text.
 */
const KEYS = new Set(["A", "B", "C", "D"]);

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, code: "INVALID_INPUT" }, { status: 400 });
  }
  const { attemptId, mockQuestionId, selectedOption, isMarkedForReview, timeSpentSeconds } = body;
  if (typeof attemptId !== "string" || typeof mockQuestionId !== "string" || (selectedOption !== null && !KEYS.has(String(selectedOption)))) {
    return NextResponse.json({ success: false, code: "INVALID_INPUT" }, { status: 400 });
  }
  try {
    const result = await AssessmentService.saveAnswer(
      attemptId,
      mockQuestionId,
      (selectedOption as string | null) ?? null,
      isMarkedForReview === true,
      Math.max(0, Math.round(Number(timeSpentSeconds) || 0)),
    );
    if (result === "ok") return NextResponse.json({ success: true });
    if (result === "closed") return NextResponse.json({ success: false, code: "ATTEMPT_CLOSED" }, { status: 409 });
    return NextResponse.json({ success: false, code: "SAVE_FAILED" }, { status: 503 });
  } catch {
    return NextResponse.json({ success: false, code: "SAVE_FAILED" }, { status: 503 });
  }
}
