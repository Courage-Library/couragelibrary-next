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
    const syllabusVersionId = searchParams.get("syllabusVersionId") || undefined;
    const priority = (searchParams.get("priority") as any) || undefined;
    const readinessState = (searchParams.get("readinessState") as any) || undefined;
    const isMandatoryParam = searchParams.get("isMandatory");
    const isMandatory =
      isMandatoryParam !== null
        ? isMandatoryParam === "true" || isMandatoryParam === "1"
        : undefined;
    const subjectId = searchParams.get("subjectId") || undefined;
    const search = searchParams.get("search") || undefined;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);

    const result = await OperationalSyllabusReconciliationService.getWorkQueue({
      syllabusVersionId,
      priority,
      readinessState,
      isMandatory,
      subjectId,
      search,
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

    console.error("[api/admin/syllabus-reconciliation/work-queue] Internal error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "An unexpected error occurred while querying the taxonomy work queue.",
        },
      },
      { status: 500 }
    );
  }
}
