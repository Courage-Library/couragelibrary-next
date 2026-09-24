import React from "react";
import { AdminExamKnowledgeService } from "@/services/exam-knowledge/admin-exam-knowledge.service";
import { ExamKnowledgeStudioView } from "@/components/admin/exam-knowledge/exam-knowledge-studio-view";

export const revalidate = 0;

interface PageProps {
  searchParams?: Promise<{ examId?: string; cycleId?: string; tab?: string }>;
}

export default async function AdminExamKnowledgePage({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : {};
  const [kpis, examsData] = await Promise.all([
    AdminExamKnowledgeService.getDashboardKPIs().catch(() => ({
      totalExams: 0,
      activeExams: 0,
      activeCycles: 0,
      totalDocuments: 0,
      draftsAwaitingReview: 0,
      publishedDocuments: 0,
      unverifiedSources: 0,
      claimsRequiringReview: 0,
    })),
    AdminExamKnowledgeService.getExamsAndCycles().catch(() => ({ exams: [] })),
  ]);

  return (
    <ExamKnowledgeStudioView
      initialKpis={kpis}
      initialExams={examsData.exams || []}
      initialSelectedExamId={params?.examId}
      initialSelectedCycleId={params?.cycleId}
      initialTab={params?.tab as any}
    />
  );
}
