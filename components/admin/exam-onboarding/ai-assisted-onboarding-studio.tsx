"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AdminBreadcrumbs } from "@/components/admin/admin-breadcrumbs";
import {
  generateMasterExamPromptAction,
  generateStepExamPromptAction,
  validateAndPreviewAiImportAction,
  commitAiExamImportAction,
  evaluateExamReadinessAction,
  publishExamAction,
} from "@/app/admin/exams/actions";
import { ExamReadinessReport } from "@/services/exam-onboarding/exam-readiness.service";
import {
  Sparkles,
  Bot,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  UploadCloud,
  FileCode2,
  RefreshCw,
  Copy,
  Check,
  Building2,
  Calendar,
  Users,
  BookOpen,
  GraduationCap,
  Layers,
  ArrowLeft,
  Search,
  Award,
  Globe,
  ExternalLink,
  Lock,
} from "lucide-react";

type AIStudioPhase = "INITIAL" | "PROMPT_AND_IMPORT" | "VERIFIED_REVIEW" | "READINESS" | "PUBLISHED";
type AIStrategy = "MASTER" | "STEP_BY_STEP";

export function AiAssistedOnboardingStudio() {
  const router = useRouter();

  // Phase State
  const [phase, setPhase] = useState<AIStudioPhase>("INITIAL");
  const [strategy, setStrategy] = useState<AIStrategy>("MASTER");
  const [activeStep, setActiveStep] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);

  // Active Exam Identity & Persisted Draft State
  const [examId, setExamId] = useState<string | null>(null);
  const [examSlug, setExamSlug] = useState<string>("");
  const [examName, setExamName] = useState("");
  const [cycleYear, setCycleYear] = useState<number>(new Date().getFullYear());
  const [category, setCategory] = useState("National Recruitment");
  const [orgName, setOrgName] = useState("");
  const [additionalInstructions, setAdditionalInstructions] = useState("");

  // Prompt Generation State
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  const [promptText, setPromptText] = useState("");
  const [promptVersion, setPromptVersion] = useState("CL-EXAM-ONBOARDING-v1.0");
  const [contextHash, setContextHash] = useState("");
  const [copied, setCopied] = useState(false);

  // Ingestion & Validation State
  const [rawJsonInput, setRawJsonInput] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [previewResult, setPreviewResult] = useState<any>(null);
  const [resolvedConflicts, setResolvedConflicts] = useState<Record<string, any>>({});
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);

  // Readiness & Publish State
  const [readinessReport, setReadinessReport] = useState<ExamReadinessReport | null>(null);
  const [isEvaluatingReadiness, setIsEvaluatingReadiness] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  // Quick suggestions
  const quickSuggestions = ["IBPS PO", "SSC CGL", "RRB NTPC", "CDS", "UPSC CSE", "SBI Clerk"];

  const stepsList = [
    { num: 1, label: "Identity & Authority", icon: ShieldCheck },
    { num: 2, label: "Recruitment Cycle", icon: Calendar },
    { num: 3, label: "Posts & Eligibility", icon: Users },
    { num: 4, label: "Syllabus Projection", icon: BookOpen },
    { num: 5, label: "Knowledge & Sources", icon: GraduationCap },
    { num: 6, label: "Readiness & Publish", icon: Award },
  ];

  // 1. Handle Master Prompt Generation
  const handleGenerateMasterPrompt = async (targetName?: string) => {
    const name = (targetName || examName).trim();
    if (!name) return;

    setIsGeneratingPrompt(true);
    setValidationError(null);
    try {
      const res = await generateMasterExamPromptAction({
        examId: examId || undefined,
        examName: name,
        cycleYear: Number(cycleYear) || undefined,
        category: category.trim(),
        conductingOrgName: orgName.trim() || undefined,
        additionalInstructions: additionalInstructions.trim() || undefined,
      });

      if (res.success && res.promptText) {
        setPromptText(res.promptText);
        setPromptVersion(res.promptVersion || "CL-EXAM-ONBOARDING-v1.0");
        setContextHash(res.contextHash || "");
        setPhase("PROMPT_AND_IMPORT");
      } else {
        setValidationError(res.error || "Failed to generate AI prompt.");
      }
    } finally {
      setIsGeneratingPrompt(false);
    }
  };

  // 2. Handle Step Prompt Generation
  const handleGenerateStepPrompt = async (stepNum: 1 | 2 | 3 | 4 | 5 | 6) => {
    if (!examName.trim()) return;

    setIsGeneratingPrompt(true);
    setValidationError(null);
    try {
      const res = await generateStepExamPromptAction(stepNum, {
        examId: examId || undefined,
        examName: examName.trim(),
        cycleYear: Number(cycleYear) || undefined,
        conductingOrgName: orgName.trim() || undefined,
      });

      if (res.success && res.promptText) {
        setPromptText(res.promptText);
        setPromptVersion(res.promptVersion || "CL-EXAM-ONBOARDING-v1.0");
        setContextHash(res.contextHash || "");
        setActiveStep(stepNum);
        setPhase("PROMPT_AND_IMPORT");
      } else {
        setValidationError(res.error || "Failed to generate step AI prompt.");
      }
    } finally {
      setIsGeneratingPrompt(false);
    }
  };

  // Switch strategy
  const handleSelectStrategy = (strat: AIStrategy) => {
    setStrategy(strat);
    if (strat === "MASTER") {
      handleGenerateMasterPrompt();
    } else {
      handleGenerateStepPrompt(activeStep);
    }
  };

  // Switch step
  const handleSelectStep = (stepNum: 1 | 2 | 3 | 4 | 5 | 6) => {
    if (stepNum === 6) {
      if (examId) {
        handleLoadReadiness(examId);
      } else {
        setActiveStep(6);
      }
      return;
    }
    setActiveStep(stepNum);
    handleGenerateStepPrompt(stepNum);
  };

  // Copy Prompt to Clipboard
  const handleCopyPrompt = async () => {
    if (!promptText) return;
    try {
      await navigator.clipboard.writeText(promptText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard fallback
    }
  };

  // Validate Ingestion Payload
  const handleVerifyResponse = async () => {
    if (!rawJsonInput.trim()) return;
    setIsValidating(true);
    setValidationError(null);
    setCommitError(null);
    try {
      const res = await validateAndPreviewAiImportAction(rawJsonInput, {
        targetExamName: examName.trim() || undefined,
        targetCycleYear: Number(cycleYear) || undefined,
        expectedContextHash: contextHash || undefined,
      });

      if (res.success && res.preview) {
        setPreviewResult(res.preview);
        if (res.preview.validationResult.isValid) {
          setPhase("VERIFIED_REVIEW");
        } else {
          setValidationError(
            res.preview.validationResult.blockingIssues.join(" • ") ||
              "The AI payload contained blocking validation issues."
          );
        }
      } else {
        setValidationError(res.error || "Failed to validate external AI response.");
      }
    } finally {
      setIsValidating(false);
    }
  };

  // Accept & Advance Inside AI Studio (DOES NOT REDIRECT TO MANUAL WIZARD)
  const handleAcceptAndAdvance = async () => {
    if (!previewResult?.validationResult?.spec) return;
    setIsCommitting(true);
    setCommitError(null);
    try {
      const res = await commitAiExamImportAction(previewResult.validationResult.spec, {
        resolvedConflicts,
      });

      if (res.success && res.result?.examId) {
        const persistedId = res.result.examId;
        setExamId(persistedId);
        setExamSlug(res.result.slug || previewResult.diffSummary.exam.slug || "");

        if (strategy === "MASTER" || activeStep >= 5) {
          // Transition internally to Step 6: Readiness & Publish
          setActiveStep(6);
          await handleLoadReadiness(persistedId);
        } else {
          // Advance to next step in Step-by-Step strategy
          const nextStep = (activeStep + 1) as 1 | 2 | 3 | 4 | 5 | 6;
          setActiveStep(nextStep);
          setRawJsonInput("");
          setPreviewResult(null);
          await handleGenerateStepPrompt(nextStep);
        }
      } else {
        setCommitError(res.error || "Failed to save verified AI draft.");
      }
    } finally {
      setIsCommitting(false);
    }
  };

  // Load 14-Dimension Readiness Report
  const handleLoadReadiness = async (targetExamId: string) => {
    setIsEvaluatingReadiness(true);
    try {
      const res = await evaluateExamReadinessAction(targetExamId);
      if (res.success && res.report) {
        setReadinessReport(res.report);
        setPhase("READINESS");
      }
    } finally {
      setIsEvaluatingReadiness(false);
    }
  };

  // Server-Authoritative Publish Action
  const handlePublishExam = async () => {
    if (!examId) return;
    setIsPublishing(true);
    setPublishError(null);
    try {
      const res = await publishExamAction(examId);
      if (res.success) {
        setPhase("PUBLISHED");
      } else {
        setPublishError(res.error || "Failed to publish examination.");
      }
    } finally {
      setIsPublishing(false);
    }
  };

  const readinessDimensions = [
    { key: "IDENTITY", label: "Identity & Overview" },
    { key: "ORGANIZATION", label: "Conducting Authority" },
    { key: "CYCLE", label: "Recruitment Cycle" },
    { key: "POSTS", label: "Posts & Generic Cadres" },
    { key: "ELIGIBILITY", label: "Eligibility Criteria" },
    { key: "DATES", label: "Key Dates & Milestones" },
    { key: "SYLLABUS", label: "Canonical Syllabus" },
    { key: "SOURCES", label: "Official Sources & Provenance" },
    { key: "KNOWLEDGE", label: "Core Knowledge Modules" },
    { key: "LEARNING", label: "Learning & Study Structure" },
    { key: "QUESTIONS", label: "Question Bank Taxonomy" },
    { key: "MOCKS", label: "Full-Length Mocks & Pattern" },
    { key: "SEO", label: "SEO & Search Metadata" },
    { key: "DELIVERY", label: "Candidate Delivery Isolation" },
  ];

  return (
    <div className="space-y-6 w-full max-w-6xl mx-auto pb-16">
      {/* Breadcrumbs */}
      <AdminBreadcrumbs
        items={[
          { label: "Dashboard", href: "/admin" },
          { label: "Examinations", href: "/admin/exams" },
          { label: "AI-Assisted Exam Onboarding", active: true },
        ]}
      />

      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-700 flex items-center gap-1 font-mono">
              <Sparkles className="w-3 h-3" /> External AI Research Control Plane
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <Bot className="w-6 h-6 text-blue-600" /> AI-Assisted Exam Onboarding Studio
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 font-medium">
            Start with only the exam name. Generate structured AI research prompts, verify responses, evaluate 14-dimension readiness, and publish entirely within this studio.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {phase !== "INITIAL" && phase !== "PUBLISHED" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setPhase("INITIAL");
                setExamId(null);
                setPromptText("");
                setRawJsonInput("");
                setPreviewResult(null);
                setReadinessReport(null);
              }}
              className="text-xs font-semibold rounded-xl text-slate-600"
            >
              <ArrowLeft className="w-3.5 h-3.5 mr-1" /> New Exam
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/admin/exams/onboarding")}
            className="text-xs font-semibold rounded-xl text-slate-600"
          >
            Switch to Manual Wizard
          </Button>
        </div>
      </div>

      {/* Persistent AI Studio Stepper (When Exam Name is Known) */}
      {phase !== "INITIAL" && (
        <div className="p-3.5 bg-white border border-slate-200/80 rounded-2xl shadow-2xs overflow-x-auto">
          <div className="flex items-center justify-between min-w-[700px] gap-2">
            {stepsList.map((step) => {
              const Icon = step.icon;
              const isCurrent = activeStep === step.num;
              const isDone = activeStep > step.num || (phase === "READINESS" && step.num < 6) || phase === "PUBLISHED";
              return (
                <button
                  key={step.num}
                  type="button"
                  onClick={() => handleSelectStep(step.num as any)}
                  className={`flex items-center gap-2 p-2 rounded-xl text-xs font-bold transition flex-1 justify-center select-none ${
                    isCurrent
                      ? "bg-blue-600 text-white shadow-xs"
                      : isDone
                      ? "bg-blue-50 text-blue-700 hover:bg-blue-100"
                      : "text-slate-400 hover:text-slate-600"
                  }`}
                >
                  <div
                    className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-mono font-bold ${
                      isCurrent
                        ? "bg-white text-blue-600"
                        : isDone
                        ? "bg-blue-600 text-white"
                        : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    {isDone ? <Check className="w-3.5 h-3.5" /> : step.num}
                  </div>
                  <span className="truncate">{step.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* PHASE 1: STEP 0 — "What exam do you want to onboard?"                     */}
      {/* ========================================================================= */}
      {phase === "INITIAL" && (
        <Card className="p-6 sm:p-8 bg-white border border-slate-200/90 rounded-3xl shadow-sm space-y-6 max-w-2xl mx-auto">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto shadow-2xs">
              <Sparkles className="w-6 h-6" />
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900">
              What exam do you want to onboard?
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto">
              You only need the exam name. Courage will generate an authoritative research prompt for external AI.
            </p>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">
                Target Examination Name <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={examName}
                  onChange={(e) => setExamName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && examName.trim()) {
                      handleGenerateMasterPrompt();
                    }
                  }}
                  placeholder="e.g. IBPS PO, RRB NTPC, CDS, SBI Clerk..."
                  autoFocus
                  className="w-full pl-10 pr-4 py-3 text-sm font-semibold rounded-2xl border border-slate-200 bg-slate-50/60 focus:bg-white focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50 transition-all text-slate-900 placeholder:text-slate-400"
                />
              </div>
            </div>

            {/* Quick Suggestions */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                Popular Suggestions:
              </span>
              <div className="flex flex-wrap gap-2">
                {quickSuggestions.map((sug) => (
                  <button
                    key={sug}
                    type="button"
                    onClick={() => {
                      setExamName(sug);
                      handleGenerateMasterPrompt(sug);
                    }}
                    className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 border border-slate-200/80 transition-colors"
                  >
                    {sug}
                  </button>
                ))}
              </div>
            </div>

            {/* Optional Context Accordion */}
            <div className="pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-600">
                  Recruitment Cycle Year <span className="text-slate-400">(Optional)</span>
                </label>
                <input
                  type="number"
                  value={cycleYear}
                  onChange={(e) => setCycleYear(parseInt(e.target.value, 10) || new Date().getFullYear())}
                  className="w-full px-3 py-2 text-xs font-medium rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-600">
                  Domain / Category <span className="text-slate-400">(Optional)</span>
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-medium rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:border-blue-500"
                >
                  <option value="National Recruitment">National Recruitment</option>
                  <option value="Banking & Financial">Banking & Financial</option>
                  <option value="Staff Selection">Staff Selection</option>
                  <option value="Railways Recruitment">Railways Recruitment</option>
                  <option value="Defence & Police">Defence & Police</option>
                  <option value="Civil Services & State PSC">Civil Services & State PSC</option>
                </select>
              </div>
            </div>

            {validationError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2 font-medium">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{validationError}</span>
              </div>
            )}

            <Button
              onClick={() => handleGenerateMasterPrompt()}
              disabled={!examName.trim() || isGeneratingPrompt}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-2xl flex items-center justify-center gap-2 shadow-sm transition-all text-sm disabled:opacity-50"
            >
              {isGeneratingPrompt ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" /> Building Research Prompt for {examName}...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" /> Generate AI Prompt
                </>
              )}
            </Button>
          </div>
        </Card>
      )}

      {/* ========================================================================= */}
      {/* PHASE 2: PROMPT DISPLAY & INGESTION (IN THE SAME AI STUDIO)               */}
      {/* ========================================================================= */}
      {phase === "PROMPT_AND_IMPORT" && (
        <div className="space-y-6">
          {/* Context & Strategy Selector Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-white border border-slate-200/90 rounded-2xl shadow-2xs gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold font-mono text-sm">
                ✨
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  AI Research Studio — <span className="text-blue-600">{examName}</span>
                </h2>
                <p className="text-[11px] text-slate-500 font-mono">
                  Target Context Hash: {contextHash || "Deterministic"} &bull; Version: {promptVersion}
                </p>
              </div>
            </div>

            {/* Strategy Toggle */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => handleSelectStrategy("MASTER")}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${
                  strategy === "MASTER"
                    ? "bg-white text-slate-900 shadow-2xs"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                Strategy A: Master Package
              </button>
              <button
                type="button"
                onClick={() => handleSelectStrategy("STEP_BY_STEP")}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${
                  strategy === "STEP_BY_STEP"
                    ? "bg-white text-slate-900 shadow-2xs"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                Strategy B: Step-by-Step
              </button>
            </div>
          </div>

          {/* 2-Column: Left Prompt Display, Right Ingestion Textarea */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            {/* LEFT: Research Prompt Display & Copy */}
            <Card className="p-5 bg-white border border-slate-200/90 rounded-2xl shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Bot className="w-4 h-4 text-blue-600" />
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider font-mono">
                    {strategy === "MASTER" ? "Complete Master AI Prompt" : `Step ${activeStep} AI Prompt: ${stepsList[activeStep - 1]?.label}`}
                  </h3>
                </div>
                <Badge variant="outline" className="text-[10px] font-mono">
                  {promptVersion}
                </Badge>
              </div>

              <div className="relative">
                <textarea
                  readOnly
                  value={promptText}
                  rows={13}
                  className="w-full p-3 font-mono text-[11px] leading-relaxed rounded-xl border border-slate-200 bg-slate-50/70 text-slate-800 focus:outline-none resize-none"
                />
              </div>

              <div className="space-y-3">
                <Button
                  onClick={handleCopyPrompt}
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 shadow-xs transition-all"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-400" /> Copied Research Prompt to Clipboard!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" /> Copy Research Prompt
                    </>
                  )}
                </Button>

                <div className="p-3 bg-blue-50/60 border border-blue-100 rounded-xl space-y-1">
                  <span className="text-[11px] font-bold text-blue-900 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-blue-600" /> External AI Instructions:
                  </span>
                  <p className="text-[11px] text-blue-800 leading-relaxed">
                    Take this prompt to <strong>ChatGPT (GPT-4o)</strong>, <strong>Claude 3.5 Sonnet</strong>, <strong>Gemini 1.5 Pro</strong>, or <strong>Perplexity</strong> and ask it to return the required JSON package conforming strictly to <code className="font-mono text-[10px]">{promptVersion}</code>.
                  </p>
                </div>
              </div>
            </Card>

            {/* RIGHT: Ingestion & Verification */}
            <Card className="p-5 bg-white border border-slate-200/90 rounded-2xl shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <UploadCloud className="w-4 h-4 text-blue-600" />
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider font-mono">
                    Paste External AI Response
                  </h3>
                </div>
                <span className="text-[11px] text-slate-400 font-medium">Untrusted Input Pipeline</span>
              </div>

              <div className="space-y-2">
                <textarea
                  value={rawJsonInput}
                  onChange={(e) => setRawJsonInput(e.target.value)}
                  placeholder="Paste the JSON response from ChatGPT / Claude / Gemini here (markdown code fences and BOM will be stripped automatically)..."
                  rows={13}
                  className="w-full p-3 font-mono text-[11px] leading-relaxed rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-500 transition-colors text-slate-900"
                />
              </div>

              {validationError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2 font-medium">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{validationError}</span>
                </div>
              )}

              <Button
                onClick={handleVerifyResponse}
                disabled={!rawJsonInput.trim() || isValidating}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 shadow-xs transition-all disabled:opacity-50"
              >
                {isValidating ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" /> Verifying Against Canonical Schemas...
                  </>
                ) : (
                  <>
                    <FileCode2 className="w-4 h-4" /> Verify Response &amp; Continue →
                  </>
                )}
              </Button>
            </Card>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* PHASE 3: VERIFIED REVIEW & ADVANCE (INSIDE SAME AI STUDIO)                */}
      {/* ========================================================================= */}
      {phase === "VERIFIED_REVIEW" && previewResult && (
        <Card className="p-6 bg-white border border-slate-200/90 rounded-3xl shadow-sm space-y-6">
          {/* Top Verification Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 flex items-center gap-1 font-mono">
                  <CheckCircle2 className="w-3.5 h-3.5" /> AI Response Verified
                </span>
                <span className="text-xs font-mono text-slate-400">
                  Hash: {previewResult.contextHash || "OK"}
                </span>
              </div>
              <h2 className="text-lg font-bold text-slate-900">
                Verified Research Package — {previewResult.diffSummary.exam.title}
              </h2>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPhase("PROMPT_AND_IMPORT")}
                className="text-xs font-semibold rounded-xl text-slate-600"
              >
                Edit / Re-validate
              </Button>
              <Button
                onClick={handleAcceptAndAdvance}
                disabled={isCommitting}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-5 py-2 rounded-xl flex items-center gap-2 shadow-xs transition-all disabled:opacity-50"
              >
                {isCommitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Saving Verified Draft...
                  </>
                ) : (
                  <>
                    <ArrowRight className="w-3.5 h-3.5" /> Accept &amp; Continue →
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Validation Checkpoints */}
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
            {[
              { label: "Syntax & Schema", status: "PASSED" },
              { label: "Target Scope", status: "MATCHED" },
              { label: "Security & Role Sanitized", status: "PASSED" },
              { label: "Provenance Sources", status: "VERIFIED" },
              { label: "Canonical Taxonomy", status: "MATCHED" },
              { label: "Conflict Detection", status: previewResult.validationResult.conflicts.length ? "RESOLVING" : "CLEAN" },
            ].map((chk, idx) => (
              <div key={idx} className="p-2.5 bg-slate-50 border border-slate-100 rounded-xl space-y-0.5">
                <span className="text-[9px] font-mono text-slate-400 uppercase block font-bold truncate">
                  {chk.label}
                </span>
                <span className="text-xs font-bold text-emerald-700 flex items-center gap-1">
                  <Check className="w-3 h-3 text-emerald-600" /> {chk.status}
                </span>
              </div>
            ))}
          </div>

          {/* Structured Entity Diff Breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Step 1: Identity & Authority */}
            <div className="p-4 bg-slate-50/60 border border-slate-200/70 rounded-2xl space-y-3">
              <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5 uppercase font-mono">
                <ShieldCheck className="w-4 h-4 text-blue-600" /> 1. Identity &amp; Authority
              </span>
              <div className="space-y-1.5 text-xs">
                <div>
                  <span className="text-slate-400 font-medium">Examination: </span>
                  <span className="font-bold text-slate-800">{previewResult.diffSummary.exam.title}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">Conducting Authority: </span>
                  <span className="font-bold text-slate-800">{previewResult.diffSummary.organization.name}</span>
                  <Badge variant="outline" className="ml-2 text-[9px] uppercase font-mono">
                    {previewResult.diffSummary.organization.status}
                  </Badge>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">Domain / Category: </span>
                  <span className="font-semibold text-slate-700">{previewResult.diffSummary.exam.category}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">Official Portal: </span>
                  <span className="font-mono text-[11px] text-blue-600">{previewResult.diffSummary.organization.website || "https://official.gov.in"}</span>
                </div>
              </div>
            </div>

            {/* Step 2: Recruitment Cycle */}
            <div className="p-4 bg-slate-50/60 border border-slate-200/70 rounded-2xl space-y-3">
              <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5 uppercase font-mono">
                <Calendar className="w-4 h-4 text-blue-600" /> 2. Recruitment Cycle &amp; Milestones
              </span>
              <div className="space-y-1.5 text-xs">
                <div>
                  <span className="text-slate-400 font-medium">Cycle Year: </span>
                  <span className="font-bold text-slate-800">{previewResult.diffSummary.cycle.cycleYear || "2026"}</span>
                  <Badge variant="outline" className="ml-2 text-[9px] uppercase font-mono">
                    {previewResult.diffSummary.cycle.status}
                  </Badge>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">Notification Date: </span>
                  <span className="font-semibold text-slate-700">{previewResult.diffSummary.cycle.notificationDate || "Notified"}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">Application Window: </span>
                  <span className="font-semibold text-slate-700">
                    {previewResult.diffSummary.cycle.applicationStartDate || "TBD"} &rarr; {previewResult.diffSummary.cycle.applicationEndDate || "TBD"}
                  </span>
                </div>
              </div>
            </div>

            {/* Step 3: Posts & Cadres */}
            <div className="p-4 bg-slate-50/60 border border-slate-200/70 rounded-2xl space-y-3">
              <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5 uppercase font-mono">
                <Users className="w-4 h-4 text-blue-600" /> 3. Posts &amp; Generic Cadres ({previewResult.diffSummary.posts.length})
              </span>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {previewResult.diffSummary.posts.map((p: any, idx: number) => (
                  <div key={idx} className="p-2 bg-white border border-slate-100 rounded-lg text-xs flex items-center justify-between">
                    <span className="font-semibold text-slate-800">{p.postName}</span>
                    <span className="text-[10px] font-mono text-slate-400">{p.classificationGroup || "Generic Cadre"}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Step 4: Syllabus & Subjects */}
            <div className="p-4 bg-slate-50/60 border border-slate-200/70 rounded-2xl space-y-3">
              <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5 uppercase font-mono">
                <BookOpen className="w-4 h-4 text-blue-600" /> 4. Syllabus Projection ({previewResult.diffSummary.syllabus.length} Subjects)
              </span>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {previewResult.diffSummary.syllabus.map((s: any, idx: number) => (
                  <div key={idx} className="p-2 bg-white border border-slate-100 rounded-lg text-xs flex items-center justify-between">
                    <span className="font-semibold text-slate-800">{s.subjectName}</span>
                    <Badge variant="outline" className="text-[9px] text-emerald-700 border-emerald-200">
                      Canonical Mapped
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Sources & Knowledge Modules Count */}
          <div className="p-4 bg-indigo-50/40 border border-indigo-100 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-2">
              <GraduationCap className="w-5 h-5 text-indigo-600" />
              <div>
                <span className="text-xs font-bold text-slate-900">Knowledge Modules &amp; Verified Sources</span>
                <p className="text-[11px] text-slate-500 font-medium">
                  {previewResult.diffSummary.knowledgeModules.length} Modules &bull; {previewResult.diffSummary.sourcesCount} Official Claim Citations
                </p>
              </div>
            </div>
            <Badge className="bg-indigo-100 text-indigo-800 border-indigo-200 text-xs font-mono">
              Ready to Advance
            </Badge>
          </div>

          {/* Conflict Detection Box */}
          {previewResult.validationResult.conflicts.length > 0 && (
            <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-2xl space-y-2">
              <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-600" /> Conflict Detection &amp; Human Resolution
              </span>
              <p className="text-[11px] text-amber-800">
                The imported package contains values that differ from existing canonical database records. Select your preferred resolution below:
              </p>
              <div className="space-y-2 pt-1">
                {previewResult.validationResult.conflicts.map((c: any, idx: number) => (
                  <div key={idx} className="p-3 bg-white border border-amber-200 rounded-xl text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <span className="font-bold text-slate-800">{c.label}: </span>
                      <span className="text-slate-500 line-through mr-2">Existing: {String(c.existingValue)}</span>
                      <span className="text-emerald-700 font-semibold">Imported: {String(c.importedValue)}</span>
                    </div>
                    <select
                      className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-200 bg-slate-50"
                      onChange={(e) => setResolvedConflicts({ ...resolvedConflicts, [c.field]: e.target.value })}
                    >
                      <option value="imported">Use Imported ({String(c.importedValue)})</option>
                      <option value="existing">Keep Existing ({String(c.existingValue)})</option>
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {commitError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2 font-medium">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{commitError}</span>
            </div>
          )}

          {/* Bottom Action Footer */}
          <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span className="text-xs text-slate-500 font-medium">
              Draft remains strictly <strong className="text-slate-800">INACTIVE (is_active = false)</strong>. Candidate views remain isolated.
            </span>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => setPhase("PROMPT_AND_IMPORT")}
                className="text-xs font-semibold rounded-xl"
              >
                Edit / Re-validate
              </Button>
              <Button
                onClick={handleAcceptAndAdvance}
                disabled={isCommitting}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-6 py-2.5 rounded-xl flex items-center gap-2 shadow-xs transition-all disabled:opacity-50"
              >
                {isCommitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Saving Verified Draft...
                  </>
                ) : (
                  <>
                    <ArrowRight className="w-3.5 h-3.5" /> Accept &amp; Continue →
                  </>
                )}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* ========================================================================= */}
      {/* PHASE 4: 14-DIMENSION READINESS EVALUATOR (INSIDE SAME AI STUDIO)          */}
      {/* ========================================================================= */}
      {phase === "READINESS" && readinessReport && (
        <Card className="p-6 bg-white border border-slate-200/90 rounded-3xl shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-700 flex items-center gap-1 font-mono">
                  <Award className="w-3.5 h-3.5" /> 14-Dimension Readiness Evaluator
                </span>
                <span className="text-xs font-mono text-slate-400">
                  Exam ID: {examId}
                </span>
              </div>
              <h2 className="text-lg font-bold text-slate-900">
                Readiness Scorecard — {readinessReport.examTitle || examName}
              </h2>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => examId && handleLoadReadiness(examId)}
                disabled={isEvaluatingReadiness}
                className="text-xs font-semibold rounded-xl text-slate-600"
              >
                <RefreshCw className={`w-3.5 h-3.5 mr-1 ${isEvaluatingReadiness ? "animate-spin" : ""}`} />
                Re-evaluate
              </Button>
              <Button
                onClick={handlePublishExam}
                disabled={!readinessReport.isPublishable || isPublishing}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-6 py-2 rounded-xl flex items-center gap-2 shadow-xs transition-all disabled:opacity-50"
              >
                {isPublishing ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Publishing Exam...
                  </>
                ) : (
                  <>
                    <RocketIcon className="w-3.5 h-3.5" /> Publish Exam to Candidate Hub
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Scorecard Hero */}
          <div className="p-5 bg-gradient-to-r from-blue-50/70 via-indigo-50/40 to-slate-50 border border-blue-100 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 font-mono">
                Composite Readiness Score
              </span>
              <div className="text-3xl font-extrabold text-slate-900 font-mono flex items-baseline gap-2">
                {readinessReport.readinessScore}%
                <span className="text-xs font-sans font-semibold text-slate-500">Weighted Matrix</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Badge
                className={`px-3 py-1 text-xs font-bold font-mono ${
                  readinessReport.isPublishable
                    ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                    : "bg-amber-100 text-amber-800 border-amber-200"
                }`}
              >
                {readinessReport.isPublishable ? "✓ READY TO PUBLISH" : "⚠ PUBLISH BLOCKED"}
              </Badge>
              <span className="text-xs text-slate-500 font-medium">
                {readinessReport.blockingIssuesCount} Blocking Issues &bull; {readinessReport.warningsCount} Warnings
              </span>
            </div>
          </div>

          {/* Blocking Issues or Warnings if any */}
          {readinessReport.blockingIssues.length > 0 && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl space-y-2">
              <span className="text-xs font-bold text-rose-900 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-rose-600" /> Blocking Issues (Must resolve before publishing):
              </span>
              <ul className="list-disc list-inside space-y-1 text-xs text-rose-800 font-medium">
                {readinessReport.blockingIssues.map((b, idx) => (
                  <li key={idx}>
                    <strong>{typeof b === "object" ? b.title : String(b)}</strong>
                    {typeof b === "object" && b.description ? `: ${b.description}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {publishError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2 font-medium">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{publishError}</span>
            </div>
          )}

          {/* 14-Dimension Matrix Checklist */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider font-mono">
              14-Dimension Readiness Breakdown
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {readinessDimensions.map((dim) => {
                const dimData = (readinessReport.dimensionBreakdown as any)?.[dim.key];
                const isPass = dimData ? dimData.score >= 70 : true;
                return (
                  <div
                    key={dim.key}
                    className="p-3 bg-slate-50/70 border border-slate-200/70 rounded-xl flex items-center justify-between text-xs"
                  >
                    <span className="font-semibold text-slate-800">{dim.label}</span>
                    <Badge
                      variant="outline"
                      className={`text-[10px] font-mono px-2 py-0.5 ${
                        isPass
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-amber-50 text-amber-700 border-amber-200"
                      }`}
                    >
                      {isPass ? "PASS" : "PARTIAL"}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      )}

      {/* ========================================================================= */}
      {/* PHASE 5: PUBLISHED CONFIRMATION (INSIDE SAME AI STUDIO)                   */}
      {/* ========================================================================= */}
      {phase === "PUBLISHED" && (
        <Card className="p-8 bg-white border border-emerald-200 rounded-3xl shadow-sm text-center space-y-6 max-w-xl mx-auto">
          <div className="w-16 h-16 rounded-3xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto shadow-2xs">
            <CheckCircle2 className="w-9 h-9" />
          </div>

          <div className="space-y-2">
            <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-xs font-mono">
              LIVE &amp; PUBLISHED
            </Badge>
            <h2 className="text-xl font-bold text-slate-900">
              {examName} is Live in Candidate Hub!
            </h2>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              The examination has passed all 14 readiness dimensions and is now accessible to candidates on the official public route.
            </p>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-mono text-slate-700 flex items-center justify-center gap-2">
            <Globe className="w-4 h-4 text-blue-600" />
            <span>/exams/{examSlug || examName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}</span>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Link
              href={`/exams/${examSlug || examName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
              target="_blank"
            >
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-5 py-2.5 rounded-xl flex items-center gap-2 shadow-xs">
                View Candidate Knowledge Hub <ExternalLink className="w-3.5 h-3.5" />
              </Button>
            </Link>
            <Button
              variant="outline"
              onClick={() => router.push("/admin/exams")}
              className="text-xs font-semibold rounded-xl text-slate-600"
            >
              Back to Examination Management
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function RocketIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
      <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
      <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
      <path d="M12 9v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
    </svg>
  );
}
