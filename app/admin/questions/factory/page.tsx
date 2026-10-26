import React from "react";
import { AdminQuestionFactoryService } from "@/services/question-factory/admin-question-factory.service";
import { QuestionFactoryStudio } from "@/components/admin/question-factory/question-factory-studio";
import { requireAdminPage } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

export const revalidate = 0;

const LIFECYCLE = ["DRAFT", "IN_REVIEW", "CHANGES_REQUESTED", "APPROVED", "PUBLISHED", "REJECTED"];

export default async function AdminQuestionFactoryPage({ searchParams }: { searchParams: Promise<{ tab?: string; status?: string }> }) {
  await requireAdminPage({ allowStaff: true, path: "/admin/questions/factory" });
  const sp = await searchParams;
  const taxonomy = await AdminQuestionFactoryService.getTaxonomyTree();
  // ADMIN-UX-1 phase B: Today deep link — only known values are accepted (initial UI state, no query change)
  const initialTab = sp.tab === "review" || sp.tab === "import" || sp.tab === "coverage" ? sp.tab : "generate";
  const initialStatus = LIFECYCLE.includes(String(sp.status)) ? String(sp.status) : "";

  return (
    <QuestionFactoryStudio
      taxonomy={
        taxonomy.success && taxonomy.data
          ? taxonomy.data
          : { subjects: [], topics: [], subtopics: [], exams: [] }
      }
      taxonomyError={taxonomy.success ? null : taxonomy.error || "Unable to load taxonomy."}
      initialTab={initialTab}
      initialStatus={initialStatus}
    />
  );
}
