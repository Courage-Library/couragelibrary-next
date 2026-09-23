"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AdminBreadcrumbs } from "@/components/admin/admin-breadcrumbs";
import { AiPromptModal } from "./ai-prompt-modal";
import {
  generateMasterExamPromptAction,
  validateAndPreviewAiImportAction,
  commitAiExamImportAction,
} from "@/app/admin/exams/actions";
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
} from "lucide-react";

export function AiAssistedOnboardingStudio() {
  const router = useRouter();

  // Form State
  const [examName, setExamName] = useState("");
  const [cycleYear, setCycleYear] = useState<number>(new Date().getFullYear());
  const [category, setCategory] = useState("National Recruitment");
  const [orgName, setOrgName] = useState("");
  const [additionalInstructions, setAdditionalInstructions] = useState("");

  // Prompt Generation State
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  const [promptResult, setPromptResult] = useState<{
    promptText: string;
    promptVersion: string;
    contextHash: string;
  } | null>(null);
  const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);

  // Import State
  const [rawJsonInput, setRawJsonInput] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [previewResult, setPreviewResult] = useState<any>(null);
  const [resolvedConflicts, setResolvedConflicts] = useState<Record<string, any>>({});
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);

  // Trigger Master Prompt Generation
  const handleGeneratePrompt = async () => {
    if (!examName.trim()) return;
    setIsGeneratingPrompt(true);
    try {
      const res = await generateMasterExamPromptAction({
        examName: examName.trim(),
        cycleYear: Number(cycleYear) || undefined,
        category: category.trim(),
        conductingOrgName: orgName.trim() || undefined,
        additionalInstructions: additionalInstructions.trim() || undefined,
      });

      if (res.success && res.promptText) {
        setPromptResult({
          promptText: res.promptText,
          promptVersion: res.promptVersion || "CL-EXAM-ONBOARDING-v1.0",
          contextHash: res.contextHash || "",
        });
        setIsPromptModalOpen(true);
      }
    } finally {
      setIsGeneratingPrompt(false);
    }
  };

  // Trigger Preview Validation
  const handleValidatePreview = async () => {
    if (!rawJsonInput.trim()) return;
    setIsValidating(true);
    setCommitError(null);
    try {
      const res = await validateAndPreviewAiImportAction(rawJsonInput, {
        targetExamName: examName.trim() || undefined,
        targetCycleYear: Number(cycleYear) || undefined,
        expectedContextHash: promptResult?.contextHash || undefined,
      });

      if (res.success && res.preview) {
        setPreviewResult(res.preview);
      } else {
        setCommitError(res.error || "Failed to validate AI payload.");
      }
    } finally {
      setIsValidating(false);
    }
  };

  // Commit Draft
  const handleCommitDraft = async () => {
    if (!previewResult?.validationResult?.spec) return;
    setIsCommitting(true);
    setCommitError(null);
    try {
      const res = await commitAiExamImportAction(previewResult.validationResult.spec, {
        resolvedConflicts,
      });

      if (res.success && res.result?.examId) {
        router.push("/admin/exams/onboarding?examId=" + res.result.examId);
      } else {
        setCommitError(res.error || "Failed to persist draft exam.");
      }
    } finally {
      setIsCommitting(false);
    }
  };

  return (
    <div className="space-y-6 w-full pb-12">
      {/* Breadcrumbs */}
      <AdminBreadcrumbs
        items={[
          { label: "Dashboard", href: "/admin" },
          { label: "Examinations", href: "/admin/exams" },
          { label: "AI-Assisted Exam Onboarding", active: true },
        ]}
      />

      {/* Heading */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-700 flex items-center gap-1 font-mono">
              <Sparkles className="w-3 h-3" /> External AI Import Control Plane
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <Bot className="w-6 h-6 text-blue-600" /> AI-Assisted Exam Onboarding Studio
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 font-medium">
            Know only the exam name? Generate an authoritative research prompt for external AI, validate the structured package, and import directly into the canonical control plane.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push("/admin/exams/onboarding")}
          className="text-xs font-semibold rounded-xl text-slate-600"
        >
          Switch to Manual Wizard
        </Button>
      </div>

      {/* Step Progress Tracker */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <Card className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 font-mono">
            1. Target Scope
          </span>
          <p className="text-xs font-semibold text-slate-800">Enter Exam Identity</p>
        </Card>
        <Card className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">
            2. Research Prompt
          </span>
          <p className="text-xs font-semibold text-slate-800">Generate & Copy</p>
        </Card>
        <Card className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">
            3. Multi-Gate Ingestion
          </span>
          <p className="text-xs font-semibold text-slate-800">Paste & Validate JSON</p>
        </Card>
        <Card className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">
            4. Readiness & Commit
          </span>
          <p className="text-xs font-semibold text-slate-800">Save Canonical Draft</p>
        </Card>
      </div>

      {/* Grid: Left Input/Prompt Panel + Right Import/Preview Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Exam Name & Prompt Generator */}
        <div className="lg:col-span-5 space-y-5">
          <Card className="p-5 bg-white border border-slate-200/90 rounded-2xl shadow-xs space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <Sparkles className="w-4 h-4 text-blue-600" />
              <h2 className="text-sm font-bold text-slate-900">Step 0 — Target Exam Scope</h2>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">
                  Target Examination Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={examName}
                  onChange={(e) => setExamName(e.target.value)}
                  placeholder="e.g. IBPS PO, RRB NTPC, SBI Clerk"
                  className="w-full px-3.5 py-2 text-xs font-medium rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600">Recruitment Cycle Year</label>
                  <input
                    type="number"
                    value={cycleYear}
                    onChange={(e) => setCycleYear(parseInt(e.target.value, 10) || new Date().getFullYear())}
                    className="w-full px-3.5 py-2 text-xs font-medium rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600">Domain / Category</label>
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

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600">
                  Known Conducting Authority <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="e.g. Institute of Banking Personnel Selection (IBPS)"
                  className="w-full px-3.5 py-2 text-xs font-medium rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600">
                  Custom Research Directives <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <textarea
                  value={additionalInstructions}
                  onChange={(e) => setAdditionalInstructions(e.target.value)}
                  placeholder="e.g. Focus specifically on the latest notified pattern change or state-specific vacancies."
                  rows={2}
                  className="w-full px-3.5 py-2 text-xs font-medium rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>

              <Button
                onClick={handleGeneratePrompt}
                disabled={!examName.trim() || isGeneratingPrompt}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 shadow-xs transition-all disabled:opacity-50"
              >
                {isGeneratingPrompt ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" /> Assembling Authoritative Context...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" /> Generate Master AI Research Prompt
                  </>
                )}
              </Button>
            </div>
          </Card>

          {/* External AI Instructions Card */}
          <Card className="p-4 bg-slate-50/60 border border-slate-200/80 rounded-2xl space-y-2.5">
            <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <Bot className="w-4 h-4 text-slate-600" /> Supported External AI Tools
            </h3>
            <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
              Copy the generated master prompt and give it to ChatGPT (GPT-4o), Claude 3.5 Sonnet, Gemini 1.5 Pro, or Perplexity. These tools will return a machine-importable JSON object conforming strictly to <code className="text-blue-600 font-mono text-[10px]">CL-EXAM-ONBOARDING-v1.0</code>.
            </p>
          </Card>
        </div>

        {/* RIGHT COLUMN: Ingestion & Import Preview Panel */}
        <div className="lg:col-span-7 space-y-5">
          <Card className="p-5 bg-white border border-slate-200/90 rounded-2xl shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <UploadCloud className="w-4 h-4 text-blue-600" />
                <h2 className="text-sm font-bold text-slate-900">Import Structured Research Package</h2>
              </div>
              {previewResult && (
                <Badge className={previewResult.validationResult.isValid ? "bg-emerald-100 text-emerald-800 border-emerald-200" : "bg-rose-100 text-rose-800 border-rose-200"}>
                  {previewResult.validationResult.isValid ? "Validation Passed" : "Blocking Issues"}
                </Badge>
              )}
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">
                  Paste External AI JSON Response
                </label>
                <textarea
                  value={rawJsonInput}
                  onChange={(e) => setRawJsonInput(e.target.value)}
                  placeholder="Paste full JSON output (with or without markdown code fences)..."
                  rows={8}
                  className="w-full p-3 font-mono text-[11px] rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              <div className="flex items-center justify-between">
                <Button
                  onClick={handleValidatePreview}
                  disabled={!rawJsonInput.trim() || isValidating}
                  className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-4 py-2 rounded-xl flex items-center gap-2 shadow-xs disabled:opacity-50"
                >
                  {isValidating ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Ingesting & Validating...
                    </>
                  ) : (
                    <>
                      <FileCode2 className="w-3.5 h-3.5" /> Validate & Preview Diff
                    </>
                  )}
                </Button>

                {previewResult && (
                  <span className="text-[11px] text-slate-500 font-medium">
                    {previewResult.diffSummary.posts.length} Posts &bull; {previewResult.diffSummary.sourcesCount} Sources &bull; {previewResult.diffSummary.knowledgeModules.length} Modules
                  </span>
                )}
              </div>
            </div>

            {commitError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2 font-medium">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{commitError}</span>
              </div>
            )}
          </Card>

          {/* PREVIEW & DIFF SUMMARY PANEL */}
          {previewResult && (
            <Card className="p-5 bg-white border border-slate-200/90 rounded-2xl shadow-xs space-y-4 animate-in fade-in duration-200">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Ingestion Preview & Diff
                </h3>
                <span className="text-xs font-mono text-slate-400">
                  Hash: {previewResult.contextHash || "N/A"}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase font-mono">Conducting Org</span>
                  <p className="text-xs font-bold text-slate-800 truncate">{previewResult.diffSummary.organization.name}</p>
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                    {previewResult.diffSummary.organization.status}
                  </Badge>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase font-mono">Cycle Year</span>
                  <p className="text-xs font-bold text-slate-800">{previewResult.diffSummary.cycle.cycleYear || "Timeless"}</p>
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                    {previewResult.diffSummary.cycle.status}
                  </Badge>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase font-mono">Posts Extracted</span>
                  <p className="text-xs font-bold text-slate-800">{previewResult.diffSummary.posts.length} Cadres</p>
                  <span className="text-[10px] text-slate-500">Generic Scale</span>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase font-mono">Syllabus Subjects</span>
                  <p className="text-xs font-bold text-slate-800">{previewResult.diffSummary.syllabus.length} Subjects</p>
                  <span className="text-[10px] text-emerald-600 font-semibold">Canonical Mapped</span>
                </div>
              </div>

              {/* Conflicts Box if any */}
              {previewResult.validationResult.conflicts.length > 0 && (
                <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-xl space-y-2">
                  <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> Conflict Detection & Human Resolution
                  </span>
                  <p className="text-[11px] text-amber-800">
                    The imported package contains values that differ from existing canonical database records. Select your preferred value below:
                  </p>
                  <div className="space-y-2 pt-1">
                    {previewResult.validationResult.conflicts.map((c: any, idx: number) => (
                      <div key={idx} className="p-2.5 bg-white border border-amber-200/80 rounded-lg text-xs flex items-center justify-between">
                        <div>
                          <span className="font-bold text-slate-800">{c.label}: </span>
                          <span className="text-slate-500 line-through mr-2">Existing: {String(c.existingValue)}</span>
                          <span className="text-emerald-700 font-semibold">Imported: {String(c.importedValue)}</span>
                        </div>
                        <select
                          className="px-2 py-1 text-[11px] font-semibold rounded border border-slate-200 bg-slate-50"
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

              <div className="pt-2 flex items-center justify-between border-t border-slate-100">
                <span className="text-xs text-slate-500 font-medium">
                  Draft will be created with status <strong className="text-slate-700">DRAFT (Unpublished)</strong>.
                </span>

                <Button
                  onClick={handleCommitDraft}
                  disabled={!previewResult.validationResult.isValid || isCommitting}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-5 py-2 rounded-xl flex items-center gap-2 shadow-xs transition-all disabled:opacity-50"
                >
                  {isCommitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Creating Canonical Draft...
                    </>
                  ) : (
                    <>
                      <ArrowRight className="w-3.5 h-3.5" /> Commit Draft & Open Onboarding Studio
                    </>
                  )}
                </Button>
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Reusable AI Prompt Modal */}
      {promptResult && (
        <AiPromptModal
          isOpen={isPromptModalOpen}
          onClose={() => setIsPromptModalOpen(false)}
          title="Master Multi-Exam Research Prompt"
          promptText={promptResult.promptText}
          promptVersion={promptResult.promptVersion}
          contextHash={promptResult.contextHash}
        />
      )}
    </div>
  );
}
