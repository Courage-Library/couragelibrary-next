import { NextRequest, NextResponse } from 'next/server';
import { AdminService } from '@/services/admin.service';
import { CurrentAffairsDailyQuizService } from '@/services/current-affairs-daily-quiz.service';

export async function POST(request: NextRequest) {
  try {
    const auth = await AdminService.checkIsAdminOrStaff();
    if (!auth.isAdmin) {
      return NextResponse.json({ error: 'UNAUTHORIZED: Admin privileges required.' }, { status: 403 });
    }

    const body = await request.json();
    const date = body?.date || new Date().toISOString().slice(0, 10);

    const result = await CurrentAffairsDailyQuizService.generateDailyQuiz(date, auth.userId);
    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Internal server error' }, { status: 500 });
  }
}
