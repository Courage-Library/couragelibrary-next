import React from "react";
import { ExamOnboardingService } from "@/services/exam-onboarding/exam-onboarding.service";
import { ExamManagementView } from "@/components/admin/exam-onboarding/exam-management-view";

export const revalidate = 0;

export default async function AdminExamsPage() {
  const data = await ExamOnboardingService.getAdminExamsOverview().catch(() => ({
    exams: [],
    totalExams: 0,
    publishedExams: 0,
    draftExams: 0,
  }));

  return (
    <ExamManagementView
      initialExams={data.exams}
      totalExams={data.totalExams}
      publishedExams={data.publishedExams}
      draftExams={data.draftExams}
    />
  );
}
