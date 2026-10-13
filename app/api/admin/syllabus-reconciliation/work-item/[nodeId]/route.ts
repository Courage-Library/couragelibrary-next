import { guardAdminRoute, toRouteErrorResponse } from "@/lib/auth/require-admin";
import { NextRequest, NextResponse } from "next/server";
import {
  OperationalSyllabusReconciliationService,
  OperationalSyllabusReconciliationError,
} from "@/services/operational-syllabus-reconciliation.service";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ nodeId: string }> }
) {
  try {
    const authCheck = await guardAdminRoute({ allowStaff: true });
    if (!authCheck.ok) return authCheck.response;

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
      return toRouteErrorResponse("admin/syllabus-reconciliation/work-item/[nodeId] GET", error);
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
