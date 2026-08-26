import React from "react";
import { AdminService } from "@/services/admin.service";
import { AdminQuestionManager } from "@/components/admin/admin-question-manager";

export const revalidate = 0;

export default async function AdminQuestionsPage() {
  const questions = await AdminService.getAdminQuestions();

  return <AdminQuestionManager questions={questions} />;
}
