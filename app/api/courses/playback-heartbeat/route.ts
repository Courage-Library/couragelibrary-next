import { ContentService } from "@/services/content.service";
import { NextResponse, type NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { lessonId, positionSeconds, elapsedRealSeconds } = await request.json();
    const result = await ContentService.updateLessonPlayback(lessonId, positionSeconds, elapsedRealSeconds);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
