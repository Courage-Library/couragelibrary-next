import { NextRequest, NextResponse } from 'next/server';
import { AdminService } from '@/services/admin.service';
import { AdminCurrentAffairsService } from '@/services/admin-current-affairs.service';

export async function GET(req: NextRequest) {
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
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message || 'Failed to fetch current affairs articles list',
        },
      },
      { status: 500 }
    );
  }
}

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
    const result = await AdminCurrentAffairsService.createManualDraft(body);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'CREATION_FAILED',
            message: result.error || 'Validation failed for manual draft',
            gateReport: (result as any).gateReport,
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
          message: error.message || 'Failed to create manual draft',
        },
      },
      { status: 500 }
    );
  }
}
