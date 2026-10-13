import { guardAdminRoute, toRouteErrorResponse, sanitizeActionResult } from "@/lib/auth/require-admin";
import { NextRequest, NextResponse } from 'next/server';
import { AdminCurrentAffairsService } from '@/services/admin-current-affairs.service';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authCheck = await guardAdminRoute({ allowStaff: true });
    if (!authCheck.ok) return authCheck.response;

    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const versionId = searchParams.get('versionId') || undefined;

    const detail = await AdminCurrentAffairsService.getArticleDetail(id, versionId);
    if (!detail) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Current affair article or version not found',
          },
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: detail,
    });
  } catch (error: any) {
    return toRouteErrorResponse("admin/current-affairs/articles/[id] GET", error);
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authCheck = await guardAdminRoute({ allowStaff: true });
    if (!authCheck.ok) return authCheck.response;

    const { id } = await params;
    const body = await req.json();
    const { versionId, ...payload } = body;

    if (!versionId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'BAD_REQUEST',
            message: 'versionId is required to save a draft.',
          },
        },
        { status: 400 }
      );
    }

    const result = await AdminCurrentAffairsService.saveDraft(id, versionId, payload);
    if (!result.success) {
      return NextResponse.json(
        sanitizeActionResult("admin/current-affairs/articles/[id]", {
          success: false,
          error: {
            code: 'SAVE_FAILED',
            message: result.error || 'Failed to save draft edits',
            errors: result.errors,
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
    return toRouteErrorResponse("admin/current-affairs/articles/[id] PUT", error);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authCheck = await guardAdminRoute({ allowStaff: true });
    if (!authCheck.ok) return authCheck.response;

    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const versionId = searchParams.get('versionId');

    if (!versionId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'BAD_REQUEST',
            message: 'versionId is required to discard a draft.',
          },
        },
        { status: 400 }
      );
    }

    const result = await AdminCurrentAffairsService.discardDraft(id, versionId);
    if (!result.success) {
      return NextResponse.json(
        sanitizeActionResult("admin/current-affairs/articles/[id]", {
          success: false,
          error: {
            code: 'DISCARD_FAILED',
            message: result.error || 'Failed to discard draft',
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
    return toRouteErrorResponse("admin/current-affairs/articles/[id] DELETE", error);
  }
}
