import { NextRequest, NextResponse } from "next/server";
import { AdminService } from "@/services/admin.service";
import {
  OperationalSyllabusReconciliationService,
  OperationalSyllabusReconciliationError,
} from "@/services/operational-syllabus-reconciliation.service";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ nodeId: string }> }
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

    const { nodeId } = await context.params;
    const { searchParams } = new URL(req.url);
    const syllabusVersionId = searchParams.get("syllabusVersionId");

    if (!nodeId || !syllabusVersionId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_INPUT",
            message: "nodeId in path and syllabusVersionId in query are required.",
          },
        },
        { status: 400 }
      );
    }

    const detail = await OperationalSyllabusReconciliationService.getWorkItemDetail({
      syllabusVersionId,
      syllabusNodeId: nodeId,
    });

    return NextResponse.json({
      success: true,
      data: detail,
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

    console.error("[api/admin/syllabus-reconciliation/work-item/[nodeId]] Internal error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "An unexpected error occurred while retrieving work item details.",
        },
      },
      { status: 500 }
    );
  }
}
