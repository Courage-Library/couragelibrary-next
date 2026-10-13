import { featureDisabledApiResponse } from "@/lib/features/gates";
import { ContentService } from "@/services/content.service";
import { NextResponse, type NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  // GAP2-2b: dormant behind FEATURE_COURSES (gate first, before auth/DB)
  const disabled = featureDisabledApiResponse("COURSES");
  if (disabled) return disabled;
  try {
    const { lessonId, positionSeconds, elapsedRealSeconds } = await request.json();
    const result = await ContentService.updateLessonPlayback(lessonId, positionSeconds, elapsedRealSeconds);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
