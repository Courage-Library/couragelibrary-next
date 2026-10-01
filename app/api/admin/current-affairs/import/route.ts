import { NextRequest, NextResponse } from 'next/server';
import { AdminService } from '@/services/admin.service';
import { CurrentAffairsImportService } from '@/services/current-affairs-import.service';

export async function POST(req: NextRequest) {
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

    const body = await req.json();
    const rawPayload = body.rawPayload || body;

    const result = await CurrentAffairsImportService.importDraft(rawPayload, authCheck.userId);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'IMPORT_REJECTED',
            message: result.error || 'Import failed validation gates',
            gateReport: result.gateReport,
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
          message: error.message || 'Failed to process external import',
        },
      },
      { status: 500 }
    );
  }
}
