import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AdaptiveSessionService } from "@/services/adaptive/adaptive-session.service";
import { AdaptiveEngineError, AdaptiveStepSubmitRequest } from "@/services/adaptive/adaptive-types";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized access. Authentication required.",
          errorCode: "UNAUTHORIZED_ATTEMPT_ACCESS",
        },
        { status: 401 }
      );
    }

    const body = (await request.json()) as AdaptiveStepSubmitRequest;

    if (!body || !body.attemptId || typeof body.stepNumber !== "number") {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request payload. 'attemptId' and 'stepNumber' are required.",
          errorCode: "INVALID_ANSWER_PAYLOAD",
        },
        { status: 400 }
      );
    }

    const result = await AdaptiveSessionService.processAdaptiveStepSubmission(
      user.id,
      body,
      supabase
    );

    return NextResponse.json(result, { status: 200 });
  } catch (err: unknown) {
    if (err instanceof AdaptiveEngineError) {
      let status = 400;
      if (err.code === "UNAUTHORIZED_ATTEMPT_ACCESS" || err.code === "PREMIUM_ACCESS_DENIED" || err.code === "QUOTA_EXHAUSTED") {
        status = 403;
      } else if (err.code === "ATTEMPT_NOT_FOUND" || err.code === "QUESTION_NOT_FOUND" || err.code === "CONFIG_NOT_FOUND") {
        status = 404;
      } else if (err.code === "INTERNAL_ADAPTIVE_ERROR") {
        status = 500;
      }

      return NextResponse.json(
        {
          success: false,
          error: err.message,
          errorCode: err.code,
          details: err.details,
        },
        { status }
      );
    }

    const message = err instanceof Error ? err.message : "Internal Adaptive Engine Error";
    return NextResponse.json(
      {
        success: false,
        error: message,
        errorCode: "INTERNAL_ADAPTIVE_ERROR",
      },
      { status: 500 }
    );
  }
}
