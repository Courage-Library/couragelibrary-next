import React from "react";
import { createAdminServerSupabaseClient } from "@/lib/supabase/server";
import { ExamOnboardingService } from "@/services/exam-onboarding/exam-onboarding.service";
import { ExamReadinessService, ExamReadinessReport } from "@/services/exam-onboarding/exam-readiness.service";
import { ExamOnboardingWizard } from "@/components/admin/exam-onboarding/exam-onboarding-wizard";

export const revalidate = 0;

interface Props {
  searchParams: Promise<{ examId?: string; cycleId?: string }>;
}

export default async function AdminExamOnboardingPage({ searchParams }: Props) {
  const resolvedParams = await searchParams;
  const examId = resolvedParams.examId;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminServerSupabaseClient() as any;

  const orgs = await ExamOnboardingService.getConductingOrgs(supabase);
  const taxonomy = await ExamOnboardingService.getCanonicalTaxonomy(supabase);

  let initialExam: any = null;
  let activeCycle: any = null;
  let posts: any[] = [];
  let selectedTopicIds: string[] = [];
  let knowledgeModules: any[] = [];
  let readinessReport: ExamReadinessReport = {
    status: 'NOT_STARTED',
    examId: examId || '',
    cycleId: null,
    examTitle: 'New Examination',
    examSlug: '',
    isActive: false,
    isPublishable: false,
    readinessScore: 0,
    blockingIssuesCount: 1,
    warningsCount: 0,
    blockingIssues: [],
    warnings: [],
    completedChecks: [],
    dimensionBreakdown: {} as any,
    evaluatedAt: new Date().toISOString(),
  };

  if (examId) {
    const [examRes, cyclesRes, postsRes, examTopicsRes, modules, report] = await Promise.all([
      supabase.from("exams").select("*").eq("id", examId).maybeSingle(),
      supabase.from("exam_cycles").select("*").eq("exam_id", examId).order("cycle_year", { ascending: false }),
      supabase.from("exam_posts").select("*").eq("exam_id", examId).eq("is_active", true),
      supabase.from("exam_topics").select("topic_id").eq("exam_id", examId).eq("is_active", true),
      ExamOnboardingService.getKnowledgeStatusMatrix(examId, resolvedParams.cycleId, supabase),
      ExamReadinessService.evaluateReadiness(examId, resolvedParams.cycleId, supabase),
    ]);

    if (examRes.data) {
      initialExam = {
        id: examRes.data.id,
        title: examRes.data.title,
        slug: examRes.data.slug,
        orgId: examRes.data.org_id,
        category: examRes.data.category || "National Recruitment",
        description: examRes.data.description || "",
        isActive: Boolean(examRes.data.is_active),
      };
    }

    const cycles = cyclesRes.data || [];
    activeCycle = resolvedParams.cycleId
      ? cycles.find((c: any) => c.id === resolvedParams.cycleId) || cycles[0] || null
      : cycles.find((c: any) => c.is_active) || cycles[0] || null;

    posts = (postsRes.data || []).map((p: any) => ({
      id: p.id,
      examId: p.exam_id,
      postName: p.post_name,
      postCode: p.post_code,
      department: p.department,
      ministry: p.ministry,
      classificationGroup: p.classification_group,
      isGazetted: p.is_gazetted,
      payLevel: p.pay_level,
    }));

    selectedTopicIds = (examTopicsRes.data || []).map((t: any) => t.topic_id);
    knowledgeModules = modules;
    readinessReport = report;
  }

  return (
    <ExamOnboardingWizard
      initialExam={initialExam}
      orgs={orgs}
      activeCycle={activeCycle ? {
        id: activeCycle.id,
        cycleYear: activeCycle.cycle_year,
        cycleName: activeCycle.cycle_name,
        notificationDate: activeCycle.notification_date,
        applicationStartDate: activeCycle.application_start_date,
        applicationEndDate: activeCycle.application_end_date,
      } : null}
      posts={posts}
      taxonomy={taxonomy}
      selectedTopicIds={selectedTopicIds}
      knowledgeModules={knowledgeModules}
      readinessReport={readinessReport}
    />
  );
}
