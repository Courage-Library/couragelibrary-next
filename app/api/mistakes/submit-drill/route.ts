import { MistakeService } from "@/services/mistake.service";
import { NextResponse, type NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { drillId, answers } = await request.json();
    const result = await MistakeService.submitMistakeDrill(drillId, answers);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}