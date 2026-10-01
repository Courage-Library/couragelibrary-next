import { NextRequest, NextResponse } from 'next/server';
import { AdminService } from '@/services/admin.service';
import { AdminCurrentAffairsService } from '@/services/admin-current-affairs.service';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authCheck = await AdminService.checkIsAdminOrStaff();
    if (!authCheck.isAdmin || !authCheck.userId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'You do not have administrative permissions to access this endpoint.',
          },
        },
        { status: 403 }
      );
    }

    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const v1 = parseInt(searchParams.get('v1') || '1', 10);
    const v2 = parseInt(searchParams.get('v2') || '2', 10);

    const diff = await AdminCurrentAffairsService.compareVersions(id, v1, v2);
    if (!diff) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'One or both versions not found for comparison.',
          },
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: diff,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message || 'Failed to compare versions',
        },
      },
      { status: 500 }
    );
  }
}
