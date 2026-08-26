import React from "react";
import { AdminService } from "@/services/admin.service";
import { AdminQuestionManager } from "@/components/admin/admin-question-manager";

export const revalidate = 0;

export default async function AdminQuestionsPage() {
  const data = await AdminService.getAdminQuestionsWithHierarchy();

  return (
    <AdminQuestionManager
      questions={data.questions}
      taxonomy={data.taxonomy}
      kpis={data.kpis}
    />
  );
}
