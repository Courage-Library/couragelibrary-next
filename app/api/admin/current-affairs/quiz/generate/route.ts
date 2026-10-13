import { guardAdminRoute, toRouteErrorResponse } from "@/lib/auth/require-admin";
import { NextRequest, NextResponse } from 'next/server';
import { CurrentAffairsDailyQuizService } from '@/services/current-affairs-daily-quiz.service';

export async function POST(request: NextRequest) {
  try {
    const auth = await guardAdminRoute({ allowStaff: true });
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const date = body?.date || new Date().toISOString().slice(0, 10);

    const result = await CurrentAffairsDailyQuizService.generateDailyQuiz(date, auth.userId);
    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (e: any) {
    return toRouteErrorResponse("admin/current-affairs/quiz/generate POST", e);
  }
}
