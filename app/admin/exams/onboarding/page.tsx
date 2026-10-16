import React from "react";
import { redirect } from "next/navigation";
import { createAdminServerSupabaseClient } from "@/lib/supabase/server";
import { ExamOnboardingService } from "@/services/exam-onboarding/exam-onboarding.service";
import { ExamReadinessService, ExamReadinessReport } from "@/services/exam-onboarding/exam-readiness.service";
import { ExamOnboardingWizard } from "@/components/admin/exam-onboarding/exam-onboarding-wizard";
import { requireAdminPage } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

export const revalidate = 0;

interface PageProps {
  searchParams?: Promise<{ examId?: string; cycleId?: string; step?: string }>;
}

export default async function AdminExamOnboardingPage({ searchParams }: PageProps) {
  await requireAdminPage({ allowStaff: true, path: "/admin/exams/onboarding" });
  const resolvedParams = searchParams ? await searchParams : {};
  const examId = resolvedParams.examId?.trim();
  const requestedCycleId = resolvedParams.cycleId?.trim();
  const stepParam = resolvedParams.step ? parseInt(resolvedParams.step, 10) : undefined;

  const supabase = createAdminServerSupabaseClient();
  const orgs = await ExamOnboardingService.getConductingOrgs(supabase).catch(() => []);

  if (!examId) {
    const emptyReport: ExamReadinessReport = {
      status: "NOT_STARTED",
      examId: "",
      examTitle: "New Examination",
      examSlug: "",
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

    return (
      <ExamOnboardingWizard
        initialExam={null}
        orgs={orgs}
        activeCycle={null}
        posts={[]}
        syllabusStatus={null}
        knowledgeModules={[]}
        readinessReport={emptyReport}
        initialStep={1}
      />
    );
  }

  // Fetch Exam record
  const { data: exam, error: examErr } = await supabase
    .from("exams")
    .select("id, org_id, title, slug, category, description, is_active")
    .eq("id", examId)
    .maybeSingle();

  if (examErr || !exam) {
    redirect("/admin/exams");
  }

  // Fetch Cycles
  const { data: cyclesData } = await supabase
    .from("exam_cycles")
    .select("id, exam_id, cycle_year, notification_date, application_start_date, application_end_date, status")
    .eq("exam_id", examId)
    .order("cycle_year", { ascending: false });

  const cycles: any[] = cyclesData || [];
  const activeCycle = requestedCycleId
    ? cycles.find((c: any) => c.id === requestedCycleId) || cycles[0] || null
    : cycles[0] || null;

  // Fetch Posts
  let posts: any[] = [];
  try {
    const { data: postData } = await supabase
      .from("exam_posts")
      .select("*")
      .eq("exam_id", examId)
      .order("display_order", { ascending: true });
    posts = postData || [];
  } catch (_) {
    posts = [];
  }

  // Canonical syllabus status (GAP2-4b): authoring happens in /admin/syllabus; no legacy exam_syllabi / exam_topics reads.
  let syllabusStatus: { publishedVersionNumber: number | null; draftCount: number } | null = null;
  {
    const { data: versions, error: vErr } = await supabase
      .from("exam_syllabus_versions")
      .select("version_number, status, is_active, exam_cycle_id")
      .eq("exam_id", examId);
    if (!vErr) {
      const live = (versions ?? []).filter(
        (v) => v.status === "PUBLISHED" && v.is_active && (!v.exam_cycle_id || v.exam_cycle_id === activeCycle?.id),
      );
      syllabusStatus = {
        publishedVersionNumber: live.length ? Math.max(...live.map((v) => v.version_number)) : null,
        draftCount: (versions ?? []).filter((v) => v.status === "DRAFT").length,
      };
    }
  }

  // Fetch Knowledge matrix & Readiness report
  const [knowledgeModules, readinessReport] = await Promise.all([
    ExamOnboardingService.getKnowledgeStatusMatrix(examId, activeCycle?.id, supabase).catch(() => []),
    ExamReadinessService.evaluateReadiness(examId, activeCycle?.id, supabase),
  ]);

  const initialStep = stepParam && stepParam >= 1 && stepParam <= 6 ? stepParam : 6;

  return (
    <ExamOnboardingWizard
      initialExam={{
        id: exam.id,
        title: exam.title,
        slug: exam.slug,
        orgId: exam.org_id,
        category: exam.category || "General",
        description: exam.description || "",
        isActive: Boolean(exam.is_active),
      }}
      orgs={orgs}
      activeCycle={activeCycle ? {
        id: activeCycle.id,
        cycleYear: activeCycle.cycle_year,
        notificationDate: activeCycle.notification_date || undefined,
        applicationStartDate: activeCycle.application_start_date || undefined,
        applicationEndDate: activeCycle.application_end_date || undefined,
      } : null}
      posts={posts.map((p: any) => ({
        id: p.id,
        examId: p.exam_id,
        postName: p.post_name,
        postCode: p.post_code,
        department: p.department,
        ministry: p.ministry,
        classificationGroup: p.classification_group,
        isGazetted: Boolean(p.is_gazetted),
        payLevel: p.pay_level,
        gradePay: p.grade_pay,
        cpcBasicPayMin: p.cpc_basic_pay_min,
        cpcBasicPayMax: p.cpc_basic_pay_max,
        isActive: Boolean(p.is_active),
        displayOrder: p.display_order,
      }))}
      syllabusStatus={syllabusStatus}
      knowledgeModules={knowledgeModules}
      readinessReport={readinessReport}
      initialStep={initialStep}
    />
  );
}
