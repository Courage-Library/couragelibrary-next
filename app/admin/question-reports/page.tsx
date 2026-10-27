import React from "react";
import { AdminService } from "@/services/admin.service";
import { AdminQuestionReportsManager, AdminQuestionReportItem } from "@/components/admin/admin-question-reports-manager";
import { StudioPageHeader } from "@/components/admin/studio/studio-page";
import { requireAdminPage } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Question Reports | Admin Studio",
};

/**
 * F2 (#79): "Report this question" review list — ADMIN ONLY (reports are never shown to other users; staff no longer
 * read them — /admin/reports redirects here). Data: question_errata_reports via the service-role AdminService.
 */
const REPORT_STATUSES = ["OPEN", "UNDER_REVIEW", "VERIFIED", "RESOLVED", "REJECTED"];

export default async function AdminQuestionReportsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireAdminPage({ path: "/admin/question-reports" });
  const sp = await searchParams;
  const initialReports = await AdminService.getQuestionReports();
  // ADMIN-UX-1 phase B: Today deep link (?status=OPEN) — initial filter only
  const initialStatus = REPORT_STATUSES.includes(String(sp.status)) ? String(sp.status) : "ALL";

  return (
    <div className="flex flex-col gap-4">
      <StudioPageHeader title="Question reports" description="Students report a wrong key, a typo, unclear wording or a translation problem. Open one to check and close it." />
      <AdminQuestionReportsManager initialReports={initialReports as unknown as AdminQuestionReportItem[]} initialStatus={initialStatus} />
    </div>
  );
}
