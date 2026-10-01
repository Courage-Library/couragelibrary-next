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
    const body = await req.json();
    const { versionId, feedback } = body;

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

    const result = await AdminCurrentAffairsService.requestChanges(id, versionId, feedback || '');
    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'TRANSITION_FAILED',
            message: result.error || 'Failed to request changes',
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
          message: error.message || 'Failed to request changes',
        },
      },
      { status: 500 }
    );
  }
}
