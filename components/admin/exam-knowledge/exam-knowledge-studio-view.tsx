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
  ArrowLeft,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ExternalLink,
  ChevronRight,
  ChevronDown,
  Eye,
  Check,
  Copy,
  PlusCircle,
  FileCode,
  Layers,
  History,
  Lock,
  Trash2,
  Edit3,
  Save,
  Plus,
  Trash,
  Clock,
  HelpCircle,
  ListPlus,
  Sliders,
  ArrowUp,
  ArrowDown,
  Info,
  BookOpen,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PromptViewerPanel } from "./prompt-viewer-panel";
import { FiveGatePreviewPanel } from "./five-gate-preview-panel";
import { AcademicReviewChecklist } from "./academic-review-checklist";
import { ExamModuleReaderView } from "@/components/exams/exam-module-reader-view";
import { ExamModuleRegistry } from "@/services/exam-knowledge/exam-module-registry";
import { ExamKnowledgeValidatorService } from "@/services/exam-knowledge/exam-knowledge-validator.service";
import type { AdminExamKnowledgeKPIs, ExamWorkspaceData } from "@/services/exam-knowledge/admin-exam-knowledge.service";
import {
  ExamModuleKey,
  ExamDocReviewStatus,
  ExamFiveGateValidationResult,
  CandidatePublishedModule,
  ExamSourceVerificationStatus,
  ExamKnowledgeDocumentSpec,
  ExamKnowledgeSectionType,
  EXAM_KNOWLEDGE_SECTION_TYPES,
  ExamSourceType,
} from "@/types/exam-knowledge";
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
  discardDraftVersionAction,
  updateDraftPayloadAction,
  submitDraftForReviewAction,
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
  initialSelectedExamId?: string;
  initialSelectedCycleId?: string;
  initialTab?: StudioTab;
  initialVersionId?: string;
  initialAuthoringMode?: "NEW" | "EDIT";
}

type StudioTab = "DASHBOARD" | "EXAMS" | "AUTHORING" | "DRAFTS" | "REVIEW" | "PROVENANCE";

export function ExamKnowledgeStudioView({
  initialKpis,
  initialExams,
  initialSelectedExamId,
  initialSelectedCycleId,
  initialTab,
  initialVersionId,
  initialAuthoringMode,
}: Props) {
  const initialExamMatch = initialSelectedExamId
    ? initialExams.find((e) => e.id === initialSelectedExamId)
    : null;

  const defaultExamId = initialExamMatch ? initialExamMatch.id : initialExams[0]?.id || "";
  const defaultCycleId = initialSelectedCycleId || (initialExamMatch?.cycles?.[0]?.id || "");

  const [activeTab, setActiveTab] = useState<StudioTab>(
    initialTab || (initialSelectedExamId ? "EXAMS" : "DASHBOARD")
  );
  const [kpis, setKpis] = useState<AdminExamKnowledgeKPIs>(initialKpis);
  const [exams, setExams] = useState(initialExams);

  // Selected Target for Workspace & Authoring
  const [selectedExamId, setSelectedExamId] = useState<string>(defaultExamId);
  const [selectedCycleId, setSelectedCycleId] = useState<string>(defaultCycleId);
  const [selectedModuleKey, setSelectedModuleKey] = useState<ExamModuleKey>("EXAM_OVERVIEW");

  // Workspace Data
  const [workspace, setWorkspace] = useState<ExamWorkspaceData | null>(null);
  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(false);

  // Authoring Workbench State (NEW vs EDIT mode)
  const [authoringMode, setAuthoringMode] = useState<"NEW" | "EDIT">(initialAuthoringMode || "NEW");
  const [editVersionId, setEditVersionId] = useState<string | null>(initialVersionId || null);
  const [editDraftPayload, setEditDraftPayload] = useState<ExamKnowledgeDocumentSpec | null>(null);
  const [editDraftMeta, setEditDraftMeta] = useState<any | null>(null);
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const [isSavingDraft, setIsSavingDraft] = useState<boolean>(false);
  const [isSubmittingReview, setIsSubmittingReview] = useState<boolean>(false);
  const [showAiAssistantInEdit, setShowAiAssistantInEdit] = useState<boolean>(false);

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
  const [reviewSubTab, setReviewSubTab] = useState<"ACADEMIC_REVIEW" | "CANDIDATE_PREVIEW" | "SOURCES">("ACADEMIC_REVIEW");
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isChecklistComplete, setIsChecklistComplete] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isCompiling, setIsCompiling] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isVerifyingSource, setIsVerifyingSource] = useState(false);
  const [reviewMessage, setReviewMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [discardModal, setDiscardModal] = useState<{ isOpen: boolean; versionId: string; title: string; versionNumber: number } | null>(null);
  const [isDiscarding, setIsDiscarding] = useState(false);


  // Initialize from deep link / props
  useEffect(() => {
    if (initialVersionId && initialAuthoringMode === "EDIT") {
      openEditDraft(initialVersionId);
    }
  }, [initialVersionId, initialAuthoringMode]);

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

  const openEditDraft = async (versionId: string, docMeta?: any) => {
    setIsLoadingDetail(true);
    setEditVersionId(versionId);
    setAuthoringMode("EDIT");
    setReviewMessage(null);
    setIsDirty(false);
    try {
      const res = await getDocumentDetailAction(versionId);
      if (res.success && res.detail) {
        setDocumentDetail(res.detail);
        const ver = res.detail.version;
        const doc = res.detail.document;
        setEditDraftMeta(doc);
        if (doc?.exam_id) setSelectedExamId(doc.exam_id);
        if (doc?.exam_cycle_id) setSelectedCycleId(doc.exam_cycle_id);
        if (doc?.module_key) setSelectedModuleKey(doc.module_key);
        if (ver?.structured_payload) {
          setEditDraftPayload(JSON.parse(JSON.stringify(ver.structured_payload)));
        }
        setActiveTab("AUTHORING");
      }
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const openNewAuthoring = (examId?: string, cycleId?: string, moduleKey?: ExamModuleKey) => {
    setAuthoringMode("NEW");
    setEditVersionId(null);
    setEditDraftPayload(null);
    setEditDraftMeta(null);
    setIsDirty(false);
    if (examId) setSelectedExamId(examId);
    if (cycleId !== undefined) setSelectedCycleId(cycleId || "");
    if (moduleKey) setSelectedModuleKey(moduleKey);
    setActiveTab("AUTHORING");
  };

  const handleSaveDraft = async () => {
    if (!editVersionId || !editDraftPayload) return;
    setIsSavingDraft(true);
    setReviewMessage(null);
    try {
      const res = await updateDraftPayloadAction({
        versionId: editVersionId,
        structuredPayload: editDraftPayload,
      });
      if (res.success) {
        setIsDirty(false);
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        setLastSavedTime(timeStr);
        setReviewMessage({ type: "success", text: `Draft saved successfully at ${timeStr}.` });
      } else {
        setReviewMessage({ type: "error", text: res.error || "Failed to save draft." });
      }
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handleSubmitDraftForReview = async () => {
    if (!editVersionId) return;
    setIsSubmittingReview(true);
    setReviewMessage(null);
    try {
      if (isDirty && editDraftPayload) {
        const saveRes = await updateDraftPayloadAction({
          versionId: editVersionId,
          structuredPayload: editDraftPayload,
        });
        if (!saveRes.success) {
          setReviewMessage({ type: "error", text: saveRes.error || "Failed to save changes before submitting." });
          setIsSubmittingReview(false);
          return;
        }
        setIsDirty(false);
      }

      const res = await submitDraftForReviewAction({
        versionId: editVersionId,
      });
      if (res.success) {
        setReviewMessage({ type: "success", text: "Draft submitted for academic review! Review status updated to IN_REVIEW." });
        await loadDocumentDetail(editVersionId);
        setActiveTab("REVIEW");
        const kRes = await getAdminExamKnowledgeDashboardAction();
        if (kRes.success && kRes.kpis) setKpis(kRes.kpis);
      } else {
        setReviewMessage({ type: "error", text: res.error || "Failed to submit draft for review." });
      }
      } finally {
        setIsSubmittingReview(false);
      }
    };

  const handleUpdateMetaField = (field: string, value: any) => {
    if (!editDraftPayload) return;
    setEditDraftPayload({
      ...editDraftPayload,
      metadata: {
        ...editDraftPayload.metadata,
        [field]: value,
      },
    });
    setIsDirty(true);
  };

  const handleUpdateSection = (index: number, field: string, value: any) => {
    if (!editDraftPayload?.contentSections) return;
    const updated = [...editDraftPayload.contentSections];
    updated[index] = { ...updated[index], [field]: value };
    setEditDraftPayload({ ...editDraftPayload, contentSections: updated });
    setIsDirty(true);
  };

  const handleAddSection = () => {
    if (!editDraftPayload) return;
    const newSec = {
      id: `sec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      heading: "New Section",
      sectionType: "SUMMARY" as ExamKnowledgeSectionType,
      bodyMarkdown: "",
      calloutNotes: [],
    };
    setEditDraftPayload({
      ...editDraftPayload,
      contentSections: [...(editDraftPayload.contentSections || []), newSec],
    });
    setIsDirty(true);
  };

  const handleRemoveSection = (index: number) => {
    if (!editDraftPayload?.contentSections) return;
    const updated = editDraftPayload.contentSections.filter((_, i) => i !== index);
    setEditDraftPayload({ ...editDraftPayload, contentSections: updated });
    setIsDirty(true);
  };

  const handleMoveSection = (index: number, direction: "up" | "down") => {
    if (!editDraftPayload?.contentSections) return;
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= editDraftPayload.contentSections.length) return;
    const updated = [...editDraftPayload.contentSections];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;
    setEditDraftPayload({ ...editDraftPayload, contentSections: updated });
    setIsDirty(true);
  };

  const handleAddCallout = (secIndex: number) => {
    if (!editDraftPayload?.contentSections) return;
    const updated = [...editDraftPayload.contentSections];
    const sec = updated[secIndex];
    const currentCallouts = sec.calloutNotes || [];
    const newCallout: { variant: 'INFO' | 'WARNING' | 'CRITICAL'; title: string; body: string } = {
      variant: 'INFO',
      title: 'Important Note',
      body: '',
    };
    updated[secIndex] = { ...sec, calloutNotes: [...currentCallouts, newCallout] };
    setEditDraftPayload({ ...editDraftPayload, contentSections: updated });
    setIsDirty(true);
  };

  const handleUpdateCallout = (
    secIndex: number,
    calloutIndex: number,
    field: 'title' | 'body' | 'variant',
    value: any
  ) => {
    if (!editDraftPayload?.contentSections) return;
    const updated = [...editDraftPayload.contentSections];
    const sec = updated[secIndex];
    const callouts = [...(sec.calloutNotes || [])];
    callouts[calloutIndex] = { ...callouts[calloutIndex], [field]: value };
    updated[secIndex] = { ...sec, calloutNotes: callouts };
    setEditDraftPayload({ ...editDraftPayload, contentSections: updated });
    setIsDirty(true);
  };

  const handleRemoveCallout = (secIndex: number, calloutIndex: number) => {
    if (!editDraftPayload?.contentSections) return;
    const updated = [...editDraftPayload.contentSections];
    const sec = updated[secIndex];
    const callouts = (sec.calloutNotes || []).filter((_, i) => i !== calloutIndex);
    updated[secIndex] = { ...sec, calloutNotes: callouts };
    setEditDraftPayload({ ...editDraftPayload, contentSections: updated });
    setIsDirty(true);
  };

  const handleUpdateFaq = (index: number, field: "question" | "answer", value: string) => {
    if (!editDraftPayload) return;
    const updated = [...(editDraftPayload.faqs || [])];
    updated[index] = { ...updated[index], [field]: value };
    setEditDraftPayload({ ...editDraftPayload, faqs: updated });
    setIsDirty(true);
  };

  const handleAddFaq = () => {
    if (!editDraftPayload) return;
    const newFaq = { question: "", answer: "" };
    setEditDraftPayload({ ...editDraftPayload, faqs: [...(editDraftPayload.faqs || []), newFaq] });
    setIsDirty(true);
  };

  const handleRemoveFaq = (index: number) => {
    if (!editDraftPayload?.faqs) return;
    const updated = editDraftPayload.faqs.filter((_, i) => i !== index);
    setEditDraftPayload({ ...editDraftPayload, faqs: updated });
    setIsDirty(true);
  };

  const handleUpdateSource = (index: number, field: string, value: string) => {
    if (!editDraftPayload) return;
    const updated = [...(editDraftPayload.officialSources || [])];
    updated[index] = { ...updated[index], [field]: value };
    setEditDraftPayload({ ...editDraftPayload, officialSources: updated });
    setIsDirty(true);
  };

  const handleAddSource = () => {
    if (!editDraftPayload) return;
    const newSrc = {
      title: "",
      url: "",
      issuingAuthority: selectedExamObj?.conducting_org?.name || "Official Authority",
      sourceType: "OFFICIAL_NOTIFICATION" as ExamSourceType,
    };
    setEditDraftPayload({
      ...editDraftPayload,
      officialSources: [...(editDraftPayload.officialSources || []), newSrc],
    });
    setIsDirty(true);
  };

  const handleRemoveSource = (index: number) => {
    if (!editDraftPayload?.officialSources) return;
    const updated = editDraftPayload.officialSources.filter((_, i) => i !== index);
    setEditDraftPayload({ ...editDraftPayload, officialSources: updated });
    setIsDirty(true);
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

    // If in EDIT mode, validate and update the current draft payload directly
    if (authoringMode === "EDIT" && editVersionId) {
      try {
        let cleaned = rawAiResponse.trim();
        if (cleaned.charCodeAt(0) === 0xfeff) cleaned = cleaned.slice(1).trim();
        const fenceRegex = /^```(?:json)?\s*\n([\s\S]*?)\n```$/i;
        const match = cleaned.match(fenceRegex);
        if (match && match[1]) cleaned = match[1].trim();

        const parsedSpec = JSON.parse(cleaned);
        const valRes = ExamKnowledgeValidatorService.validate(parsedSpec, {
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
        }, cleaned);

        setValidationResult(valRes);

        if (valRes.overallOutcome === "BLOCK") {
          setImportError(valRes.errors[0] || "5-Gate validation rejected the payload.");
        } else {
          setEditDraftPayload(parsedSpec);
          setIsDirty(true);
          setShowAiAssistantInEdit(false);
          setRawAiResponse("");
          setReviewMessage({
            type: "success",
            text: "External AI response validated and applied to draft editor. Review content and click Save Draft.",
          });
        }
      } catch (parseErr: any) {
        setImportError(`Invalid JSON: ${parseErr.message}`);
      } finally {
        setIsImporting(false);
      }
      return;
    }

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
        await openEditDraft(res.newVersionId, documentDetail.document);
      } else {
        setReviewMessage({ type: "error", text: res.error || "Failed to create revision draft." });
      }
    } catch (err: any) {
      setReviewMessage({ type: "error", text: err.message || "Failed to create revision." });
    }
  };

  const handleVerifySource = async (sourceId: string, status: ExamSourceVerificationStatus) => {
    setIsVerifyingSource(true);
    setReviewMessage(null);
    try {
      const res = await verifyExamSourceAction({
        sourceId,
        status,
      });
      if (res.success) {
        setReviewMessage({
          type: "success",
          text: `Source marked as ${status}.`,
        });
        if (selectedVersionId) {
          loadDocumentDetail(selectedVersionId);
        }
      } else {
        setReviewMessage({ type: "error", text: res.error || "Failed to update source verification." });
      }
    } finally {
      setIsVerifyingSource(false);
    }
  };

  const handleConfirmDiscard = async () => {
    if (!discardModal?.versionId) return;
    setIsDiscarding(true);
    try {
      const res = await discardDraftVersionAction(discardModal.versionId);
      if (res.success) {
        setDiscardModal(null);
        if (selectedVersionId === discardModal.versionId) {
          setSelectedVersionId(null);
          setDocumentDetail(null);
          setActiveTab("DRAFTS");
        }
        await loadDrafts();
        const kRes = await getAdminExamKnowledgeDashboardAction();
        if (kRes.success && kRes.kpis) setKpis(kRes.kpis);
      } else {
        alert(res.error || "Failed to discard draft.");
      }
    } finally {
      setIsDiscarding(false);
    }
  };

  const selectedExamObj = exams.find((e) => e.id === selectedExamId);
  const selectedCycleObj = selectedExamObj?.cycles?.find((c) => c.id === selectedCycleId);

  const candidateModuleData: CandidatePublishedModule | null = documentDetail?.version ? {
    documentId: documentDetail.document?.id || "",
    versionId: documentDetail.version.id,
    moduleKey: (documentDetail.document?.module_key || "EXAM_OVERVIEW") as ExamModuleKey,
    displayName: ExamModuleRegistry.getModuleDefinition((documentDetail.document?.module_key || "EXAM_OVERVIEW") as ExamModuleKey).displayName,
    title: documentDetail.version.structured_payload?.metadata?.title || documentDetail.document?.title || "Exam Knowledge Guide",
    description: documentDetail.version.structured_payload?.metadata?.description || "",
    compiledMdx: documentDetail.version.compiled_mdx || null,
    faqs: Array.isArray(documentDetail.version.structured_payload?.faqs) ? documentDetail.version.structured_payload.faqs : [],
    officialSources: Array.isArray(documentDetail.version.structured_payload?.officialSources)
      ? documentDetail.version.structured_payload.officialSources.map((src: any) => ({
          title: src.title,
          issuingAuthority: src.issuingAuthority || src.authorityName || 'Official Authority',
          sourceUrl: src.url,
          publishedDate: src.publishedDate || null,
          sourceType: src.sourceType || 'OFFICIAL_NOTIFICATION',
        }))
      : [],
    lastVerifiedDate: documentDetail.version.structured_payload?.metadata?.lastVerifiedDate || null,
    publishedAt: documentDetail.version.published_at || documentDetail.version.updated_at || new Date().toISOString(),
  } : null;

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
                  {exams.map((ex) => (
                    <option key={ex.id} value={ex.id}>
                      {ex.name} ({ex.conducting_org?.code || "GOV"}) — {ex.is_active ? "PUBLISHED" : "DRAFT"}
                    </option>
                  ))}
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
                          {mod.status === "PUBLISHED" ? (
                            <button onClick={() => { if (mod.versionId) loadDocumentDetail(mod.versionId); }} className="px-3 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-[11px] transition inline-flex items-center gap-1">
                              <Eye className="w-3 h-3" />
                              <span>Inspect (v{mod.versionNumber})</span>
                            </button>
                          ) : mod.status === "DRAFT" || mod.status === "AI_RESPONSE_PENDING" ? (
                            <button onClick={() => { if (mod.versionId) openEditDraft(mod.versionId); }} className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-[11px] transition inline-flex items-center gap-1 shadow-xs">
                              <Edit3 className="w-3 h-3" />
                              <span>Edit Draft (v{mod.versionNumber})</span>
                            </button>
                          ) : mod.status === "IN_REVIEW" ? (
                            <button onClick={() => { if (mod.versionId) loadDocumentDetail(mod.versionId); }} className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold text-[11px] transition inline-flex items-center gap-1 shadow-xs">
                              <ShieldCheck className="w-3 h-3" />
                              <span>Review (v{mod.versionNumber})</span>
                            </button>
                          ) : mod.status === "APPROVED" || mod.status === "COMPILED" ? (
                            <button onClick={() => { if (mod.versionId) loadDocumentDetail(mod.versionId); }} className="px-3 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-[11px] transition inline-flex items-center gap-1 shadow-xs">
                              <FileCode className="w-3 h-3" />
                              <span>Preview & Publish (v{mod.versionNumber})</span>
                            </button>
                          ) : (
                            <button disabled={mod.applicability !== "APPLICABLE"} onClick={() => openNewAuthoring(selectedExamId, selectedCycleId, mod.moduleKey)} className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-bold text-[11px] transition inline-flex items-center gap-1 shadow-xs">
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
          {authoringMode === "EDIT" ? (
            /* DRAFT / REVISION EDIT MODE */
            <div className="space-y-6">
              {/* Header Bar */}
              <div className="p-5 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono font-bold uppercase text-blue-600">
                        {selectedExamObj?.name} {selectedCycleObj?.year ? `(${selectedCycleObj.year})` : ""} &bull; {selectedModuleKey}
                      </span>
                      <Badge variant="indigo" className="font-mono text-[10px]">
                        DRAFT v{documentDetail?.version?.version_number || 2}
                      </Badge>
                      {documentDetail?.version?.version_number && documentDetail.version.version_number > 1 && (
                        <span className="text-[11px] font-mono text-slate-500">
                          (Based on Published v{documentDetail.version.version_number - 1})
                        </span>
                      )}
                    </div>
                    <h2 className="text-lg font-black text-slate-900">
                      Revision Authoring Workbench
                    </h2>
                  </div>

                  {/* Actions & Status Indicator */}
                  <div className="flex flex-wrap items-center gap-2.5">
                    <div className="mr-2">
                      {isDirty ? (
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-mono font-bold bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                          Unsaved changes
                        </span>
                      ) : lastSavedTime ? (
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          Saved at {lastSavedTime}
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-mono font-bold bg-slate-100 text-slate-600">
                          Ready to edit
                        </span>
                      )}
                    </div>

                    <button
                      onClick={() => setShowAiAssistantInEdit(!showAiAssistantInEdit)}
                      className={`px-3.5 py-2 rounded-xl border text-xs font-bold transition shadow-xs flex items-center gap-1.5 ${
                        showAiAssistantInEdit
                          ? "bg-purple-50 border-purple-300 text-purple-700"
                          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                      <span>{showAiAssistantInEdit ? "Hide AI Assistant" : "AI Prompt Assistant"}</span>
                    </button>

                    <button
                      disabled={isSavingDraft || !editDraftPayload}
                      onClick={handleSaveDraft}
                      className="px-4 py-2 rounded-xl border border-blue-600 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold shadow-xs transition flex items-center gap-1.5"
                    >
                      {isSavingDraft ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Saving...</span>
                        </>
                      ) : (
                        <>
                          <Save className="w-3.5 h-3.5" />
                          <span>Save Draft</span>
                        </>
                      )}
                    </button>

                    <button
                      disabled={isSubmittingReview || !editDraftPayload}
                      onClick={handleSubmitDraftForReview}
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold shadow-xs transition flex items-center gap-1.5"
                    >
                      {isSubmittingReview ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Submitting...</span>
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>Submit for Review</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => openNewAuthoring(selectedExamId, selectedCycleId, selectedModuleKey)}
                      className="px-3 py-2 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 text-xs font-medium transition"
                      title="Switch to New Authoring / Prompt Mode"
                    >
                      New Draft Mode
                    </button>
                  </div>
                </div>

                {/* Notice Banner */}
                <div className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/70 text-amber-900 text-xs flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="leading-relaxed">
                    <span className="font-bold">Revision Draft Isolation:</span> You are editing draft version {documentDetail?.version?.version_number || 2}. The currently published version remains live and completely untouched. Candidates will continue to see the published version until this revision passes Academic Review, Compilation, and Publication.
                  </div>
                </div>

                {reviewMessage && (
                  <div className={`p-3 rounded-xl border text-xs font-medium ${reviewMessage.type === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-950" : "bg-rose-50 border-rose-200 text-rose-950"}`}>
                    {reviewMessage.text}
                  </div>
                )}
              </div>

              {/* Collapsible AI Assistant in Edit Mode */}
              {showAiAssistantInEdit && (
                <div className="p-5 rounded-2xl border border-purple-200 bg-purple-50/40 space-y-4 shadow-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-purple-600" />
                      <h3 className="text-xs font-bold text-purple-950 uppercase font-mono tracking-wider">
                        AI Prompt & Import Assistant (Updates Draft in Place)
                      </h3>
                    </div>
                    <Badge variant="indigo" className="text-[10px] font-mono">CL-EXAM-AUTHOR-v1.0</Badge>
                  </div>

                  <p className="text-xs text-purple-900 leading-relaxed">
                    Generate an updated prompt with current context, send it to your preferred external AI (ChatGPT, Claude, Perplexity, etc.), and paste the structured JSON response below. 5-Gate validation will verify the payload and populate the editor fields without creating extra versions.
                  </p>

                  <div className="flex gap-2">
                    <button
                      disabled={isGeneratingPrompt}
                      onClick={handleGeneratePrompt}
                      className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-xs transition flex items-center gap-1.5"
                    >
                      {isGeneratingPrompt ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Generating Prompt...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Generate Authoritative Prompt</span>
                        </>
                      )}
                    </button>
                  </div>

                  {generatedPrompt && (
                    <div className="space-y-4 pt-2">
                      <PromptViewerPanel
                        promptText={generatedPrompt}
                        contractVersion={contractVersion}
                        contextHash={contextHash}
                        targetIdentity={{
                          examName: selectedExamObj?.name || "",
                          cycleYear: selectedCycleObj?.year,
                          moduleKey: selectedModuleKey,
                          language: "en",
                        }}
                      />

                      <div className="space-y-2">
                        <label className="block text-xs font-bold text-slate-900">
                          Paste External AI Structured JSON Response
                        </label>
                        <textarea
                          rows={6}
                          value={rawAiResponse}
                          onChange={(e) => setRawAiResponse(e.target.value)}
                          placeholder="Paste the ```json ... ``` response returned by external AI here..."
                          className="w-full p-3 rounded-xl border border-purple-200 font-mono text-xs text-slate-800 bg-white"
                        />
                        <div className="flex justify-end">
                          <button
                            disabled={isImporting || !rawAiResponse.trim()}
                            onClick={handleImportResponse}
                            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-bold shadow-xs transition flex items-center gap-1.5"
                          >
                            {isImporting ? (
                              <>
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                <span>Validating 5-Gates...</span>
                              </>
                            ) : (
                              <>
                                <ShieldCheck className="w-3.5 h-3.5" />
                                <span>Apply AI Response to Editor</span>
                              </>
                            )}
                          </button>
                        </div>
                        {importError && (
                          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs">
                            {importError}
                          </div>
                        )}
                        {validationResult && (
                          <div className="pt-2">
                            <FiveGatePreviewPanel validationResult={validationResult} />
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Structured Draft Editor Form */}
              {editDraftPayload ? (
                <div className="space-y-6">
                  {/* Card 1: Metadata */}
                  <div className="p-5 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-4">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-blue-600" />
                        <h3 className="text-xs font-bold text-slate-900 uppercase font-mono tracking-wider">
                          Document Metadata
                        </h3>
                      </div>
                      <span className="text-[11px] font-mono text-slate-400">Schema: CL-EXAM-AUTHOR-v1.0</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Document Title <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={editDraftPayload.metadata?.title || ""}
                          onChange={(e) => handleUpdateMetaField("title", e.target.value)}
                          placeholder="e.g. SSC CGL 2026 Overview & Exam Knowledge Guide"
                          className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-medium text-slate-900 focus:border-blue-500 focus:outline-hidden"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Target Exam Category
                        </label>
                        <input
                          type="text"
                          value={editDraftPayload.metadata?.targetExamCategory || ""}
                          onChange={(e) => handleUpdateMetaField("targetExamCategory", e.target.value)}
                          placeholder="e.g. Staff Selection Commission / Graduate Level"
                          className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-medium text-slate-900 focus:border-blue-500 focus:outline-hidden"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Description / Summary
                        </label>
                        <textarea
                          rows={2}
                          value={editDraftPayload.metadata?.description || ""}
                          onChange={(e) => handleUpdateMetaField("description", e.target.value)}
                          placeholder="Brief authoritative summary of this module..."
                          className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-medium text-slate-900 focus:border-blue-500 focus:outline-hidden"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Card 2: Content Sections */}
                  <div className="p-5 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-4">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <BookOpen className="w-4 h-4 text-blue-600" />
                        <h3 className="text-xs font-bold text-slate-900 uppercase font-mono tracking-wider">
                          Content Sections ({editDraftPayload.contentSections?.length || 0})
                        </h3>
                      </div>
                      <button
                        onClick={handleAddSection}
                        className="px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold transition flex items-center gap-1.5"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Section</span>
                      </button>
                    </div>

                    <div className="space-y-4">
                      {editDraftPayload.contentSections?.map((sec, sIdx) => (
                        <div key={sIdx} className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-3">
                          {/* Section Header Controls */}
                          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200/80">
                            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                              <span className="px-2 py-0.5 rounded-md bg-slate-200 text-slate-700 font-mono text-[10px] font-bold">
                                #{sIdx + 1}
                              </span>
                              <input
                                type="text"
                                value={sec.heading || ""}
                                onChange={(e) => handleUpdateSection(sIdx, "heading", e.target.value)}
                                placeholder="Section Heading (e.g. Overview & Scope)"
                                className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-bold text-slate-900 flex-1"
                              />
                            </div>

                            <div className="flex items-center gap-1.5">
                              <select
                                value={sec.sectionType || "SUMMARY"}
                                onChange={(e) => handleUpdateSection(sIdx, "sectionType", e.target.value)}
                                className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-[11px] font-mono font-bold text-slate-800"
                              >
                                {EXAM_KNOWLEDGE_SECTION_TYPES.map((st) => (
                                  <option key={st} value={st}>
                                    {st}
                                  </option>
                                ))}
                              </select>

                              <button
                                disabled={sIdx === 0}
                                onClick={() => handleMoveSection(sIdx, "up")}
                                className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                                title="Move Up"
                              >
                                <ArrowUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                disabled={sIdx === (editDraftPayload.contentSections?.length || 0) - 1}
                                onClick={() => handleMoveSection(sIdx, "down")}
                                className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                                title="Move Down"
                              >
                                <ArrowDown className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleRemoveSection(sIdx)}
                                className="p-1.5 rounded-lg border border-rose-200 bg-white text-rose-600 hover:bg-rose-50"
                                title="Delete Section"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Section Body */}
                          <div>
                            <label className="block text-[11px] font-bold text-slate-700 mb-1">
                              Section Body (Markdown / MDX Supported)
                            </label>
                            <textarea
                              rows={5}
                              value={sec.bodyMarkdown || ""}
                              onChange={(e) => handleUpdateSection(sIdx, "bodyMarkdown", e.target.value)}
                              placeholder="Write authoritative markdown content, bullet points, or markdown tables..."
                              className="w-full p-3 rounded-xl border border-slate-300 bg-white font-mono text-xs text-slate-800 leading-relaxed focus:border-blue-500 focus:outline-hidden"
                            />
                          </div>

                          {/* Callout Notes */}
                          <div className="space-y-2 pt-1">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-bold text-slate-600 font-mono">
                                Callout Notes ({sec.calloutNotes?.length || 0})
                              </span>
                              <button
                                onClick={() => handleAddCallout(sIdx)}
                                className="text-[11px] font-bold text-blue-600 hover:underline flex items-center gap-1"
                              >
                                <Plus className="w-3 h-3" />
                                <span>Add Callout Note</span>
                              </button>
                            </div>
                            {sec.calloutNotes?.map((callout, cIdx) => (
                              <div key={cIdx} className="p-2.5 rounded-lg border border-slate-200 bg-white space-y-2">
                                <div className="flex items-center gap-2">
                                  <select
                                    value={callout.variant || "INFO"}
                                    onChange={(e) => handleUpdateCallout(sIdx, cIdx, "variant", e.target.value)}
                                    className="px-2 py-1 rounded border border-slate-200 text-[10px] font-mono font-bold text-slate-700"
                                  >
                                    <option value="INFO">INFO</option>
                                    <option value="WARNING">WARNING</option>
                                    <option value="CRITICAL">CRITICAL</option>
                                  </select>
                                  <input
                                    type="text"
                                    value={callout.title || ""}
                                    onChange={(e) => handleUpdateCallout(sIdx, cIdx, "title", e.target.value)}
                                    placeholder="Callout Title"
                                    className="flex-1 px-2.5 py-1 rounded border border-slate-200 text-xs font-bold text-slate-800"
                                  />
                                  <button
                                    onClick={() => handleRemoveCallout(sIdx, cIdx)}
                                    className="p-1 rounded text-rose-600 hover:bg-rose-50"
                                    title="Remove Callout"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                                <textarea
                                  rows={2}
                                  value={callout.body || ""}
                                  onChange={(e) => handleUpdateCallout(sIdx, cIdx, "body", e.target.value)}
                                  placeholder="Callout note body..."
                                  className="w-full p-2 rounded border border-slate-200 text-xs text-slate-700"
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Card 3: FAQs */}
                  <div className="p-5 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-4">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <HelpCircle className="w-4 h-4 text-blue-600" />
                        <h3 className="text-xs font-bold text-slate-900 uppercase font-mono tracking-wider">
                          Frequently Asked Questions ({editDraftPayload.faqs?.length || 0})
                        </h3>
                      </div>
                      <button
                        onClick={handleAddFaq}
                        className="px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold transition flex items-center gap-1.5"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add FAQ</span>
                      </button>
                    </div>

                    <div className="space-y-3">
                      {editDraftPayload.faqs?.map((faq, fIdx) => (
                        <div key={fIdx} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <input
                              type="text"
                              value={faq.question || ""}
                              onChange={(e) => handleUpdateFaq(fIdx, "question", e.target.value)}
                              placeholder="FAQ Question (e.g. What is the educational qualification required?)"
                              className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-bold text-slate-900"
                            />
                            <button
                              onClick={() => handleRemoveFaq(fIdx)}
                              className="p-1.5 rounded-lg border border-rose-200 bg-white text-rose-600 hover:bg-rose-50 shrink-0"
                              title="Delete FAQ"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <textarea
                            rows={2}
                            value={faq.answer || ""}
                            onChange={(e) => handleUpdateFaq(fIdx, "answer", e.target.value)}
                            placeholder="Authoritative answer with official facts..."
                            className="w-full p-2.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-800"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Card 4: Official Sources */}
                  <div className="p-5 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-4">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <ExternalLink className="w-4 h-4 text-blue-600" />
                        <h3 className="text-xs font-bold text-slate-900 uppercase font-mono tracking-wider">
                          Official Sources & Evidence ({editDraftPayload.officialSources?.length || 0})
                        </h3>
                      </div>
                      <button
                        onClick={handleAddSource}
                        className="px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold transition flex items-center gap-1.5"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Source</span>
                      </button>
                    </div>

                    <div className="space-y-3">
                      {editDraftPayload.officialSources?.map((src, sIdx) => (
                        <div key={sIdx} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2">
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                            <div className="sm:col-span-2">
                              <label className="block text-[10px] font-mono font-bold uppercase text-slate-500 mb-0.5">
                                Source Title
                              </label>
                              <input
                                type="text"
                                value={src.title || ""}
                                onChange={(e) => handleUpdateSource(sIdx, "title", e.target.value)}
                                placeholder="e.g. Official SSC CGL Notice"
                                className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-bold text-slate-900"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-mono font-bold uppercase text-slate-500 mb-0.5">
                                Issuing Authority
                              </label>
                              <input
                                type="text"
                                value={src.issuingAuthority || ""}
                                onChange={(e) => handleUpdateSource(sIdx, "issuingAuthority", e.target.value)}
                                placeholder="e.g. Staff Selection Commission"
                                className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-900"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-mono font-bold uppercase text-slate-500 mb-0.5">
                                Source Type
                              </label>
                              <select
                                value={src.sourceType || "OFFICIAL_NOTIFICATION"}
                                onChange={(e) => handleUpdateSource(sIdx, "sourceType", e.target.value)}
                                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-mono text-slate-800"
                              >
                                <option value="OFFICIAL_NOTIFICATION">OFFICIAL_NOTIFICATION</option>
                                <option value="GAZETTE">GAZETTE</option>
                                <option value="COMMISSION_PORTAL">COMMISSION_PORTAL</option>
                                <option value="REVISED_SCHEDULE">REVISED_SCHEDULE</option>
                                <option value="COURT_ORDER">COURT_ORDER</option>
                              </select>
                            </div>
                            <div className="sm:col-span-3">
                              <label className="block text-[10px] font-mono font-bold uppercase text-slate-500 mb-0.5">
                                Official URL
                              </label>
                              <input
                                type="url"
                                value={src.url || ""}
                                onChange={(e) => handleUpdateSource(sIdx, "url", e.target.value)}
                                placeholder="https://ssc.gov.in/..."
                                className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-mono text-blue-600"
                              />
                            </div>
                            <div className="flex items-end justify-end">
                              <button
                                onClick={() => handleRemoveSource(sIdx)}
                                className="px-3 py-1.5 rounded-lg border border-rose-200 bg-white text-rose-600 hover:bg-rose-50 text-xs font-bold flex items-center gap-1 w-full justify-center"
                                title="Remove Source"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Remove</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Bottom Action Footer */}
                  <div className="p-4 rounded-2xl border border-slate-200 bg-white shadow-xs flex flex-wrap items-center justify-between gap-3">
                    <div className="text-xs text-slate-500">
                      {isDirty ? (
                        <span className="text-amber-600 font-bold">You have unsaved changes.</span>
                      ) : (
                        <span>All changes saved to draft v{documentDetail?.version?.version_number || 2}.</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2.5">
                      <button
                        disabled={isSavingDraft}
                        onClick={handleSaveDraft}
                        className="px-4 py-2 rounded-xl border border-blue-600 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold shadow-xs transition flex items-center gap-1.5"
                      >
                        {isSavingDraft ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Saving Draft...</span>
                          </>
                        ) : (
                          <>
                            <Save className="w-3.5 h-3.5" />
                            <span>Save Draft</span>
                          </>
                        )}
                      </button>
                      <button
                        disabled={isSubmittingReview}
                        onClick={handleSubmitDraftForReview}
                        className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold shadow-xs transition flex items-center gap-1.5"
                      >
                        {isSubmittingReview ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Submitting...</span>
                          </>
                        ) : (
                          <>
                            <ShieldCheck className="w-3.5 h-3.5" />
                            <span>Submit for Academic Review</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-12 rounded-2xl border border-dashed border-slate-200 bg-white text-center space-y-3">
                  <RefreshCw className="w-8 h-8 mx-auto text-slate-400 animate-spin" />
                  <div className="text-xs font-bold text-slate-700">Loading draft payload...</div>
                </div>
              )}
            </div>
          ) : (
            /* NEW AUTHORING / PROMPT GENERATION MODE */
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
                    <select value={selectedExamId} onChange={(e) => { setSelectedExamId(e.target.value); setSelectedCycleId(""); }} className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-bold text-slate-900">
                      {exams.map((ex) => (
                        <option key={ex.id} value={ex.id}>
                          {ex.name} ({ex.conducting_org?.code || "GOV"}) — {ex.is_active ? "PUBLISHED" : "DRAFT"}
                        </option>
                      ))}
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
                        <div className="flex items-center justify-end gap-1.5">
                          {d.reviewStatus === "DRAFT" || d.reviewStatus === "AI_GENERATED" ? (
                            <button
                              onClick={() => openEditDraft(d.id)}
                              className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-[11px] transition inline-flex items-center gap-1 shadow-xs"
                            >
                              <Edit3 className="w-3 h-3" />
                              <span>Edit Draft</span>
                            </button>
                          ) : d.reviewStatus === "IN_REVIEW" ? (
                            <button
                              onClick={() => loadDocumentDetail(d.id)}
                              className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold text-[11px] transition inline-flex items-center gap-1 shadow-xs"
                            >
                              <ShieldCheck className="w-3 h-3" />
                              <span>Review</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => loadDocumentDetail(d.id)}
                              className="px-3 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-[11px] transition inline-flex items-center gap-1 shadow-xs"
                            >
                              <FileCode className="w-3 h-3" />
                              <span>Preview & Publish</span>
                            </button>
                          )}
                          {!d.isPublished && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDiscardModal({
                                  isOpen: true,
                                  versionId: d.id,
                                  title: d.document?.title || d.document?.moduleKey,
                                  versionNumber: d.versionNumber,
                                });
                              }}
                              className="p-1 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 transition"
                              title="Discard Draft"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
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
                      <span className={`px-2 py-0.5 rounded-full font-mono text-[10px] font-bold ${documentDetail.version?.is_published ? "bg-emerald-100 text-emerald-800" : documentDetail.version?.review_status === "APPROVED" ? "bg-blue-100 text-blue-800" : "bg-amber-100 text-amber-800"}`}>{documentDetail.version?.review_status} {documentDetail.version?.compiled_mdx && !documentDetail.version?.is_published ? "(COMPILED)" : documentDetail.version?.is_published ? "(PUBLISHED)" : "(DRAFT)"}</span>
                    </div>
                    <h2 className="text-lg font-black text-slate-900">{documentDetail.document?.title || documentDetail.document?.module_key}</h2>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">Canonical Slug: {documentDetail.document?.slug}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {!documentDetail.version?.is_published && (
                      <button
                        onClick={() => openEditDraft(documentDetail.version.id, documentDetail.document)}
                        className="px-3.5 py-1.5 rounded-xl border border-blue-300 text-blue-700 hover:bg-blue-50 text-xs font-bold transition shadow-xs flex items-center gap-1.5"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Edit Draft</span>
                      </button>
                    )}
                    {documentDetail.version?.review_status === "AI_GENERATED" && (
                      <button disabled={isUpdatingStatus} onClick={() => handleUpdateReviewStatus("IN_REVIEW")} className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition shadow-xs">Start Academic Review</button>
                    )}
                    {documentDetail.version?.review_status === "IN_REVIEW" && (
                      <>
                        <button disabled={isUpdatingStatus || !isChecklistComplete} onClick={() => handleUpdateReviewStatus("APPROVED")} className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-bold transition shadow-xs">Approve Academic Truth</button>
                        <button disabled={isUpdatingStatus} onClick={() => handleUpdateReviewStatus("REJECTED", "Factual claims inconsistent with official notification.")} className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition shadow-xs">Reject</button>
                      </>
                    )}
                    {documentDetail.version?.review_status === "APPROVED" && !documentDetail.version?.compiled_mdx && (
                      <button disabled={isCompiling} onClick={handleCompileVersion} className="px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition shadow-xs flex items-center gap-1.5"><FileCode className="w-3.5 h-3.5" /><span>Compile MDX Artifact</span></button>
                    )}
                    {documentDetail.version?.review_status === "APPROVED" && documentDetail.version?.compiled_mdx && !documentDetail.version?.is_published && (
                      <>
                        <button disabled={isCompiling} onClick={handleCompileVersion} className="px-3 py-1.5 rounded-xl border border-purple-300 text-purple-700 hover:bg-purple-50 text-xs font-bold transition shadow-xs flex items-center gap-1.5"><FileCode className="w-3.5 h-3.5" /><span>Re-compile MDX</span></button>
                        <button disabled={isPublishing} onClick={handlePublishVersion} className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow-xs flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" /><span>Publish Version (Immutable Lock)</span></button>
                      </>
                    )}
                    {documentDetail.version?.is_published && (
                      <button onClick={handleCreateRevision} className="px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition shadow-xs flex items-center gap-1.5"><PlusCircle className="w-3.5 h-3.5 text-blue-400" /><span>Create Revision Draft (v{documentDetail.version?.version_number + 1})</span></button>
                    )}
                    {!documentDetail.version?.is_published && (
                      <button
                        disabled={isDiscarding}
                        onClick={() => {
                          setDiscardModal({
                            isOpen: true,
                            versionId: documentDetail.version.id,
                            title: documentDetail.document?.title || documentDetail.document?.module_key,
                            versionNumber: documentDetail.version.version_number,
                          });
                        }}
                        className="px-3.5 py-1.5 rounded-xl border border-rose-300 text-rose-700 hover:bg-rose-50 text-xs font-bold transition shadow-xs flex items-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Discard Draft</span>
                      </button>
                    )}
                  </div>
                </div>
                {reviewMessage && (<div className={`p-3 rounded-xl border text-xs font-medium ${reviewMessage.type === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-950" : "bg-rose-50 border-rose-200 text-rose-950"}`}>{reviewMessage.text}</div>)}
              </div>

              {/* Review Workbench Sub-Tabs */}
              <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs font-semibold w-fit">
                <button
                  onClick={() => setReviewSubTab("ACADEMIC_REVIEW")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${
                    reviewSubTab === "ACADEMIC_REVIEW"
                      ? "bg-white text-blue-700 shadow-xs font-bold"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Academic Review</span>
                </button>
                <button
                  onClick={() => setReviewSubTab("CANDIDATE_PREVIEW")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${
                    reviewSubTab === "CANDIDATE_PREVIEW"
                      ? "bg-white text-blue-700 shadow-xs font-bold"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Candidate Preview</span>
                  {documentDetail.version?.compiled_mdx ? (
                    <span className="px-1.5 py-0.2 rounded-md bg-emerald-100 text-emerald-800 text-[9px] font-mono">MDX Ready</span>
                  ) : (
                    <span className="px-1.5 py-0.2 rounded-md bg-slate-200 text-slate-600 text-[9px] font-mono">Uncompiled</span>
                  )}
                </button>
                <button
                  onClick={() => setReviewSubTab("SOURCES")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${
                    reviewSubTab === "SOURCES"
                      ? "bg-white text-blue-700 shadow-xs font-bold"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Official Sources ({documentDetail.sources?.length || 0})</span>
                </button>
              </div>

              {/* SUB-TAB 1: ACADEMIC REVIEW */}
              {reviewSubTab === "ACADEMIC_REVIEW" && (
                <div className="space-y-5">
                  <AcademicReviewChecklist onChecklistComplete={setIsChecklistComplete} />
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                    <div className="lg:col-span-2 space-y-4">
                      <div className="p-5 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-3">
                        <h3 className="text-xs font-bold text-slate-900 uppercase font-mono tracking-wider pb-2 border-b border-slate-100">Document Content Sections ({documentDetail.version?.structured_payload?.contentSections?.length || 0})</h3>
                        {documentDetail.version?.structured_payload?.contentSections?.map((sec: any, idx: number) => (
                          <div key={idx} className="p-4 rounded-xl border border-slate-100 bg-slate-50 space-y-2">
                            <div className="flex items-center justify-between"><span className="text-xs font-bold text-slate-900">{sec.heading || sec.title}</span><span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-600">{sec.sectionType}</span></div>
                            <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">{sec.bodyMarkdown}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs space-y-2.5 text-xs">
                        <span className="font-bold text-slate-900 block font-mono text-[11px] uppercase tracking-wide">Referenced Sources in Payload</span>
                        {documentDetail.version?.structured_payload?.officialSources?.map((s: any, idx: number) => (
                          <div key={idx} className="p-2.5 rounded-lg border border-slate-100 bg-slate-50">
                            <div className="font-bold text-slate-800 text-[11px]">{s.title}</div>
                            <div className="text-[10px] text-slate-500 font-mono">Authority: {s.issuingAuthority || s.authorityName}</div>
                            <a href={s.url} target="_blank" rel="noreferrer" className="text-[10px] text-blue-600 hover:underline truncate block mt-0.5">{s.url}</a>
                          </div>
                        ))}
                      </div>
                      <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs space-y-2.5 text-xs">
                        <span className="font-bold text-slate-900 block font-mono text-[11px] uppercase tracking-wide">Structured Claims</span>
                        {documentDetail.claims?.length > 0 ? (
                          documentDetail.claims.map((c: any, idx: number) => (
                            <div key={idx} className="p-2 rounded-lg border border-slate-100 bg-slate-50 font-mono text-[10px]">
                              <div className="text-slate-500 font-semibold">{c.claim_key}:</div>
                              <div className="text-slate-900 font-bold">{c.stated_value}</div>
                            </div>
                          ))
                        ) : (
                          <p className="text-slate-400 text-[11px]">No pre-registered claims for this module.</p>
                        )}
                      </div>
                      <div className="p-4 rounded-xl border border-slate-200 bg-slate-900 text-slate-300 shadow-xs space-y-2 font-mono text-[10px]">
                        <span className="text-slate-400 font-bold block uppercase text-[9px]">Cryptographic Provenance</span>
                        <div className="truncate"><span className="text-slate-500">Payload Hash: </span><span className="text-emerald-400">{documentDetail.version?.source_spec_hash}</span></div>
                        {documentDetail.version?.compiled_artifact_hash && (
                          <div className="truncate"><span className="text-slate-500">Artifact Hash: </span><span className="text-purple-400">{documentDetail.version?.compiled_artifact_hash}</span></div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* SUB-TAB 2: CANDIDATE PREVIEW */}
              {reviewSubTab === "CANDIDATE_PREVIEW" && (
                <div className="space-y-4">
                  <div className="p-3.5 rounded-xl border border-blue-200 bg-blue-50/60 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 font-bold text-blue-950">
                      <Eye className="w-4 h-4 text-blue-600 shrink-0" />
                      <span>Candidate-Parity Reader Preview</span>
                      <Badge variant="outline" className="text-[10px] bg-white text-blue-700 font-mono">
                        v{documentDetail.version?.version_number} &bull; {documentDetail.version?.review_status}
                      </Badge>
                    </div>
                    <span className="text-[11px] text-blue-700 font-medium">
                      Single source of truth — reuses authoritative candidate rendering component
                    </span>
                  </div>

                  {documentDetail.version?.compiled_mdx && candidateModuleData ? (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-2 sm:p-4">
                      <ExamModuleReaderView
                        examSlug={documentDetail.document?.exams?.slug || "exam"}
                        examTitle={documentDetail.document?.exams?.title || documentDetail.document?.exams?.name || "Exam"}
                        moduleData={candidateModuleData}
                        cycleYear={documentDetail.document?.exam_cycles?.cycle_year}
                        isPreview={true}
                      />
                    </div>
                  ) : (
                    <div className="p-12 rounded-2xl border border-dashed border-slate-200 bg-white text-center space-y-4">
                      <FileCode className="w-10 h-10 mx-auto text-slate-300" />
                      <div className="space-y-1">
                        <h3 className="text-sm font-bold text-slate-900">Candidate Preview Unavailable</h3>
                        <p className="text-xs text-slate-500 max-w-md mx-auto">
                          This version has not been compiled into MDX yet. Run compilation to generate the verified MDX artifact and preview candidate rendering.
                        </p>
                      </div>
                      {documentDetail.version?.review_status === "APPROVED" && (
                        <button
                          disabled={isCompiling}
                          onClick={handleCompileVersion}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-bold shadow-xs transition"
                        >
                          <FileCode className="w-3.5 h-3.5" />
                          <span>{isCompiling ? "Compiling MDX..." : "Compile MDX Artifact"}</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* SUB-TAB 3: SOURCES */}
              {reviewSubTab === "SOURCES" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-slate-900 uppercase font-mono tracking-wider">
                      Authoritative Sources ({documentDetail.sources?.length || 0})
                    </h3>
                  </div>

                  {(!documentDetail.sources || documentDetail.sources.length === 0) ? (
                    <div className="p-8 rounded-2xl border border-dashed border-slate-200 bg-white text-center space-y-2">
                      <ExternalLink className="w-6 h-6 mx-auto text-slate-400" />
                      <p className="text-xs text-slate-500">No official sources registered for this exam yet.</p>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-mono text-[10px] uppercase font-bold">
                            <th className="py-3 px-4">Source Title & URL</th>
                            <th className="py-3 px-3">Authority</th>
                            <th className="py-3 px-3">Type</th>
                            <th className="py-3 px-3">Status</th>
                            <th className="py-3 px-4 text-right">Verification Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-700">
                          {documentDetail.sources.map((src: any) => (
                            <tr key={src.id} className="hover:bg-slate-50 transition">
                              <td className="py-3 px-4">
                                <div className="font-bold text-slate-900">{src.title}</div>
                                {src.source_url && (
                                  <a href={src.source_url} target="_blank" rel="noreferrer" className="text-[10px] text-blue-600 hover:underline flex items-center gap-1 mt-0.5">
                                    <span className="truncate max-w-xs">{src.source_url}</span>
                                    <ExternalLink className="w-3 h-3 shrink-0" />
                                  </a>
                                )}
                              </td>
                              <td className="py-3 px-3 font-medium">{src.issuing_authority || "Commission"}</td>
                              <td className="py-3 px-3"><span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-mono text-[10px]">{src.source_type}</span></td>
                              <td className="py-3 px-3">
                                <span className={`px-2 py-0.5 rounded-full font-mono text-[10px] font-bold ${
                                  src.verification_status === "SOURCE_VERIFIED"
                                    ? "bg-emerald-100 text-emerald-800"
                                    : src.verification_status === "REJECTED"
                                    ? "bg-rose-100 text-rose-800"
                                    : "bg-amber-100 text-amber-800"
                                }`}>
                                  {src.verification_status}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  {src.verification_status !== "SOURCE_VERIFIED" && (
                                    <button
                                      disabled={isVerifyingSource}
                                      onClick={() => handleVerifySource(src.id, "SOURCE_VERIFIED")}
                                      className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] transition flex items-center gap-1"
                                    >
                                      <Check className="w-3 h-3" />
                                      <span>Verify</span>
                                    </button>
                                  )}
                                  {src.verification_status !== "REJECTED" && (
                                    <button
                                      disabled={isVerifyingSource}
                                      onClick={() => handleVerifySource(src.id, "REJECTED")}
                                      className="px-2.5 py-1 rounded-lg border border-rose-300 text-rose-700 hover:bg-rose-50 font-bold text-[10px] transition flex items-center gap-1"
                                    >
                                      <XCircle className="w-3 h-3" />
                                      <span>Reject</span>
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* DISCARD DRAFT CONFIRMATION MODAL */}
      {discardModal?.isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 max-w-md w-full shadow-xl space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-100">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Discard this draft?</h3>
                <p className="text-xs text-slate-500 font-mono">
                  {discardModal.title} (v{discardModal.versionNumber})
                </p>
              </div>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              This will permanently remove this unpublished draft and its associated draft data. Published content will not be affected.
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                disabled={isDiscarding}
                onClick={() => setDiscardModal(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-bold transition"
              >
                Cancel
              </button>
              <button
                disabled={isDiscarding}
                onClick={handleConfirmDiscard}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-bold shadow-xs transition flex items-center gap-1.5"
              >
                {isDiscarding ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Discarding...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Discard Draft</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}