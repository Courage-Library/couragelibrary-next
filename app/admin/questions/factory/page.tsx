import React from "react";
import { AdminQuestionFactoryService } from "@/services/question-factory/admin-question-factory.service";
import { QuestionFactoryStudio } from "@/components/admin/question-factory/question-factory-studio";

export const revalidate = 0;

export default async function AdminQuestionFactoryPage() {
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
