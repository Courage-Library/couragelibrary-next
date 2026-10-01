import { NextRequest, NextResponse } from 'next/server';
import { AdminService } from '@/services/admin.service';
import { CurrentAffairsDailyQuizService } from '@/services/current-affairs-daily-quiz.service';

export async function GET(request: NextRequest) {
  try {
    const auth = await AdminService.checkIsAdminOrStaff();
    if (!auth.isAdmin) {
      return NextResponse.json({ error: 'UNAUTHORIZED: Admin privileges required.' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') || new Date().toISOString().slice(0, 10);

    const report = await CurrentAffairsDailyQuizService.calculateEligibility(date);
    return NextResponse.json({ success: true, report });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Internal server error' }, { status: 500 });
  }
}
