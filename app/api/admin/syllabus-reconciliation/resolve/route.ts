import { guardAdminRoute, toRouteErrorResponse } from "@/lib/auth/require-admin";
import { NextRequest, NextResponse } from "next/server";
import {
  OperationalSyllabusReconciliationService,
  OperationalSyllabusReconciliationError,
} from "@/services/operational-syllabus-reconciliation.service";

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate & Authorize via authoritative server session
    const authCheck = await guardAdminRoute({ allowStaff: true });
    if (!authCheck.ok) return authCheck.response;

    // 2. Parse & Validate Payload Schema
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_INPUT",
            message: "Invalid JSON request body.",
          },
        },
        { status: 400 }
      );
    }

    const {
      syllabusVersionId,
      syllabusNodeId,
      action,
      expectedState,
      canonicalNodeId,
      targetParentId,
      newNodeName,
      newNodeSlug,
      newNodeType,
      aliasName,
      aliasContext,
      notes,
      subtreeNodes,
    } = body;

    if (!syllabusVersionId || !syllabusNodeId || !action) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_INPUT",
            message: "syllabusVersionId, syllabusNodeId, and action are required fields.",
          },
        },
        { status: 400 }
      );
    }

    // 3. Execute Resolution Action with Server-Derived Reviewer Identity (authCheck.userId)
    // Client-supplied reviewerId / userId / role are strictly ignored!
    const result = await OperationalSyllabusReconciliationService.resolveWorkItem({
      payload: {
        syllabusVersionId,
        syllabusNodeId,
        action,
        expectedState,
        canonicalNodeId,
        targetParentId,
        newNodeName,
        newNodeSlug,
        newNodeType,
        aliasName,
        aliasContext,
        notes,
        subtreeNodes,
      },
      reviewerUserId: authCheck.userId,
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    if (error instanceof OperationalSyllabusReconciliationError) {
      return toRouteErrorResponse("admin/syllabus-reconciliation/resolve POST", error);
    }

    console.error("[api/admin/syllabus-reconciliation/resolve] Internal error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "An unexpected error occurred during taxonomy resolution.",
        },
      },
      { status: 500 }
    );
  }
}
