import { NextRequest, NextResponse } from "next/server";
import { AdminService } from "@/services/admin.service";
import {
  OperationalSyllabusReconciliationService,
  OperationalSyllabusReconciliationError,
} from "@/services/operational-syllabus-reconciliation.service";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ versionId: string }> }
) {
  try {
    const authCheck = await AdminService.checkIsAdminOrStaff();
    if (!authCheck.isAdmin || !authCheck.userId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "You do not have administrative permissions to access this endpoint.",
          },
        },
        { status: 403 }
      );
    }

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
      return NextResponse.json(
        {
          success: false,
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
          },
        },
        { status: error.statusCode }
      );
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
