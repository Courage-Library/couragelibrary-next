"use client";

import React, { useState, useEffect } from "react";
import { AcademicTaxonomyExplorer } from "./academic-taxonomy-explorer";
import { StructuredLessonEditor } from "./structured-lesson-editor";
import { LiveContentPreview } from "./live-content-preview";
import { ValidationPanel } from "./validation-panel";
import { VersionHistoryPanel } from "./version-history-panel";
import { QuestionBankSelectorModal } from "./question-bank-selector-modal";
import { AssetCatalogModal } from "./asset-catalog-modal";
import { AIGenerationModal } from "./ai-generation-modal";
import { CurriculumCoverageView } from "./curriculum-coverage-view";
import { AuthoringQueueView } from "./authoring-queue-view";
import type { AuthoringQueueTask } from "@/types/authoring-queue";
import type { StudioDashboardStats, AcademicExplorerNode, CurriculumCoverageReport } from "@/services/admin-content-studio.service";
import type { CurriculumCoverageMatrix } from "@/types/curriculum-coverage";
import type { DocumentType, LessonDocumentSpec, DocumentVersion } from "@/types/learning-compiler";
import {
  saveDraftSpecAction,
  submitForReviewAction,
  reviewVersionAction,
  compileVersionAction,
  publishVersionAction,
  searchQuestionBankAction,
  searchAssetsAction,
  getLearningUnitDetailAction,
  createLearningDocumentAction,
  createDraftVersionAction,
  getVersionSpecAction,
  createRevisionAction,
} from "@/app/admin/content/actions";
import {
  BookOpen,
  Layers,
  Award,
  Plus,
  Save,
  Sparkles,
  ListTodo,
  Columns,
  Eye,
  Edit3,
  FileCode,
  Lock,
  RotateCcw,
  CheckCircle2,
} from "lucide-react";

interface Props {
  initialStats: StudioDashboardStats;
  initialTree: AcademicExplorerNode[];
  initialCoverage: CurriculumCoverageReport;
  initialMatrix?: CurriculumCoverageMatrix;
  initialQueue?: AuthoringQueueTask[];
}

export function ContentStudioView({
  initialStats,
  initialTree,
  initialCoverage,
  initialMatrix,
  initialQueue,
}: Props) {
  const [activeTab, setActiveTab] = useState<"DASHBOARD" | "EXPLORER" | "COVERAGE" | "QUEUE">("EXPLORER");
  const [viewMode, setViewMode] = useState<"EDITOR" | "SPLIT" | "PREVIEW">("EDITOR");
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [unitDetail, setUnitDetail] = useState<any | null>(null);
  const [currentSpec, setCurrentSpec] = useState<LessonDocumentSpec | null>(null);
  const [currentVersion, setCurrentVersion] = useState<DocumentVersion | null>(null);
  const [compiledMdx, setCompiledMdx] = useState<string>("# Select a Learning Unit to begin authoring.");
  const [validationResult, setValidationResult] = useState<any>({ isValid: true, errors: [], warnings: [] });
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [newDocType, setNewDocType] = useState<DocumentType>("CONCEPT_LESSON");

  // Modals
  const [showQModal, setShowQModal] = useState(false);
  const [targetQFieldPath, setTargetQFieldPath] = useState<string>("authenticPyqReferences");
  const [showAssetModal, setShowAssetModal] = useState(false);
  const [targetAssetFieldPath, setTargetAssetFieldPath] = useState<string>("");
  const [showAIModal, setShowAIModal] = useState(false);

  const handleSelectUnit = async (unitId: string) => {
    setSelectedUnitId(unitId);
    setHasUnsavedChanges(false);
    const res = await getLearningUnitDetailAction(unitId);
    if (res.success && res.detail) {
      setUnitDetail(res.detail);
      const docs = res.detail.documents || [];
      if (docs.length > 0 && docs[0].document_versions?.length > 0) {
        // Sort by version_number desc and pick latest or published
        const versions: DocumentVersion[] = [...docs[0].document_versions].sort(
          (a, b) => b.version_number - a.version_number
        );
        const targetVer = versions.find((v) => v.is_published) || versions[0];
        await handleSelectVersion(targetVer.id);
      } else {
        setCurrentVersion(null);
        setCurrentSpec(null);
        setCompiledMdx("# No documents created for this unit yet.");
      }
    }
  };

  const handleSelectVersion = async (versionId: string) => {
    setActionLoading(true);
    try {
      const res = await getVersionSpecAction(versionId);
      if (res.success && res.version) {
        setCurrentVersion(res.version);
        if (res.spec) {
          setCurrentSpec(res.spec);
        }
        if (res.compiledMdx) {
          setCompiledMdx(res.compiledMdx);
        }
      }
    } finally {
      setActionLoading(false);
      setHasUnsavedChanges(false);
    }
  };

  const handleSpecChange = (updatedSpec: LessonDocumentSpec) => {
    setCurrentSpec(updatedSpec);
    setHasUnsavedChanges(true);
  };

  const handleSaveDraft = async () => {
    if (!currentVersion || !currentSpec) return;
    setIsSaving(true);
    try {
      const res = await saveDraftSpecAction({
        versionId: currentVersion.id,
        spec: currentSpec,
      });
      if (res.success) {
        setValidationResult(res.validation);
        setHasUnsavedChanges(false);
        // Refresh version detail
        if (selectedUnitId) {
          const detailRes = await getLearningUnitDetailAction(selectedUnitId);
          if (detailRes.success && detailRes.detail) {
            setUnitDetail(detailRes.detail);
          }
        }
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateDocument = async () => {
    if (!selectedUnitId || !unitDetail?.unit) return;
    setActionLoading(true);
    try {
      const unit = unitDetail.unit;
      const slug = `${unit.slug}-${newDocType.toLowerCase().replace(/_/g, "-")}`;

      const docRes = await createLearningDocumentAction({
        learningUnitId: selectedUnitId,
        canonicalSlug: slug,
        documentType: newDocType,
      });

      if (!docRes.success || !docRes.doc) {
        alert(docRes.error || "Failed to create document.");
        return;
      }

      const initialSpec: LessonDocumentSpec = {
        schemaVersion: "1.0.0",
        documentId: docRes.doc.id,
        unitSlug: unit.slug,
        language: "en",
        metadata: {
          title: unit.title,
          topicId: unit.topic_id,
          subjectId: unit.topics?.subjects?.id || "sub-1",
          targetExamCategories: ["SSC_CGL", "SSC_CHSL", "RAILWAYS_NTPC"],
          estimatedReadingMinutes: 8,
          difficultyTier: "BEGINNER",
          authoritativeKeywords: [unit.title.toLowerCase(), "concept", "exam prep"],
        },
        learningObjectives: [
          `Master fundamental core concepts of ${unit.title}`,
          `Solve standard and advanced exam-level problems`,
          `Identify distractor traps and apply speed shortcuts`,
        ],
        prerequisites: [],
        sections: [
          {
            id: `sec-${Date.now()}`,
            title: "Core Theoretical Foundation",
            sectionType: "THEORY",
            contentMarkdown: `### Introduction to ${unit.title}\n\nProvide authoritative, step-by-step conceptual definitions, mathematical theorems, and analytical models.`,
            calloutNotes: [
              {
                variant: "TIP",
                title: "Exam Scoring Tip",
                body: "Remember the core boundary conditions before attempting calculation steps.",
              },
            ],
          },
        ],
        formulaBlocks: [
          {
            id: `form-${Date.now()}`,
            name: "Fundamental Formula",
            latexFormula: "A = B \\times C",
            variableDefinitions: [
              { symbol: "A", meaning: "Primary Result" },
              { symbol: "B", meaning: "Factor One" },
              { symbol: "C", meaning: "Factor Two" },
            ],
            applicableConditions: ["Values must be positive integers"],
            speedShortcutTrick: "Double Factor One and halve Factor Two for rapid mental multiplication.",
          },
        ],
        workedExamples: [
          {
            id: `ex-${Date.now()}`,
            difficulty: "MEDIUM",
            problemText: "Sample illustrative problem demonstrating practical application in competitive exams.",
            stepByStepSolution: [
              {
                stepNumber: 1,
                explanation: "Identify the known values from the problem statement.",
                mathSnippet: "B = 10, C = 20",
              },
              {
                stepNumber: 2,
                explanation: "Substitute values into the primary formula.",
                mathSnippet: "A = 10 \\times 20 = 200",
              },
            ],
            shortcutMethod: "Direct mental calculation using standard proportions.",
            commonMistakeToAvoid: "Ensure all units are converted to the standard metric before calculation.",
          },
        ],
        cognitiveTraps: [
          {
            trapType: "CALCULATION_SLIP",
            misconception: "Overlooking zero values or denominator constraints.",
            correctApproach: "Always verify non-zero denominators before division.",
          },
        ],
        authenticPyqReferences: [],
        quickChecks: [
          {
            id: `qc-${Date.now()}`,
            prompt: "What is the primary condition required for this theorem to hold?",
            options: [
              { id: "opt-1", text: "Positive non-zero inputs", isCorrect: true, feedbackExplanation: "Correct! The formula requires positive non-zero terms." },
              { id: "opt-2", text: "Negative real numbers only", isCorrect: false, feedbackExplanation: "Incorrect. Negative values violate the domain constraint." },
            ],
          },
        ],
        revisionSummary: {
          keyTakeaways: [`Understand primary relations of ${unit.title}`, "Verify conditions before applying shortcut formulas"],
          coreFormulas: ["A = B \\times C"],
          speedRules: ["Direct proportional scaling cuts computation time by 50%"],
        },
        seo: {
          metaTitle: `${unit.title} - Complete Notes & Formulas | Courage Library`,
          metaDescription: `Master ${unit.title} for SSC, Railways, and Banking exams with conceptual notes, worked examples, and authentic PYQs.`,
          focusKeywords: [unit.title.toLowerCase(), "ssc cgl", "notes", "shortcuts"],
        },
      };

      const verRes = await createDraftVersionAction({
        documentId: docRes.doc.id,
        spec: initialSpec,
        authorType: "HUMAN",
      });

      if (verRes.success && verRes.version) {
        await handleSelectUnit(selectedUnitId);
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateRevision = async () => {
    if (!currentVersion || !unitDetail?.documents?.[0]) return;
    setActionLoading(true);
    try {
      const docId = unitDetail.documents[0].id;
      const res = await createRevisionAction({
        documentId: docId,
        baseVersionId: currentVersion.id,
        authorType: "HUMAN",
      });
      if (res.success && res.version) {
        await handleSelectUnit(selectedUnitId!);
        await handleSelectVersion(res.version.id);
      } else {
        alert(res.error || "Failed to create revision.");
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleSubmitForReview = async (versionId: string) => {
    setActionLoading(true);
    try {
      const res = await submitForReviewAction(versionId);
      if (res.success) {
        await handleSelectUnit(selectedUnitId!);
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleApprove = async (versionId: string) => {
    setActionLoading(true);
    try {
      const res = await reviewVersionAction({ versionId, decision: "APPROVED" });
      if (res.success) {
        await handleSelectUnit(selectedUnitId!);
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleCompile = async (versionId: string) => {
    setActionLoading(true);
    try {
      const res = await compileVersionAction(versionId);
      if (res.success && res.result?.artifact?.compiledMdx) {
        setCompiledMdx(res.result.artifact.compiledMdx);
        await handleSelectUnit(selectedUnitId!);
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handlePublish = async (versionId: string) => {
    setActionLoading(true);
    try {
      const res = await publishVersionAction(versionId);
      if (res.success) {
        await handleSelectUnit(selectedUnitId!);
      }
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-80px)] flex-col overflow-hidden bg-slate-50/50">
      {/* Top Navigation Bar */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-700 text-white shadow-xs">
            <BookOpen className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-black text-slate-900 text-base">Admin Content Studio</h1>
            <p className="text-[11px] text-slate-500">Structured Authoring, AST Compilation & Publishing Engine</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Main Tab Switcher */}
          <div className="flex rounded-xl border border-slate-200 bg-slate-100/80 p-1">
            <button
              type="button"
              onClick={() => setActiveTab("EXPLORER")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-bold text-xs transition ${
                activeTab === "EXPLORER"
                  ? "bg-white text-blue-700 shadow-xs border border-slate-200/80"
                  : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
              }`}
            >
              <Layers className="h-4 w-4" /> Academic Studio
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("COVERAGE")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-bold text-xs transition ${
                activeTab === "COVERAGE"
                  ? "bg-white text-blue-700 shadow-xs border border-slate-200/80"
                  : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
              }`}
            >
              <Award className="h-4 w-4" /> Coverage Matrix
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("QUEUE")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-bold text-xs transition ${
                activeTab === "QUEUE"
                  ? "bg-white text-blue-700 shadow-xs border border-slate-200/80"
                  : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
              }`}
            >
              <ListTodo className="h-4 w-4" /> Authoring Queue
            </button>
          </div>
        </div>
      </div>

      {/* Main Workspace Layout */}
      {activeTab === "QUEUE" ? (
        <div className="flex-1 overflow-y-auto">
          <AuthoringQueueView
            initialQueue={initialQueue}
            onSelectUnitDocType={(unitId, docType) => {
              handleSelectUnit(unitId);
              setActiveTab("EXPLORER");
            }}
          />
        </div>
      ) : activeTab === "EXPLORER" ? (
        <div className="grid flex-1 grid-cols-12 overflow-hidden">
          {/* Left Column: Academic Explorer Tree (Col 3) */}
          <div className="col-span-3 h-full overflow-hidden">
            <AcademicTaxonomyExplorer
              tree={initialTree}
              selectedUnitId={selectedUnitId}
              onSelectUnit={handleSelectUnit}
            />
          </div>

          {/* Center Column: Structured Editor / Live Preview Tabs (Col 6) */}
          <div className="col-span-6 flex h-full flex-col border-r border-slate-200 bg-white overflow-hidden">
            {selectedUnitId ? (
              <div className="flex flex-1 flex-col overflow-hidden">
                {/* Unit Header Bar */}
                <div className="border-b border-slate-200 bg-slate-50/70 p-3.5">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[10px] text-blue-700 uppercase tracking-wider">Learning Unit</span>
                        {currentVersion && (
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold border ${
                              currentVersion.is_published
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : "bg-blue-50 text-blue-700 border-blue-200"
                            }`}
                          >
                            v{currentVersion.version_number} &bull; {currentVersion.review_status}
                          </span>
                        )}
                        {hasUnsavedChanges && (
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 border border-amber-200">
                            Unsaved Changes
                          </span>
                        )}
                      </div>
                      <h2 className="font-bold text-slate-900 text-base">{unitDetail?.unit?.title || "Unit Workspace"}</h2>
                    </div>

                    {/* View Controls & Action Buttons */}
                    <div className="flex items-center gap-2">
                      {/* View Mode Toggle */}
                      <div className="flex items-center rounded-lg border border-slate-200 bg-slate-100 p-0.5">
                        <button
                          type="button"
                          onClick={() => setViewMode("EDITOR")}
                          className={`rounded px-2 py-1 text-xs font-bold transition ${
                            viewMode === "EDITOR"
                              ? "bg-white text-blue-700 shadow-2xs"
                              : "text-slate-600 hover:text-slate-900"
                          }`}
                          title="Editor View"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setViewMode("SPLIT")}
                          className={`rounded px-2 py-1 text-xs font-bold transition ${
                            viewMode === "SPLIT"
                              ? "bg-white text-blue-700 shadow-2xs"
                              : "text-slate-600 hover:text-slate-900"
                          }`}
                          title="Split View"
                        >
                          <Columns className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setViewMode("PREVIEW")}
                          className={`rounded px-2 py-1 text-xs font-bold transition ${
                            viewMode === "PREVIEW"
                              ? "bg-white text-blue-700 shadow-2xs"
                              : "text-slate-600 hover:text-slate-900"
                          }`}
                          title="Preview View"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {/* AI Generation Modal Trigger */}
                      <button
                        type="button"
                        onClick={() => setShowAIModal(true)}
                        className="flex items-center gap-1 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-2.5 py-1.5 font-bold text-white text-xs hover:from-blue-700 hover:to-indigo-700 shadow-xs"
                      >
                        <Sparkles className="h-3.5 w-3.5" /> AI Assist
                      </button>

                      {/* Save Draft / Create Revision */}
                      {currentVersion?.is_published ? (
                        <button
                          type="button"
                          onClick={handleCreateRevision}
                          disabled={actionLoading}
                          className="flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-1.5 font-bold text-white text-xs hover:bg-emerald-800 shadow-xs disabled:opacity-50"
                        >
                          <RotateCcw className="h-3.5 w-3.5" /> Create Revision (v{currentVersion.version_number + 1})
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={handleSaveDraft}
                          disabled={isSaving || !currentVersion || !currentSpec}
                          className="flex items-center gap-1 rounded-lg bg-blue-700 px-3 py-1.5 font-bold text-white text-xs hover:bg-blue-800 shadow-xs disabled:opacity-50"
                        >
                          <Save className="h-3.5 w-3.5" /> {isSaving ? "Saving..." : "Save Draft"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Main Content Area */}
                <div className="flex-1 overflow-hidden">
                  {currentSpec ? (
                    viewMode === "PREVIEW" ? (
                      <LiveContentPreview compiledMdx={compiledMdx} />
                    ) : viewMode === "SPLIT" ? (
                      <div className="grid grid-cols-2 h-full overflow-hidden">
                        <div className="h-full overflow-y-auto border-r border-slate-200">
                          <StructuredLessonEditor
                            spec={currentSpec}
                            onChange={handleSpecChange}
                            onOpenQuestionModal={(path) => {
                              setTargetQFieldPath(path);
                              setShowQModal(true);
                            }}
                            onOpenAssetModal={(path) => {
                              setTargetAssetFieldPath(path);
                              setShowAssetModal(true);
                            }}
                            isReadOnly={currentVersion?.is_published}
                          />
                        </div>
                        <div className="h-full overflow-y-auto">
                          <LiveContentPreview compiledMdx={compiledMdx} />
                        </div>
                      </div>
                    ) : (
                      <div className="h-full overflow-y-auto">
                        <StructuredLessonEditor
                          spec={currentSpec}
                          onChange={handleSpecChange}
                          onOpenQuestionModal={(path) => {
                            setTargetQFieldPath(path);
                            setShowQModal(true);
                          }}
                          onOpenAssetModal={(path) => {
                            setTargetAssetFieldPath(path);
                            setShowAssetModal(true);
                          }}
                          isReadOnly={currentVersion?.is_published}
                        />
                      </div>
                    )
                  ) : (
                    <div className="flex flex-col items-center justify-center p-8 text-center h-full">
                      <div className="max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                          <FileCode className="h-6 w-6" />
                        </div>
                        <div>
                          <h3 className="font-bold text-slate-900 text-base">No Canonical Document Found</h3>
                          <p className="mt-1 text-xs text-slate-500">
                            Initialize a canonical Learning Document and structured specification for &quot;{unitDetail?.unit?.title}&quot;.
                          </p>
                        </div>
                        <div className="space-y-2">
                          <label className="text-left font-semibold text-slate-700 text-xs block">Select Document Type:</label>
                          <select
                            value={newDocType}
                            onChange={(e) => setNewDocType(e.target.value as DocumentType)}
                            className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs font-semibold text-slate-800"
                          >
                            <option value="CONCEPT_LESSON">Concept Lesson (Core Theory & Fundamentals)</option>
                            <option value="WORKED_EXAMPLES">Worked Examples (Graded Step-by-Step Solutions)</option>
                            <option value="FORMULA_SHORTCUT_SHEET">Formula Shortcut Sheet (Quick Formulas & Rules)</option>
                            <option value="COMMON_TRAPS_AND_MISTAKES">Common Traps & Mistakes (Exam Pitfalls)</option>
                            <option value="PYQ_DEEP_DIVE">PYQ Deep Dive (Authentic Exam Questions)</option>
                            <option value="TOPIC_SUMMARY_REVISION">Topic Summary & Revision (Last-Mile Review)</option>
                          </select>
                          <button
                            type="button"
                            onClick={handleCreateDocument}
                            disabled={actionLoading}
                            className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2.5 font-bold text-xs text-white hover:bg-blue-800 shadow-xs transition disabled:opacity-50"
                          >
                            <Plus className="h-4 w-4" /> Create Canonical Document & Initial Draft
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center p-8 text-center text-slate-500">
                <div className="max-w-sm space-y-3">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                    <Layers className="h-7 w-7" />
                  </div>
                  <h3 className="font-bold text-slate-900 text-sm">Select a Learning Unit</h3>
                  <p className="text-xs text-slate-500">
                    Navigate the academic taxonomy tree on the left to author, validate, or publish learning documents.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Validation & Version History Panels (Col 3) */}
          <div className="col-span-3 flex h-full flex-col overflow-y-auto border-l border-slate-200 bg-slate-50/50">
            <ValidationPanel
              isValid={validationResult.isValid}
              errors={validationResult.errors}
              warnings={validationResult.warnings}
              isPublished={currentVersion?.is_published}
            />

            <div className="border-t border-slate-200">
              <VersionHistoryPanel
                versions={unitDetail?.documents?.[0]?.document_versions || []}
                currentVersionId={currentVersion?.id || null}
                onSelectVersion={handleSelectVersion}
                onSubmitForReview={handleSubmitForReview}
                onApprove={handleApprove}
                onCompile={handleCompile}
                onPublish={handlePublish}
                loading={actionLoading}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <CurriculumCoverageView
            report={initialCoverage}
            matrix={initialMatrix}
            onSelectUnitDocType={(unitId, docType) => {
              handleSelectUnit(unitId);
              setActiveTab("EXPLORER");
            }}
          />
        </div>
      )}

      {/* Question Bank Selector Modal */}
      <QuestionBankSelectorModal
        isOpen={showQModal}
        onClose={() => setShowQModal(false)}
        onSearch={async (q) => {
          const res = await searchQuestionBankAction(q);
          return res.success && res.questions ? res.questions : [];
        }}
        onSelectQuestion={(q, rationale) => {
          if (!currentSpec) return;
          const newSpec: LessonDocumentSpec = JSON.parse(JSON.stringify(currentSpec));
          if (!newSpec.authenticPyqReferences) newSpec.authenticPyqReferences = [];
          newSpec.authenticPyqReferences.push({
            questionVersionId: q.questionVersionId,
            relevanceRationale: rationale,
          });
          handleSpecChange(newSpec);
        }}
      />

      {/* Asset Catalog Modal */}
      <AssetCatalogModal
        isOpen={showAssetModal}
        onClose={() => setShowAssetModal(false)}
        onSearch={async (q, type) => {
          const res = await searchAssetsAction(q, type);
          return res.success && res.assets ? res.assets : [];
        }}
        onSelectAsset={(assetId) => {
          if (!currentSpec || !targetAssetFieldPath) return;
          const newSpec = JSON.parse(JSON.stringify(currentSpec));
          const parts = targetAssetFieldPath.split(".");
          let curr: any = newSpec;
          for (let i = 0; i < parts.length - 1; i++) {
            curr = curr[parts[i]];
          }
          curr[parts[parts.length - 1]] = assetId;
          handleSpecChange(newSpec);
        }}
      />

      {/* AI Generation Modal */}
      {selectedUnitId && (
        <AIGenerationModal
          isOpen={showAIModal}
          onClose={() => setShowAIModal(false)}
          learningUnitId={selectedUnitId}
          unitTitle={unitDetail?.unit?.title || "Selected Unit"}
          onGenerated={(result) => {
            if (result?.spec) {
              setCurrentSpec(result.spec);
              setHasUnsavedChanges(true);
              if (result.validation) {
                setValidationResult(result.validation);
              }
              if (result.documentVersion) {
                setCurrentVersion(result.documentVersion);
              }
            }
          }}
        />
      )}
    </div>
  );
}
