import { guardAdminRoute, toRouteErrorResponse, sanitizeActionResult } from "@/lib/auth/require-admin";
import { NextRequest, NextResponse } from 'next/server';
import { AdminCurrentAffairsService } from '@/services/admin-current-affairs.service';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authCheck = await guardAdminRoute({ allowStaff: true });
    if (!authCheck.ok) return authCheck.response;

    const { id } = await params;

    const result = await AdminCurrentAffairsService.archiveItem(id);
    if (!result.success) {
      return NextResponse.json(
        sanitizeActionResult("admin/current-affairs/articles/[id]/archive", {
          success: false,
          error: {
            code: 'ARCHIVE_FAILED',
            message: result.error || 'Failed to archive article',
          },
        }),
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    return toRouteErrorResponse("admin/current-affairs/articles/[id]/archive POST", error);
  }
}
