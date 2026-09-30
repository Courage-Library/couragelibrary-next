import { NextRequest, NextResponse } from "next/server";
import { AdminService } from "@/services/admin.service";
import {
  OperationalSyllabusReconciliationService,
  OperationalSyllabusReconciliationError,
} from "@/services/operational-syllabus-reconciliation.service";

export async function GET(req: NextRequest) {
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

    const { searchParams } = new URL(req.url);
    const examId = searchParams.get("examId") || undefined;
    const examCycleId = searchParams.get("examCycleId") || undefined;
    const status = (searchParams.get("status") as any) || undefined;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);

    const result = await OperationalSyllabusReconciliationService.listSyllabusVersions({
      examId,
      examCycleId,
      status,
      page,
      limit,
    });

    return NextResponse.json({
      success: true,
      data: result,
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

    console.error("[api/admin/syllabus-reconciliation/versions] Internal error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "An unexpected error occurred while listing syllabus versions.",
        },
      },
      { status: 500 }
    );
  }
}
