import { guardAdminRoute, toRouteErrorResponse } from "@/lib/auth/require-admin";
import { NextRequest, NextResponse } from 'next/server';
import { CurrentAffairsValidationService } from '@/services/current-affairs-validation.service';
import { CurrentAffairsImportPayload } from '@/types/current-affairs';

export async function POST(req: NextRequest) {
  try {
    const authCheck = await guardAdminRoute({ allowStaff: true });
    if (!authCheck.ok) return authCheck.response;

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
        return toRouteErrorResponse("admin/current-affairs/validate POST", err);
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
    return toRouteErrorResponse("admin/current-affairs/validate POST", error);
  }
}
