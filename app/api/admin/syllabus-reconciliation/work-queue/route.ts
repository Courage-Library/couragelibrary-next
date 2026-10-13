import { guardAdminRoute, toRouteErrorResponse } from "@/lib/auth/require-admin";
import { NextRequest, NextResponse } from "next/server";
import {
  OperationalSyllabusReconciliationService,
  OperationalSyllabusReconciliationError,
} from "@/services/operational-syllabus-reconciliation.service";

export async function GET(req: NextRequest) {
  try {
    const authCheck = await guardAdminRoute({ allowStaff: true });
    if (!authCheck.ok) return authCheck.response;

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
      return toRouteErrorResponse("admin/syllabus-reconciliation/work-queue GET", error);
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
