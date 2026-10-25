import { AssessmentService } from "@/services/assessment.service";
import { sanitizePosition } from "@/lib/assessment/position";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Q6 part B (099): the player reports the question it shows and the questions visited, so a reload on any device
 * resumes from the server. 200 { success: true } · 409 ATTEMPT_CLOSED (submitted / not own) · 400 INVALID_INPUT ·
 * 503 SAVE_FAILED. Fixed codes only, never error text. Never decides time or answers.
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, code: "INVALID_INPUT" }, { status: 400 });
  }
  const position = sanitizePosition(body.order, body.visited);
  if (typeof body.attemptId !== "string" || !position) {
    return NextResponse.json({ success: false, code: "INVALID_INPUT" }, { status: 400 });
  }
  try {
    const result = await AssessmentService.saveAttemptPosition(body.attemptId, position);
    if (result === "ok") return NextResponse.json({ success: true });
    if (result === "closed") return NextResponse.json({ success: false, code: "ATTEMPT_CLOSED" }, { status: 409 });
    return NextResponse.json({ success: false, code: "SAVE_FAILED" }, { status: 503 });
  } catch {
    return NextResponse.json({ success: false, code: "SAVE_FAILED" }, { status: 503 });
  }
}
