import { guardAdminRoute, toRouteErrorResponse } from "@/lib/auth/require-admin";
import { NextResponse } from 'next/server';
import { AdminCurrentAffairsService } from '@/services/admin-current-affairs.service';

export async function GET() {
  try {
    const authCheck = await guardAdminRoute({ allowStaff: true });
    if (!authCheck.ok) return authCheck.response;

    const stats = await AdminCurrentAffairsService.getDashboardStats();
    return NextResponse.json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    return toRouteErrorResponse("admin/current-affairs/stats GET", error);
  }
}
