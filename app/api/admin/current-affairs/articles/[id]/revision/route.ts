import { NextRequest, NextResponse } from 'next/server';
import { AdminService } from '@/services/admin.service';
import { AdminCurrentAffairsService } from '@/services/admin-current-affairs.service';

export async function POST(
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

    const result = await AdminCurrentAffairsService.createRevision(id);
    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'REVISION_FAILED',
            message: result.error || 'Failed to create revision',
          },
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message || 'Failed to create revision',
        },
      },
      { status: 500 }
    );
  }
}
