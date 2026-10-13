import React from "react";
import { AdminQuestionFactoryService } from "@/services/question-factory/admin-question-factory.service";
import { QuestionFactoryStudio } from "@/components/admin/question-factory/question-factory-studio";
import { requireAdminPage } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

export const revalidate = 0;

export default async function AdminQuestionFactoryPage() {
  await requireAdminPage({ allowStaff: true, path: "/admin/questions/factory" });
  const taxonomy = await AdminQuestionFactoryService.getTaxonomyTree();

  return (
    <QuestionFactoryStudio
      taxonomy={
        taxonomy.success && taxonomy.data
          ? taxonomy.data
          : { subjects: [], topics: [], subtopics: [], exams: [] }
      }
      taxonomyError={taxonomy.success ? null : taxonomy.error || "Unable to load taxonomy."}
    />
  );
}
