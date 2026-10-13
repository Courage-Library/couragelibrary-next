import { guardAdminRoute, toRouteErrorResponse, sanitizeActionResult } from "@/lib/auth/require-admin";
import { NextRequest, NextResponse } from 'next/server';
import { AdminCurrentAffairsService } from '@/services/admin-current-affairs.service';

export async function GET(req: NextRequest) {
  try {
    const authCheck = await guardAdminRoute({ allowStaff: true });
    if (!authCheck.ok) return authCheck.response;

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const status = searchParams.get('status') || undefined;
    const category = searchParams.get('category') || undefined;
    const importanceTier = searchParams.get('importanceTier') || undefined;
    const search = searchParams.get('search') || undefined;
    const date = searchParams.get('date') || undefined;

    const result = await AdminCurrentAffairsService.getArticlesList({
      page,
      limit,
      status,
      category,
      importanceTier,
      search,
      date,
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    return toRouteErrorResponse("admin/current-affairs/articles GET", error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const authCheck = await guardAdminRoute({ allowStaff: true });
    if (!authCheck.ok) return authCheck.response;

    const body = await req.json();
    const result = await AdminCurrentAffairsService.createManualDraft(body);

    if (!result.success) {
      return NextResponse.json(
        sanitizeActionResult("admin/current-affairs/articles", {
          success: false,
          error: {
            code: 'CREATION_FAILED',
            message: result.error || 'Validation failed for manual draft',
            gateReport: (result as any).gateReport,
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
    return toRouteErrorResponse("admin/current-affairs/articles POST", error);
  }
}
