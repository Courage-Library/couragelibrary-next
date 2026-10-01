import { NextRequest, NextResponse } from 'next/server';
import { AdminService } from '@/services/admin.service';
import { CurrentAffairsValidationService } from '@/services/current-affairs-validation.service';
import { CurrentAffairsImportPayload } from '@/types/current-affairs';

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
    let payload: CurrentAffairsImportPayload;

    if (typeof body.rawPayload === 'string') {
      let clean = body.rawPayload.trim();
      if (clean.startsWith('```')) {
        clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      }
      try {
        payload = JSON.parse(clean);
      } catch (err: any) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'INVALID_JSON',
              message: `Malformed JSON string: ${err.message}`,
            },
          },
          { status: 400 }
        );
      }
    } else {
      payload = body.rawPayload || body;
    }

    const excludeArticleId = body.excludeArticleId || undefined;
    const gateReport = await CurrentAffairsValidationService.validateAllGates(payload, excludeArticleId);

    return NextResponse.json({
      success: true,
      data: {
        passed: gateReport.passed,
        checksumSha256: gateReport.checksumSha256,
        gateReport,
        errors: gateReport.errors,
        warnings: gateReport.warnings,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message || 'Validation execution failed',
        },
      },
      { status: 500 }
    );
  }
}
