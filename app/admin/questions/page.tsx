import React from "react";
import { AdminService } from "@/services/admin.service";
import { AdminQuestionManager } from "@/components/admin/admin-question-manager";
import { requireAdminPage } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

export const revalidate = 0;

interface Props {
  searchParams: Promise<{
    category?: string;
    pattern?: string;
    section?: string;
    topic?: string;
    question?: string;
  }>;
}

export default async function AdminQuestionsPage({ searchParams }: Props) {
  await requireAdminPage({ allowStaff: true, path: "/admin/questions" });
  const params = await searchParams;
  const data = await AdminService.getAdminQuestionsWithHierarchy();

  return (
    <AdminQuestionManager
      questions={data.questions}
      taxonomy={data.taxonomy}
      kpis={data.kpis}
      initialCategory={params.category}
      initialPattern={params.pattern}
      initialSection={params.section}
      initialTopic={params.topic}
      initialQuestionId={params.question}
    />
  );
}
