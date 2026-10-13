import { guardAdminRoute, toRouteErrorResponse } from "@/lib/auth/require-admin";
import { NextRequest, NextResponse } from 'next/server';
import { CurrentAffairsDailyQuizService } from '@/services/current-affairs-daily-quiz.service';

export async function GET(request: NextRequest) {
  try {
    const auth = await guardAdminRoute({ allowStaff: true });
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') || new Date().toISOString().slice(0, 10);

    const report = await CurrentAffairsDailyQuizService.calculateEligibility(date);
    return NextResponse.json({ success: true, report });
  } catch (e: any) {
    return toRouteErrorResponse("admin/current-affairs/quiz/eligibility GET", e);
  }
}
