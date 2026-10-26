import React from "react";
import { AdminService } from "@/services/admin.service";
import { AdminQuestionReportsManager, AdminQuestionReportItem } from "@/components/admin/admin-question-reports-manager";
import { Container } from "@/components/ui/legacy/container";
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
    <Container className="py-8 space-y-6 max-w-7xl">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Question Reports</h1>
        <p className="text-xs text-slate-500 font-medium mt-1">
          Reports from students: wrong answer key, typo or unclear wording, translation error, or something else.
        </p>
      </div>

      <AdminQuestionReportsManager initialReports={initialReports as unknown as AdminQuestionReportItem[]} initialStatus={initialStatus} />
    </Container>
  );
}
