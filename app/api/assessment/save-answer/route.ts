import { AssessmentService } from "@/services/assessment.service";
import { NextResponse, type NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { attemptId, mockQuestionId, selectedOption, isMarkedForReview, timeSpentSeconds } = await request.json();
    const success = await AssessmentService.saveAnswer(
      attemptId,
      mockQuestionId,
      selectedOption,
      isMarkedForReview,
      timeSpentSeconds || 0
    );
    return NextResponse.json({ success });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}