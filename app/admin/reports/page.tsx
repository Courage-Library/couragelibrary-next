import React from "react";
import { AdminService } from "@/services/admin.service";
import { AdminQuestionReportsManager, AdminQuestionReportItem } from "@/components/admin/admin-question-reports-manager";
import { Container } from "@/components/ui/container";

export const metadata = {
  title: "Question Reports & Errata | Admin Studio",
};

export default async function AdminReportsPage() {
  const initialReports = await AdminService.getQuestionReports();

  return (
    <Container className="py-8 space-y-6 max-w-7xl">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Question Reports &amp; Errata</h1>
        <p className="text-xs text-slate-500 font-medium mt-1">
          Review candidate-reported question issues, typos, disputed answer keys, and resolution workflows.
        </p>
      </div>

      <AdminQuestionReportsManager initialReports={initialReports as unknown as AdminQuestionReportItem[]} />
    </Container>
  );
}
