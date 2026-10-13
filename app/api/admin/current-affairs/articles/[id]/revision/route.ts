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

    const result = await AdminCurrentAffairsService.createRevision(id);
    if (!result.success) {
      return NextResponse.json(
        sanitizeActionResult("admin/current-affairs/articles/[id]/revision", {
          success: false,
          error: {
            code: 'REVISION_FAILED',
            message: result.error || 'Failed to create revision',
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
    return toRouteErrorResponse("admin/current-affairs/articles/[id]/revision POST", error);
  }
}
