import { guardAdminRoute, toRouteErrorResponse } from "@/lib/auth/require-admin";
import { NextRequest, NextResponse } from "next/server";
import {
  OperationalSyllabusReconciliationService,
  OperationalSyllabusReconciliationError,
} from "@/services/operational-syllabus-reconciliation.service";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ versionId: string }> }
) {
  try {
    const authCheck = await guardAdminRoute({ allowStaff: true });
    if (!authCheck.ok) return authCheck.response;

    const { versionId } = await context.params;
    if (!versionId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_INPUT",
            message: "versionId parameter is required",
          },
        },
        { status: 400 }
      );
    }

    const report = await OperationalSyllabusReconciliationService.getSyllabusVersionDetail(
      versionId
    );

    return NextResponse.json({
      success: true,
      data: report,
    });
  } catch (error: any) {
    if (error instanceof OperationalSyllabusReconciliationError) {
      return toRouteErrorResponse("admin/syllabus-reconciliation/versions/[versionId] GET", error);
    }

    console.error("[api/admin/syllabus-reconciliation/versions/[versionId]] Internal error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "An unexpected error occurred while retrieving syllabus version details.",
        },
      },
      { status: 500 }
    );
  }
}
