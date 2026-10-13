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
    const body = await req.json();
    const { versionId } = body;

    if (!versionId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'BAD_REQUEST',
            message: 'versionId is required.',
          },
        },
        { status: 400 }
      );
    }

    const result = await AdminCurrentAffairsService.compileAndPublish(id, versionId);
    if (!result.success) {
      return NextResponse.json(
        sanitizeActionResult("admin/current-affairs/articles/[id]/publish", {
          success: false,
          error: {
            code: 'PUBLISH_FAILED',
            message: result.error || 'Failed to publish version',
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
    return toRouteErrorResponse("admin/current-affairs/articles/[id]/publish POST", error);
  }
}
