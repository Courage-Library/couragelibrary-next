import React from "react";
import { ExamOnboardingService } from "@/services/exam-onboarding/exam-onboarding.service";
import { ExamManagementView } from "@/components/admin/exam-onboarding/exam-management-view";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { listCategoryOptions } from "@/lib/exams/category-admin";
import { visibleBodies } from "@/lib/qa/fixtures";

export const dynamic = "force-dynamic";

export const revalidate = 0;

export default async function AdminExamsPage() {
  const viewer = await requireAdminPage({ allowStaff: true, path: "/admin/exams" });
  const [data, orgs] = await Promise.all([
    ExamOnboardingService.getAdminExamsOverview().catch(() => ({
      exams: [],
      totalExams: 0,
      publishedExams: 0,
      draftExams: 0,
    })),
    ExamOnboardingService.getConductingOrgs().catch(() => []),
  ]);
  const categoryOptions = await listCategoryOptions().catch(() => []);

  return (
    <ExamManagementView
      initialExams={data.exams}
      totalExams={data.totalExams}
      publishedExams={data.publishedExams}
      draftExams={data.draftExams}
      conductingOrgs={visibleBodies(orgs, viewer.userEmail)}
      canEditLogos={viewer.role === "admin"}
      categoryOptions={categoryOptions}
    />
  );
}
