"use client";

import React, { useState, useEffect } from "react";
import {
  LayoutDashboard,
  GraduationCap,
  Sparkles,
  FileText,
  ShieldCheck,
  Database,
  ArrowRight,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ExternalLink,
  ChevronRight,
  Eye,
  Check,
  Copy,
  PlusCircle,
  FileCode,
  Layers,
  History,
  Lock,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PromptViewerPanel } from "./prompt-viewer-panel";
import { FiveGatePreviewPanel } from "./five-gate-preview-panel";
import { AcademicReviewChecklist } from "./academic-review-checklist";
import type { AdminExamKnowledgeKPIs, ExamWorkspaceData } from "@/services/exam-knowledge/admin-exam-knowledge.service";
import type { ExamModuleKey, ExamDocReviewStatus, ExamFiveGateValidationResult } from "@/types/exam-knowledge";
import { generateExamKnowledgePromptAction } from "@/actions/exam-knowledge-prompt.actions";
import { importExamKnowledgeAction } from "@/actions/exam-knowledge-import.actions";
import {
  getAdminExamKnowledgeDashboardAction,
  getExamsAndCyclesAction,
  getExamWorkspaceAction,
  getDraftsListAction,
  getDocumentDetailAction,
  updateDocVersionReviewStatusAction,
  compileExamDocVersionAction,
  publishExamDocVersionAction,
  createRevisionDraftAction,
  verifyExamSourceAction,
  verifyExamClaimAction,
} from "@/actions/admin-exam-knowledge.actions";

interface Props {
  initialKpis: AdminExamKnowledgeKPIs;
  initialExams: Array<{
    id: string;
    name: string;
    slug: string;
    is_active: boolean;
    conducting_org?: { name: string; code: string; official_portal_url?: string };
    cycles: Array<{ id: string; year: number; is_active: boolean; notification_date?: string }>;
  }>;
}

type StudioTab = "DASHBOARD" | "EXAMS" | "AUTHORING" | "DRAFTS" | "REVIEW" | "PROVENANCE";

export function ExamKnowledgeStudioView({ initialKpis, initialExams }: Props) {
  const [activeTab, setActiveTab] = useState<StudioTab>("DASHBOARD");
  const [kpis, setKpis] = useState<AdminExamKnowledgeKPIs>(initialKpis);
  const [exams, setExams] = useState(initialExams);

  // Selected Target for Workspace & Authoring
  const [selectedExamId, setSelectedExamId] = useState<string>(initialExams[0]?.id || "");
  const [selectedCycleId, setSelectedCycleId] = useState<string>("");
  const [selectedModuleKey, setSelectedModuleKey] = useState<ExamModuleKey>("EXAM_OVERVIEW");

  // Workspace Data
  const [workspace, setWorkspace] = useState<ExamWorkspaceData | null>(null);
  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(false);

  // Authoring State
  const [generatedPrompt, setGeneratedPrompt] = useState<string | null>(null);
  const [contractVersion, setContractVersion] = useState<string>("CL-EXAM-AUTHOR-v1.0");
  const [contextHash, setContextHash] = useState<string>("");
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  const [promptError, setPromptError] = useState<string | null>(null);

  // Import & Validation State
  const [rawAiResponse, setRawAiResponse] = useState<string>("");
  const [validationResult, setValidationResult] = useState<ExamFiveGateValidationResult | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<any | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // Drafts State
  const [draftsList, setDraftsList] = useState<any[]>([]);
  const [isLoadingDrafts, setIsLoadingDrafts] = useState(false);
  const [draftFilterStatus, setDraftFilterStatus] = useState<string>("ALL");

  // Review Workbench State
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [documentDetail, setDocumentDetail] = useState<any | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isChecklistComplete, setIsChecklistComplete] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isCompiling, setIsCompiling] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [reviewMessage, setReviewMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Load Workspace when exam or cycle changes
  useEffect(() => {
    if (selectedExamId) {
      loadWorkspace(selectedExamId, selectedCycleId || null);
    }
  }, [selectedExamId, selectedCycleId]);

  // Load Drafts when switching to DRAFTS tab
  useEffect(() => {
    if (activeTab === "DRAFTS") {
      loadDrafts();
    }
  }, [activeTab]);

  const loadWorkspace = async (examId: string, cycleId?: string | null) => {
    setIsLoadingWorkspace(true);
    try {
      const res = await getExamWorkspaceAction(examId, cycleId);
      if (res.success && res.workspace) {
        setWorkspace(res.workspace);
      }
    } finally {
      setIsLoadingWorkspace(false);
    }
  };

  const loadDrafts = async () => {
    setIsLoadingDrafts(true);
    try {
      const filterObj = draftFilterStatus !== "ALL" ? { reviewStatus: draftFilterStatus as ExamDocReviewStatus } : undefined;
      const res = await getDraftsListAction(filterObj);
      if (res.success && res.drafts) {
        setDraftsList(res.drafts);
      }
    } finally {
      setIsLoadingDrafts(false);
    }
  };

  const loadDocumentDetail = async (versionId: string) => {
    setSelectedVersionId(versionId);
    setIsLoadingDetail(true);
    setReviewMessage(null);
    try {
      const res = await getDocumentDetailAction(versionId);
      if (res.success && res.detail) {
        setDocumentDetail(res.detail);
        setActiveTab("REVIEW");
      }
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const handleGeneratePrompt = async () => {
    if (!selectedExamId || !selectedModuleKey) return;
    setIsGeneratingPrompt(true);
    setPromptError(null);
    setGeneratedPrompt(null);
    setImportResult(null);

    try {
      const res = await generateExamKnowledgePromptAction({
        examId: selectedExamId,
        examCycleId: selectedCycleId || undefined,
        moduleKey: selectedModuleKey,
        language: "en",
      });

      if (res.success && res.data) {
        setGeneratedPrompt(res.data.promptText);
        setContractVersion(res.data.promptContractVersion || "CL-EXAM-AUTHOR-v1.0");
        setContextHash(res.data.contextHash || "");
      } else {
        setPromptError(res.error || "Failed to generate prompt.");
      }
    } catch (err: any) {
      setPromptError(err.message || "An unexpected error occurred while generating prompt.");
    } finally {
      setIsGeneratingPrompt(false);
    }
  };

  const handleImportResponse = async () => {
    if (!rawAiResponse.trim() || !selectedExamId || !selectedModuleKey) return;
    setIsImporting(true);
    setImportError(null);
    setImportResult(null);

    const selectedExam = exams.find((e) => e.id === selectedExamId);
    const selectedCycle = selectedExam?.cycles?.find((c) => c.id === selectedCycleId);

    try {
      const res = await importExamKnowledgeAction({
        rawInput: rawAiResponse,
        expectedTarget: {
          examId: selectedExamId,
          examSlug: selectedExam?.slug || "",
          examName: selectedExam?.name || "",
          examCycleId: selectedCycleId || undefined,
          cycleYear: selectedCycle?.year,
          moduleKey: selectedModuleKey,
          language: "en",
          promptContractVersion: "CL-EXAM-AUTHOR-v1.0",
        },
        expectedContextHash: contextHash,
        externalAiTool: "MANUAL_IMPORT",
      });

      if (res.data?.validation) {
        setValidationResult(res.data.validation);
      }

      if (res.success && res.data?.status === "IMPORTED") {
        setImportResult(res.data);
        setRawAiResponse("");
        getAdminExamKnowledgeDashboardAction().then((kRes) => {
          if (kRes.success && kRes.kpis) setKpis(kRes.kpis);
        });
      } else if (res.data?.status === "DUPLICATE") {
        setImportError(`Duplicate import: This exact payload is already saved as version ${res.data.versionNumber}.`);
      } else {
        setImportError(res.data?.errorMessage || res.error || "Import rejected by validation gates.");
      }
    } catch (err: any) {
      setImportError(err.message || "Import failed due to an unexpected error.");
    } finally {
      setIsImporting(false);
    }
  };

  const handleUpdateReviewStatus = async (newStatus: ExamDocReviewStatus, feedback?: string) => {
    if (!selectedVersionId) return;
    setIsUpdatingStatus(true);
    setReviewMessage(null);
    try {
      const res = await updateDocVersionReviewStatusAction({
        versionId: selectedVersionId,
        newStatus,
        feedback,
      });
      if (res.success) {
        setReviewMessage({ type: "success", text: `Review status successfully updated to ${newStatus}.` });
        loadDocumentDetail(selectedVersionId);
      } else {
        setReviewMessage({ type: "error", text: res.error || "Failed to update status." });
      }
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleCompileVersion = async () => {
    if (!selectedVersionId) return;
    setIsCompiling(true);
    setReviewMessage(null);
    try {
      const res = await compileExamDocVersionAction(selectedVersionId);
      if (res.success) {
        setReviewMessage({ type: "success", text: "Document successfully compiled into MDX with verified security scan." });
        loadDocumentDetail(selectedVersionId);
      } else {
        setReviewMessage({ type: "error", text: res.error || "Compilation failed." });
      }
    } finally {
      setIsCompiling(false);
    }
  };

  const handlePublishVersion = async () => {
    if (!selectedVersionId) return;
    setIsPublishing(true);
    setReviewMessage(null);
    try {
      const res = await publishExamDocVersionAction(selectedVersionId);
      if (res.success) {
        setReviewMessage({ type: "success", text: "Document successfully published! Version is now locked and immutable." });
        loadDocumentDetail(selectedVersionId);
        getAdminExamKnowledgeDashboardAction().then((kRes) => {
          if (kRes.success && kRes.kpis) setKpis(kRes.kpis);
        });
      } else {
        setReviewMessage({ type: "error", text: res.error || "Publication failed." });
      }
    } finally {
      setIsPublishing(false);
    }
  };

  const handleCreateRevision = async () => {
    if (!documentDetail?.document?.id || !selectedVersionId) return;
    try {
      const res = await createRevisionDraftAction({
        documentId: documentDetail.document.id,
        baseVersionId: selectedVersionId,
      });
      if (res.success && 'newVersionId' in res && res.newVersionId) {
        setReviewMessage({ type: "success", text: `New revision draft v${res.versionNumber} created successfully.` });
        loadDocumentDetail(res.newVersionId);
      } else {
        setReviewMessage({ type: "error", text: res.error || "Failed to create revision draft." });
      }
    } catch (err: any) {
      setReviewMessage({ type: "error", text: err.message || "Failed to create revision." });
    }
  };

  const selectedExamObj = exams.find((e) => e.id === selectedExamId);
  const selectedCycleObj = selectedExamObj?.cycles?.find((c) => c.id === selectedCycleId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <GraduationCap className="w-5 h-5 text-blue-600" />
            <h1 className="text-xl font-black text-slate-900 tracking-tight">Exam Knowledge Studio</h1>
            <Badge variant="indigo" className="text-[10px] font-mono px-2 py-0.5 bg-blue-50 text-blue-700 border-blue-200">CONTROL PLANE</Badge>
          </div>
          <p className="text-xs text-slate-500">Authoritative multi-exam knowledge authoring, 5-gate validation, and publication lifecycle.</p>
        </div>

        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs font-semibold">
          <button
            onClick={() => setActiveTab("DASHBOARD")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${activeTab === "DASHBOARD" ? "bg-white text-blue-700 shadow-xs font-bold" : "text-slate-600 hover:text-slate-900"}`}
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            <span>Dashboard</span>
          </button>
          <button
            onClick={() => setActiveTab("EXAMS")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${activeTab === "EXAMS" ? "bg-white text-blue-700 shadow-xs font-bold" : "text-slate-600 hover:text-slate-900"}`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Exams & Modules</span>
          </button>
          <button
            onClick={() => setActiveTab("AUTHORING")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${activeTab === "AUTHORING" ? "bg-white text-blue-700 shadow-xs font-bold" : "text-slate-600 hover:text-slate-900"}`}
          >
            <Sparkles className="w-3.5 h-3.5 text-blue-600" />
            <span>Authoring Workbench</span>
          </button>
          <button
            onClick={() => setActiveTab("DRAFTS")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${activeTab === "DRAFTS" ? "bg-white text-blue-700 shadow-xs font-bold" : "text-slate-600 hover:text-slate-900"}`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Drafts ({kpis.draftsAwaitingReview})</span>
          </button>
          <button
            onClick={() => setActiveTab("REVIEW")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${activeTab === "REVIEW" ? "bg-white text-blue-700 shadow-xs font-bold" : "text-slate-600 hover:text-slate-900"}`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Review Workbench</span>
          </button>
        </div>
      </div>

      {/* TAB 1: DASHBOARD */}
      {activeTab === "DASHBOARD" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            <div className="p-3.5 rounded-xl border border-slate-200 bg-white shadow-xs">
              <span className="text-[10px] font-mono uppercase font-bold text-slate-400 block">Total Exams</span>
              <span className="text-xl font-black text-slate-900 mt-1 block">{kpis.totalExams}</span>
            </div>
            <div className="p-3.5 rounded-xl border border-slate-200 bg-white shadow-xs">
              <span className="text-[10px] font-mono uppercase font-bold text-slate-400 block">Active Exams</span>
              <span className="text-xl font-black text-blue-600 mt-1 block">{kpis.activeExams}</span>
            </div>
            <div className="p-3.5 rounded-xl border border-slate-200 bg-white shadow-xs">
              <span className="text-[10px] font-mono uppercase font-bold text-slate-400 block">Active Cycles</span>
              <span className="text-xl font-black text-slate-900 mt-1 block">{kpis.activeCycles}</span>
            </div>
            <div className="p-3.5 rounded-xl border border-slate-200 bg-white shadow-xs">
              <span className="text-[10px] font-mono uppercase font-bold text-slate-400 block">Total Documents</span>
              <span className="text-xl font-black text-slate-900 mt-1 block">{kpis.totalDocuments}</span>
            </div>
            <div className="p-3.5 rounded-xl border border-slate-200 bg-white shadow-xs">
              <span className="text-[10px] font-mono uppercase font-bold text-amber-600 block">Awaiting Review</span>
              <span className="text-xl font-black text-amber-600 mt-1 block">{kpis.draftsAwaitingReview}</span>
            </div>
            <div className="p-3.5 rounded-xl border border-slate-200 bg-white shadow-xs">
              <span className="text-[10px] font-mono uppercase font-bold text-emerald-600 block">Published Docs</span>
              <span className="text-xl font-black text-emerald-600 mt-1 block">{kpis.publishedDocuments}</span>
            </div>
            <div className="p-3.5 rounded-xl border border-slate-200 bg-white shadow-xs">
              <span className="text-[10px] font-mono uppercase font-bold text-slate-400 block">Unverified Srcs</span>
              <span className="text-xl font-black text-slate-900 mt-1 block">{kpis.unverifiedSources}</span>
            </div>
            <div className="p-3.5 rounded-xl border border-slate-200 bg-white shadow-xs">
              <span className="text-[10px] font-mono uppercase font-bold text-rose-600 block">Disputed Claims</span>
              <span className="text-xl font-black text-rose-600 mt-1 block">{kpis.claimsRequiringReview}</span>
            </div>
          </div>

          <div className="p-6 rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 shadow-xs space-y-4">
            <div className="max-w-2xl space-y-2">
              <h2 className="text-base font-bold text-slate-900">Unified Exam Knowledge Authoring</h2>
              <p className="text-xs text-slate-600 leading-relaxed">Generate deterministic, provider-neutral prompts for external AI models, validate structured JSON responses across 5 rigorous gates, and review candidate-ready exam guides.</p>
            </div>
            <div className="flex flex-wrap gap-3 pt-2">
              <button onClick={() => setActiveTab("EXAMS")} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-xs transition">
                <span>Browse Exam Modules Matrix</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => setActiveTab("AUTHORING")} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-xs transition">
                <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                <span>Launch Authoring Workbench</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: EXAMS */}
      {activeTab === "EXAMS" && (
        <div className="space-y-6">
          <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <label className="block text-[10px] font-mono font-bold uppercase text-slate-500 mb-1">Target Examination</label>
                <select value={selectedExamId} onChange={(e) => { setSelectedExamId(e.target.value); setSelectedCycleId(""); }} className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-bold text-slate-900">
                  {exams.map((ex) => (<option key={ex.id} value={ex.id}>{ex.name} ({ex.conducting_org?.code || "GOV"})</option>))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-mono font-bold uppercase text-slate-500 mb-1">Examination Cycle</label>
                <select value={selectedCycleId} onChange={(e) => setSelectedCycleId(e.target.value)} className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-bold text-slate-900">
                  <option value="">All / Timeless Baseline</option>
                  {selectedExamObj?.cycles?.map((cy) => (<option key={cy.id} value={cy.id}>Cycle {cy.year} {cy.is_active ? "(Active)" : ""}</option>))}
                </select>
              </div>
            </div>
            {selectedExamObj?.conducting_org?.official_portal_url && (
              <a href={selectedExamObj.conducting_org.official_portal_url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline font-medium">
                <span>Official Portal</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900">Knowledge Modules Matrix ({workspace?.modules?.length || 0} Modules)</h2>
              <span className="text-xs text-slate-500 font-mono">Driven by ExamModuleRegistry</span>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-mono text-[10px] uppercase font-bold">
                      <th className="py-3 px-4">Module Name</th>
                      <th className="py-3 px-3">Category</th>
                      <th className="py-3 px-3">Scope</th>
                      <th className="py-3 px-3">Applicability</th>
                      <th className="py-3 px-3">Current Status</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {workspace?.modules?.map((mod) => (
                      <tr key={mod.moduleKey} className="hover:bg-slate-50/80 transition">
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">{mod.title}</div>
                          <div className="text-[10px] font-mono text-slate-400">{mod.moduleKey}</div>
                        </td>
                        <td className="py-3 px-3"><span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-medium text-[11px]">{mod.category}</span></td>
                        <td className="py-3 px-3">{mod.isCycleSpecific ? <span className="text-[11px] font-mono text-blue-700 font-semibold">Annual Cycle</span> : <span className="text-[11px] font-mono text-slate-500">Timeless</span>}</td>
                        <td className="py-3 px-3">
                          {mod.applicability === "APPLICABLE" && <Badge variant="success" className="text-[10px]">APPLICABLE</Badge>}
                          {mod.applicability === "REQUIRES_CYCLE" && <Badge variant="warning" className="text-[10px] bg-amber-100 text-amber-800 border-amber-300">REQUIRES CYCLE</Badge>}
                          {mod.applicability === "NOT_APPLICABLE" && <Badge variant="outline" className="text-[10px]">NOT APPLICABLE</Badge>}
                        </td>
                        <td className="py-3 px-3">
                          <span className={`px-2 py-0.5 rounded-full font-mono text-[10px] font-bold ${mod.status === "PUBLISHED" ? "bg-emerald-100 text-emerald-800" : mod.status === "APPROVED" || mod.status === "COMPILED" ? "bg-blue-100 text-blue-800" : mod.status === "IN_REVIEW" || mod.status === "AI_RESPONSE_PENDING" ? "bg-amber-100 text-amber-800" : mod.status === "PROMPT_READY" ? "bg-purple-100 text-purple-800" : "bg-slate-100 text-slate-600"}`}>{mod.status}</span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          {mod.status === "PUBLISHED" || mod.versionId ? (
                            <button onClick={() => { if (mod.versionId) loadDocumentDetail(mod.versionId); }} className="px-3 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-[11px] transition inline-flex items-center gap-1">
                              <Eye className="w-3 h-3" />
                              <span>Inspect (v{mod.versionNumber})</span>
                            </button>
                          ) : (
                            <button disabled={mod.applicability !== "APPLICABLE"} onClick={() => { setSelectedModuleKey(mod.moduleKey); setActiveTab("AUTHORING"); }} className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-bold text-[11px] transition inline-flex items-center gap-1">
                              <Sparkles className="w-3 h-3" />
                              <span>Author</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: AUTHORING */}
      {activeTab === "AUTHORING" && (
        <div className="space-y-6">
          <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-600" />
                <h2 className="text-xs font-bold text-slate-900 uppercase font-mono tracking-wider">Authoring Target & Parameters</h2>
              </div>
              <Badge variant="indigo" className="text-[10px] font-mono">CL-EXAM-AUTHOR-v1.0</Badge>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] font-mono font-bold uppercase text-slate-500 mb-1">Target Exam</label>
                <select value={selectedExamId} onChange={(e) => setSelectedExamId(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-bold text-slate-900">
                  {exams.map((ex) => (<option key={ex.id} value={ex.id}>{ex.name}</option>))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-mono font-bold uppercase text-slate-500 mb-1">Target Cycle</label>
                <select value={selectedCycleId} onChange={(e) => setSelectedCycleId(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-bold text-slate-900">
                  <option value="">Timeless (No Annual Cycle)</option>
                  {selectedExamObj?.cycles?.map((cy) => (<option key={cy.id} value={cy.id}>{cy.year} Cycle</option>))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-mono font-bold uppercase text-slate-500 mb-1">Knowledge Module</label>
                <select value={selectedModuleKey} onChange={(e) => setSelectedModuleKey(e.target.value as ExamModuleKey)} className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-bold text-slate-900">
                  {workspace?.modules?.map((m) => (<option key={m.moduleKey} value={m.moduleKey}>{m.title} ({m.moduleKey})</option>))}
                </select>
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <button disabled={isGeneratingPrompt} onClick={handleGeneratePrompt} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold shadow-xs transition">
                {isGeneratingPrompt ? (<><RefreshCw className="w-3.5 h-3.5 animate-spin" /><span>Compiling Context...</span></>) : (<><Sparkles className="w-3.5 h-3.5" /><span>Generate Authoritative Prompt</span></>)}
              </button>
            </div>
            {promptError && (<div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium flex items-center gap-2"><XCircle className="w-4 h-4 text-rose-600 shrink-0" /><span>{promptError}</span></div>)}
          </div>

          {generatedPrompt && (
            <div className="space-y-4">
              <PromptViewerPanel promptText={generatedPrompt} contractVersion={contractVersion} contextHash={contextHash} targetIdentity={{ examName: selectedExamObj?.name || "", cycleYear: selectedCycleObj?.year, moduleKey: selectedModuleKey, language: "en" }} />
              <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/60 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-blue-950 uppercase font-mono tracking-wider">Manual External AI Workflow Guide</span>
                  <div className="flex items-center gap-1.5">
                    {["ChatGPT", "Claude", "Perplexity", "Gemini", "DeepSeek"].map((ai) => (<span key={ai} className="px-2 py-0.5 rounded-md bg-white border border-blue-200 text-[10px] font-bold text-blue-800 shadow-2xs">{ai}</span>))}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 text-xs">
                  <div className="p-2.5 bg-white rounded-lg border border-blue-100"><span className="text-[10px] font-mono font-bold text-blue-600 block mb-1">STEP 1</span><p className="text-slate-700 font-medium">Copy the authoritative prompt above.</p></div>
                  <div className="p-2.5 bg-white rounded-lg border border-blue-100"><span className="text-[10px] font-mono font-bold text-blue-600 block mb-1">STEP 2</span><p className="text-slate-700 font-medium">Open your preferred external AI tool.</p></div>
                  <div className="p-2.5 bg-white rounded-lg border border-blue-100"><span className="text-[10px] font-mono font-bold text-blue-600 block mb-1">STEP 3</span><p className="text-slate-700 font-medium">Paste the prompt into the chat window.</p></div>
                  <div className="p-2.5 bg-white rounded-lg border border-blue-100"><span className="text-[10px] font-mono font-bold text-blue-600 block mb-1">STEP 4</span><p className="text-slate-700 font-medium">Copy the structured JSON code fence returned.</p></div>
                  <div className="p-2.5 bg-white rounded-lg border border-blue-100"><span className="text-[10px] font-mono font-bold text-blue-600 block mb-1">STEP 5</span><p className="text-slate-700 font-medium">Paste the response below and click Validate & Import.</p></div>
                </div>
              </div>

              <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-xs space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-900 mb-1.5">Paste External AI Structured JSON Response</label>
                  <textarea rows={8} value={rawAiResponse} onChange={(e) => setRawAiResponse(e.target.value)} placeholder="Paste the ```json ... ``` response returned by ChatGPT / Claude / Perplexity / Gemini here..." className="w-full p-3.5 rounded-xl border border-slate-300 font-mono text-xs text-slate-800 bg-slate-50/50" />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <span className="text-[11px] text-slate-500 font-mono">{rawAiResponse.length.toLocaleString()} characters entered</span>
                  <button disabled={isImporting || !rawAiResponse.trim()} onClick={handleImportResponse} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-bold shadow-xs transition">
                    {isImporting ? (<><RefreshCw className="w-3.5 h-3.5 animate-spin" /><span>Running 5-Gate Validation...</span></>) : (<><ShieldCheck className="w-3.5 h-3.5" /><span>Validate & Import as Draft</span></>)}
                  </button>
                </div>
                {importError && (<div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-medium space-y-1"><div className="font-bold flex items-center gap-1.5"><XCircle className="w-4 h-4 text-rose-600" /><span>Import Rejected</span></div><p className="pl-5 text-rose-700">{importError}</p></div>)}
                {importResult && (
                  <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950 space-y-3 text-xs">
                    <div className="flex items-center gap-2 font-bold text-emerald-900"><CheckCircle2 className="w-4 h-4 text-emerald-600" /><span>Import Succeeded! Draft Created (is_published: false)</span></div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px]">
                      <div><span className="text-slate-500">Document ID:</span> <span className="font-bold">{importResult.documentId}</span></div>
                      <div><span className="text-slate-500">Version:</span> <span className="font-bold">v{importResult.versionNumber}</span></div>
                      <div><span className="text-slate-500">Status:</span> <span className="font-bold text-amber-700">{importResult.reviewStatus}</span></div>
                      <div><span className="text-slate-500">Published:</span> <span className="font-bold text-rose-700">NO (Draft)</span></div>
                    </div>
                  </div>
                )}
                {validationResult && (<div className="pt-2"><FiveGatePreviewPanel validationResult={validationResult} /></div>)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: DRAFTS */}
      {activeTab === "DRAFTS" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-bold text-slate-900">Draft Documents Awaiting Academic Review ({draftsList.length})</h2>
            <div className="flex items-center gap-2">
              <select value={draftFilterStatus} onChange={(e) => setDraftFilterStatus(e.target.value)} className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-bold text-slate-900">
                <option value="ALL">All Statuses</option>
                <option value="AI_GENERATED">AI_GENERATED</option>
                <option value="IN_REVIEW">IN_REVIEW</option>
                <option value="APPROVED">APPROVED</option>
                <option value="COMPILED">COMPILED</option>
                <option value="PUBLISHED">PUBLISHED</option>
              </select>
              <button onClick={loadDrafts} className="p-1.5 rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-700"><RefreshCw className="w-3.5 h-3.5" /></button>
            </div>
          </div>
          {draftsList.length === 0 ? (
            <div className="p-12 rounded-2xl border border-dashed border-slate-200 bg-white text-center space-y-3">
              <FileText className="w-8 h-8 mx-auto text-slate-400" />
              <div className="text-xs font-bold text-slate-700">No drafts are awaiting review</div>
              <p className="text-[11px] text-slate-500 max-w-sm mx-auto">Use the Authoring Workbench to generate a prompt, paste external AI responses, and import new draft versions.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-mono text-[10px] uppercase font-bold">
                    <th className="py-3 px-4">Target Exam & Module</th>
                    <th className="py-3 px-3">Version</th>
                    <th className="py-3 px-3">Author Type</th>
                    <th className="py-3 px-3">Review Status</th>
                    <th className="py-3 px-3">Created Date</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {draftsList.map((d) => (
                    <tr key={d.id} className="hover:bg-slate-50 transition">
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{d.document?.title || d.document?.moduleKey}</div>
                        <div className="text-[10px] font-mono text-slate-400">{d.document?.examName} {d.document?.cycleYear ? `(${d.document.cycleYear})` : ""} &bull; {d.document?.moduleKey}</div>
                      </td>
                      <td className="py-3 px-3 font-mono font-bold">v{d.versionNumber}</td>
                      <td className="py-3 px-3"><span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-mono text-[10px]">{d.authorType}</span></td>
                      <td className="py-3 px-3"><span className={`px-2 py-0.5 rounded-full font-mono text-[10px] font-bold ${d.reviewStatus === "PUBLISHED" ? "bg-emerald-100 text-emerald-800" : d.reviewStatus === "APPROVED" || d.reviewStatus === "COMPILED" ? "bg-blue-100 text-blue-800" : "bg-amber-100 text-amber-800"}`}>{d.reviewStatus}</span></td>
                      <td className="py-3 px-3 text-slate-500 font-mono text-[11px]">{new Date(d.createdAt).toLocaleDateString()}</td>
                      <td className="py-3 px-4 text-right">
                        <button onClick={() => loadDocumentDetail(d.id)} className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-[11px] transition inline-flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3" />
                          <span>Review</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 5: REVIEW */}
      {activeTab === "REVIEW" && (
        <div className="space-y-6">
          {!documentDetail ? (
            <div className="p-12 rounded-2xl border border-dashed border-slate-200 bg-white text-center space-y-3">
              <ShieldCheck className="w-8 h-8 mx-auto text-slate-400" />
              <div className="text-xs font-bold text-slate-700">No Document Version Selected</div>
              <p className="text-[11px] text-slate-500 max-w-sm mx-auto">Select a draft version from the Drafts tab or an existing document from the Exams matrix to inspect.</p>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="p-5 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono font-bold uppercase text-blue-600">{documentDetail.document?.exams?.name} {documentDetail.document?.exam_cycles?.year ? `(${documentDetail.document.exam_cycles.year})` : ""}</span>
                      <Badge variant="outline" className="font-mono text-[10px]">v{documentDetail.version?.version_number}</Badge>
                      <span className={`px-2 py-0.5 rounded-full font-mono text-[10px] font-bold ${documentDetail.version?.is_published ? "bg-emerald-100 text-emerald-800" : documentDetail.version?.review_status === "COMPILED" ? "bg-blue-100 text-blue-800" : "bg-amber-100 text-amber-800"}`}>{documentDetail.version?.review_status} {documentDetail.version?.is_published ? "(PUBLISHED)" : "(DRAFT)"}</span>
                    </div>
                    <h2 className="text-lg font-black text-slate-900">{documentDetail.document?.title || documentDetail.document?.module_key}</h2>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">Canonical Slug: {documentDetail.document?.slug}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {documentDetail.version?.review_status === "AI_GENERATED" && (
                      <button disabled={isUpdatingStatus} onClick={() => handleUpdateReviewStatus("IN_REVIEW")} className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition shadow-xs">Start Academic Review</button>
                    )}
                    {documentDetail.version?.review_status === "IN_REVIEW" && (
                      <>
                        <button disabled={isUpdatingStatus || !isChecklistComplete} onClick={() => handleUpdateReviewStatus("APPROVED")} className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-bold transition shadow-xs">Approve Academic Truth</button>
                        <button disabled={isUpdatingStatus} onClick={() => handleUpdateReviewStatus("REJECTED", "Factual claims inconsistent with official notification.")} className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition shadow-xs">Reject</button>
                      </>
                    )}
                    {documentDetail.version?.review_status === "APPROVED" && (
                      <button disabled={isCompiling} onClick={handleCompileVersion} className="px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition shadow-xs flex items-center gap-1.5"><FileCode className="w-3.5 h-3.5" /><span>Compile MDX Artifact</span></button>
                    )}
                    {documentDetail.version?.review_status === "COMPILED" && !documentDetail.version?.is_published && (
                      <button disabled={isPublishing} onClick={handlePublishVersion} className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow-xs flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" /><span>Publish Version (Immutable Lock)</span></button>
                    )}
                    {documentDetail.version?.is_published && (
                      <button onClick={handleCreateRevision} className="px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition shadow-xs flex items-center gap-1.5"><PlusCircle className="w-3.5 h-3.5 text-blue-400" /><span>Create Revision Draft (v{documentDetail.version?.version_number + 1})</span></button>
                    )}
                  </div>
                </div>
                {reviewMessage && (<div className={`p-3 rounded-xl border text-xs font-medium ${reviewMessage.type === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-950" : "bg-rose-50 border-rose-200 text-rose-950"}`}>{reviewMessage.text}</div>)}
              </div>
              <AcademicReviewChecklist onChecklistComplete={setIsChecklistComplete} />
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <div className="lg:col-span-2 space-y-4">
                  <div className="p-5 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-3">
                    <h3 className="text-xs font-bold text-slate-900 uppercase font-mono tracking-wider pb-2 border-b border-slate-100">Document Content Sections ({documentDetail.version?.structured_payload?.contentSections?.length || 0})</h3>
                    {documentDetail.version?.structured_payload?.contentSections?.map((sec: any, idx: number) => (
                      <div key={idx} className="p-4 rounded-xl border border-slate-100 bg-slate-50 space-y-2">
                        <div className="flex items-center justify-between"><span className="text-xs font-bold text-slate-900">{sec.title}</span><span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-600">{sec.sectionType}</span></div>
                        <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">{sec.bodyMarkdown}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs space-y-2.5 text-xs">
                    <span className="font-bold text-slate-900 block font-mono text-[11px] uppercase tracking-wide">Referenced Official Sources</span>
                    {documentDetail.version?.structured_payload?.officialSources?.map((s: any, idx: number) => (
                      <div key={idx} className="p-2.5 rounded-lg border border-slate-100 bg-slate-50">
                        <div className="font-bold text-slate-800 text-[11px]">{s.title}</div>
                        <div className="text-[10px] text-slate-500 font-mono">Authority: {s.authorityName}</div>
                        <a href={s.url} target="_blank" rel="noreferrer" className="text-[10px] text-blue-600 hover:underline truncate block mt-0.5">{s.url}</a>
                      </div>
                    ))}
                  </div>
                  <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs space-y-2.5 text-xs">
                    <span className="font-bold text-slate-900 block font-mono text-[11px] uppercase tracking-wide">Structured Claims</span>
                    {documentDetail.version?.structured_payload?.structuredClaims?.map((c: any, idx: number) => (
                      <div key={idx} className="p-2 rounded-lg border border-slate-100 bg-slate-50 font-mono text-[10px]">
                        <div className="text-slate-500 font-semibold">{c.claimKey}:</div>
                        <div className="text-slate-900 font-bold">{c.statedValue}</div>
                      </div>
                    ))}
                  </div>
                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-900 text-slate-300 shadow-xs space-y-2 font-mono text-[10px]">
                    <span className="text-slate-400 font-bold block uppercase text-[9px]">Cryptographic Provenance</span>
                    <div className="truncate"><span className="text-slate-500">Context Hash: </span><span className="text-blue-400">{documentDetail.version?.source_context_hash}</span></div>
                    <div className="truncate"><span className="text-slate-500">Payload Hash: </span><span className="text-emerald-400">{documentDetail.version?.source_spec_hash}</span></div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}