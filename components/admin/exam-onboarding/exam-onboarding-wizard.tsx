"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { AdminBreadcrumbs } from "@/components/admin/admin-breadcrumbs";
import { ConductingOrgItem, ExamPostItem, CanonicalTaxonomySubject, OnboardingKnowledgeModuleStatus, SyllabusProjectionInput } from "@/services/exam-onboarding/exam-onboarding.service";
import { ExamReadinessReport } from "@/services/exam-onboarding/exam-readiness.service";
import { Step1Identity } from "./steps/step1-identity";
import { Step2Cycles } from "./steps/step2-cycles";
import { Step3Posts } from "./steps/step3-posts";
import { Step4Syllabus } from "./steps/step4-syllabus";
import { Step5Knowledge } from "./steps/step5-knowledge";
import { Step6Readiness } from "./steps/step6-readiness";
import {
  createExamDraftAction,
  updateExamIdentityAction,
  createOrUpdateExamCycleAction,
  saveExamPostAction,
  deleteExamPostAction,
  saveSyllabusProjectionAction,
  publishExamAction,
  generateStepExamPromptAction,
} from "@/app/admin/exams/actions";
import { AiPromptModal } from "./ai-prompt-modal";
import { ShieldCheck, Calendar, Users, BookOpen, GraduationCap, Award, Check, Sparkles, RefreshCw } from "lucide-react";

interface Props {
  initialExam?: {
    id: string;
    title: string;
    slug: string;
    orgId: string;
    category: string;
    description: string;
    isActive: boolean;
  } | null;
  orgs: ConductingOrgItem[];
  activeCycle?: {
    id: string;
    cycleYear: number;
    cycleName?: string;
    notificationDate?: string;
    applicationStartDate?: string;
    applicationEndDate?: string;
  } | null;
  posts: ExamPostItem[];
  taxonomy: CanonicalTaxonomySubject[];
  selectedTopicIds: string[];
  knowledgeModules: OnboardingKnowledgeModuleStatus[];
  readinessReport: ExamReadinessReport;
}

export function ExamOnboardingWizard({
  initialExam,
  orgs,
  activeCycle,
  posts,
  taxonomy,
  selectedTopicIds,
  knowledgeModules,
  readinessReport,
}: Props) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<number>(initialExam ? 1 : 1);
  const [examId, setExamId] = useState<string | undefined>(initialExam?.id);
  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingStepPrompt, setIsGeneratingStepPrompt] = useState(false);
  const [stepPromptData, setStepPromptData] = useState<{
    promptText: string;
    promptVersion: string;
    contextHash: string;
    stepName: string;
  } | null>(null);
  const [isStepPromptModalOpen, setIsStepPromptModalOpen] = useState(false);

  const handleGenerateStepPrompt = async (stepNum: number) => {
    const examTitle = initialExam?.title?.trim();
    if (!examId && !examTitle) {
      router.push("/admin/exams/ai-onboarding");
      return;
    }

    setIsGeneratingStepPrompt(true);
    try {
      const res = await generateStepExamPromptAction(stepNum as any, {
        examId: examId,
        examName: examTitle || "",
        cycleYear: activeCycle?.cycleYear,
      });

      if (res.success && res.promptText) {
        setStepPromptData({
          promptText: res.promptText,
          promptVersion: res.promptVersion || "CL-EXAM-ONBOARDING-v1.0",
          contextHash: res.contextHash || "",
          stepName: res.stepName || `Step ${stepNum}`,
        });
        setIsStepPromptModalOpen(true);
      }
    } finally {
      setIsGeneratingStepPrompt(false);
    }
  };

  const steps = [
    { num: 1, label: "Identity & Authority", icon: ShieldCheck },
    { num: 2, label: "Recruitment Cycle", icon: Calendar },
    { num: 3, label: "Posts & Cadres", icon: Users },
    { num: 4, label: "Syllabus Projection", icon: BookOpen },
    { num: 5, label: "Knowledge Modules", icon: GraduationCap },
    { num: 6, label: "Readiness & Publish", icon: Award },
  ];

  // STEP 1: SAVE
  const handleSaveStep1 = async (data: any) => {
    setIsSaving(true);
    try {
      if (!examId) {
        const formData = new FormData();
        formData.append("title", data.title);
        formData.append("slug", data.slug);
        formData.append("orgId", data.orgId);
        if (data.newOrgName) formData.append("newOrgName", data.newOrgName);
        if (data.newOrgWebsite) formData.append("newOrgWebsite", data.newOrgWebsite);
        formData.append("category", data.category);
        formData.append("description", data.description);

        const res = await createExamDraftAction(null, formData);
        if (res.error) throw new Error(res.error);
        setExamId(res.data.examId);
        router.push(`/admin/exams/onboarding?examId=${res.data.examId}`);
        setCurrentStep(2);
      } else {
        const formData = new FormData();
        formData.append("examId", examId);
        formData.append("title", data.title);
        formData.append("slug", data.slug);
        formData.append("orgId", data.orgId);
        formData.append("category", data.category);
        formData.append("description", data.description);

        const res = await updateExamIdentityAction(null, formData);
        if (res.error) throw new Error(res.error);
        setCurrentStep(2);
      }
    } finally {
      setIsSaving(false);
    }
  };

  // STEP 2: SAVE
  const handleSaveStep2 = async (data: any) => {
    if (!examId) return;
    setIsSaving(true);
    try {
      const formData = new FormData();
      formData.append("examId", examId);
      if (data.cycleId) formData.append("cycleId", data.cycleId);
      formData.append("cycleYear", data.cycleYear.toString());
      if (data.cycleName) formData.append("cycleName", data.cycleName);
      if (data.notificationDate) formData.append("notificationDate", data.notificationDate);
      if (data.applicationStartDate) formData.append("applicationStartDate", data.applicationStartDate);
      if (data.applicationEndDate) formData.append("applicationEndDate", data.applicationEndDate);

      const res = await createOrUpdateExamCycleAction(null, formData);
      if (res.error) throw new Error(res.error);
      setCurrentStep(3);
    } finally {
      setIsSaving(false);
    }
  };

  // STEP 3: POSTS
  const handleSavePost = async (post: ExamPostItem) => {
    if (!examId) return;
    setIsSaving(true);
    try {
      const formData = new FormData();
      formData.append("examId", examId);
      if (post.id) formData.append("postId", post.id);
      formData.append("postName", post.postName);
      if (post.postCode) formData.append("postCode", post.postCode);
      if (post.department) formData.append("department", post.department);
      if (post.ministry) formData.append("ministry", post.ministry);
      if (post.classificationGroup) formData.append("classificationGroup", post.classificationGroup);
      formData.append("isGazetted", post.isGazetted ? "true" : "false");
      if (post.payLevel) formData.append("payLevel", post.payLevel.toString());

      const res = await saveExamPostAction(null, formData);
      if (res.error) throw new Error(res.error);
      router.refresh();
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeletePost = async (postId: string) => {
    if (!examId) return;
    setIsSaving(true);
    try {
      const res = await deleteExamPostAction(postId, examId);
      if (res.error) throw new Error(res.error);
      router.refresh();
    } finally {
      setIsSaving(false);
    }
  };

  // STEP 4: SYLLABUS
  const handleSaveSyllabus = async (payload: SyllabusProjectionInput) => {
    setIsSaving(true);
    try {
      const res = await saveSyllabusProjectionAction(payload);
      if (res.error) throw new Error(res.error);
      router.refresh();
    } finally {
      setIsSaving(false);
    }
  };

  // STEP 6: PUBLISH
  const handlePublish = async () => {
    if (!examId) return;
    setIsSaving(true);
    try {
      const res = await publishExamAction(examId, activeCycle?.id);
      if (res.error) throw new Error(res.error);
      router.refresh();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 w-full pb-12">
      {/* Breadcrumbs */}
      <AdminBreadcrumbs
        items={[
          { label: "Dashboard", href: "/admin" },
          { label: "Examinations", href: "/admin/exams" },
          { label: initialExam ? initialExam.title : "Manual Onboarding Wizard", active: true },
        ]}
      />

      {/* Stepper Navigation Header */}
      <div className="p-4 bg-white border border-slate-200/80 rounded-2xl shadow-2xs overflow-x-auto">
        <div className="flex items-center justify-between min-w-[650px] gap-2">
          {steps.map((step) => {
            const Icon = step.icon;
            const isDone = currentStep > step.num;
            const isCurrent = currentStep === step.num;
            return (
              <button
                key={step.num}
                type="button"
                onClick={() => examId && setCurrentStep(step.num)}
                disabled={!examId && step.num > 1}
                className={`flex items-center gap-2 p-2 rounded-xl text-xs font-bold transition flex-1 justify-center select-none ${
                  isCurrent
                    ? "bg-blue-600 text-white shadow-xs"
                    : isDone
                    ? "bg-blue-50 text-blue-700 hover:bg-blue-100"
                    : "text-slate-400 cursor-not-allowed"
                }`}
              >
                <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-mono font-bold ${
                  isCurrent ? "bg-white text-blue-600" : isDone ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-400"
                }`}>
                  {isDone ? <Check className="w-3.5 h-3.5" /> : step.num}
                </div>
                <span className="hidden md:inline truncate">{step.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Contextual Step AI Prompt Helper */}
      <div className="flex items-center justify-between p-3 bg-gradient-to-r from-blue-50/70 via-indigo-50/50 to-slate-50 border border-blue-200/60 rounded-2xl shadow-2xs">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
          <span className="text-xs text-slate-700 font-medium">
            Need external AI research assistance for <strong>{steps[currentStep - 1]?.label}</strong>?
          </span>
        </div>

        <button
          type="button"
          onClick={() => handleGenerateStepPrompt(currentStep)}
          disabled={isGeneratingStepPrompt}
          className="text-[11px] font-bold px-3 py-1.5 rounded-xl bg-white hover:bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center gap-1.5 shadow-2xs transition-colors disabled:opacity-50"
        >
          {isGeneratingStepPrompt ? (
            <>
              <RefreshCw className="w-3 h-3 animate-spin" /> Generating...
            </>
          ) : (
            <>
              <Sparkles className="w-3 h-3 text-indigo-500" /> Generate Step {currentStep} AI Prompt
            </>
          )}
        </button>
      </div>

      {/* Step View Render */}
      <div>
        {currentStep === 1 && (
          <Step1Identity
            initialData={initialExam || undefined}
            orgs={orgs}
            onSave={handleSaveStep1}
            isSaving={isSaving}
          />
        )}

        {currentStep === 2 && (
          <Step2Cycles
            initialCycle={activeCycle}
            onSave={handleSaveStep2}
            onBack={() => setCurrentStep(1)}
            isSaving={isSaving}
          />
        )}

        {currentStep === 3 && (
          <Step3Posts
            examId={examId || ""}
            initialPosts={posts}
            onSavePost={handleSavePost}
            onDeletePost={handleDeletePost}
            onContinue={() => setCurrentStep(4)}
            onBack={() => setCurrentStep(2)}
            isSaving={isSaving}
          />
        )}

        {currentStep === 4 && (
          <Step4Syllabus
            examId={examId || ""}
            taxonomy={taxonomy}
            initialSelectedTopicIds={selectedTopicIds}
            onSaveSyllabus={handleSaveSyllabus}
            onContinue={() => setCurrentStep(5)}
            onBack={() => setCurrentStep(3)}
            isSaving={isSaving}
          />
        )}

        {currentStep === 5 && (
          <Step5Knowledge
            examId={examId || ""}
            cycleId={activeCycle?.id}
            modules={knowledgeModules}
            onContinue={() => setCurrentStep(6)}
            onBack={() => setCurrentStep(4)}
          />
        )}

        {currentStep === 6 && (
          <Step6Readiness
            report={readinessReport}
            onPublish={handlePublish}
            onBack={() => setCurrentStep(5)}
            isPublishing={isSaving}
          />
        )}
      </div>

      {/* Step AI Prompt Modal */}
      {stepPromptData && (
        <AiPromptModal
          isOpen={isStepPromptModalOpen}
          onClose={() => setIsStepPromptModalOpen(false)}
          title={`Context-Aware AI Prompt: Step ${currentStep}`}
          stepName={stepPromptData.stepName}
          promptText={stepPromptData.promptText}
          promptVersion={stepPromptData.promptVersion}
          contextHash={stepPromptData.contextHash}
        />
      )}
    </div>
  );
}
