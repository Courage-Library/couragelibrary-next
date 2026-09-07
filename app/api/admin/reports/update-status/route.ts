import { NextRequest, NextResponse } from "next/server";
import { AdminService } from "@/services/admin.service";

export async function POST(req: NextRequest) {
  try {
    const authCheck = await AdminService.checkIsAdminOrStaff();
    if (!authCheck.isAdmin) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });
    }

    const body = await req.json();
    const { reportId, status, resolutionNotes } = body;

    if (!reportId || !status) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
    }

    const success = await AdminService.updateQuestionReportStatus(reportId, status, resolutionNotes);
    return NextResponse.json({ success });
  } catch (error) {
    console.error("[admin/reports/update-status] Handler error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
