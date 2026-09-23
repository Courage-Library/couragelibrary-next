"use client";

import React, { useState } from "react";
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
import type { DocumentType } from "@/types/learning-compiler";
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
} from "@/app/admin/content/actions";
import {
  BookOpen,
  LayoutDashboard,
  Layers,
  FileCode,
  ShieldCheck,
  Award,
  Plus,
  Save,
  Play,
  History,
  Sparkles,
  ListTodo,
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
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [unitDetail, setUnitDetail] = useState<any | null>(null);
  const [currentSpec, setCurrentSpec] = useState<any | null>(null);
  const [currentVersion, setCurrentVersion] = useState<any | null>(null);
  const [compiledMdx, setCompiledMdx] = useState<string>("# Select a Learning Unit to begin authoring.");
  const [validationResult, setValidationResult] = useState<any>({ isValid: true, errors: [], warnings: [] });
  const [isSaving, setIsSaving] = useState(false);

  // Modals
  const [showQModal, setShowQModal] = useState(false);
  const [showAssetModal, setShowAssetModal] = useState(false);
  const [showAIModal, setShowAIModal] = useState(false);

  const handleSelectUnit = async (unitId: string) => {
    setSelectedUnitId(unitId);
    const res = await getLearningUnitDetailAction(unitId);
    if (res.success && res.detail) {
      setUnitDetail(res.detail);
      const docs = res.detail.documents || [];
      if (docs.length > 0 && docs[0].document_versions?.length > 0) {
        const ver = docs[0].document_versions[0];
        setCurrentVersion(ver);
      }
    }
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
      }
    } finally {
      setIsSaving(false);
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
            <p className="text-[11px] text-slate-500">Authoring, AST Compilation & Publishing Engine</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
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
              <Award className="h-4 w-4" /> Coverage View
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
          {/* Left Column: Academic Explorer Tree */}
          <div className="col-span-3 h-full overflow-hidden">
            <AcademicTaxonomyExplorer
              tree={initialTree}
              selectedUnitId={selectedUnitId}
              onSelectUnit={handleSelectUnit}
            />
          </div>

          {/* Center Column: Structured Editor / Live Preview Tabs */}
          <div className="col-span-6 flex h-full flex-col border-r border-slate-200 bg-white overflow-hidden">
            {selectedUnitId ? (
              <div className="flex-1 overflow-y-auto">
                <div className="border-b border-slate-200 bg-slate-50/60 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-[10px] text-blue-700 uppercase tracking-wider">Learning Unit</span>
                      <h2 className="font-bold text-slate-900 text-lg">{unitDetail?.unit?.title || "Unit Workspace"}</h2>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowAIModal(true)}
                        className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-3 py-1.5 font-bold text-white text-xs hover:from-blue-700 hover:to-indigo-700 shadow-xs"
                      >
                        <Sparkles className="h-3.5 w-3.5" /> Generate with AI
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveDraft}
                        disabled={isSaving}
                        className="flex items-center gap-1.5 rounded-lg bg-blue-700 px-3 py-1.5 font-bold text-white text-xs hover:bg-blue-800 shadow-xs disabled:opacity-50"
                      >
                        <Save className="h-3.5 w-3.5" /> {isSaving ? "Saving..." : "Save Draft"}
                      </button>
                    </div>
                  </div>
                </div>

                {currentSpec ? (
                  <StructuredLessonEditor
                    spec={currentSpec}
                    onChange={setCurrentSpec}
                    onOpenQuestionModal={() => setShowQModal(true)}
                    onOpenAssetModal={() => setShowAssetModal(true)}
                    isReadOnly={currentVersion?.is_published}
                  />
                ) : (
                  <div className="p-8 text-center text-slate-500">
                    <p>No document spec loaded for this unit.</p>
                    <button
                      type="button"
                      onClick={() => {
                        const newSpec = {
                          schemaVersion: "1.0.0",
                          documentId: `doc-${Date.now()}`,
                          unitSlug: unitDetail?.unit?.slug || "lesson_slug",
                          language: "en",
                          metadata: {
                            title: unitDetail?.unit?.title || "Lesson Title",
                            topicId: unitDetail?.unit?.topic_id || "topic-id",
                            subjectId: "sub-id",
                            targetExamCategories: ["SSC_CGL"],
                            estimatedReadingMinutes: 8,
                            difficultyTier: "BEGINNER",
                            authoritativeKeywords: ["concept"],
                          },
                          learningObjectives: ["Understand fundamental concepts"],
                          prerequisites: [],
                          sections: [
                            {
                              id: "sec-1",
                              title: "Introduction",
                              sectionType: "THEORY",
                              contentMarkdown: "Enter theoretical explanation...",
                            }
                          ],
                          revisionSummary: { keyTakeaways: ["Key takeaway 1"] },
                          seo: { metaTitle: "SEO Title", metaDescription: "Description", focusKeywords: [] },
                        };
                        setCurrentSpec(newSpec);
                      }}
                      className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 font-bold text-xs text-white hover:bg-blue-800 shadow-xs"
                    >
                      <Plus className="h-4 w-4" /> Create Initial Document Spec
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center p-8 text-center text-slate-500">
                <div className="max-w-sm">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                    <Layers className="h-6 w-6" />
                  </div>
                  <h3 className="mt-3 font-bold text-slate-900 text-sm">Select a Learning Unit</h3>
                  <p className="mt-1 text-xs text-slate-500">Navigate the academic taxonomy on the left to author or review content.</p>
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Validation & Version History Panels */}
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
                currentVersionId={currentVersion?.id}
                onSelectVersion={(id) => {
                  const v = unitDetail?.documents?.[0]?.document_versions?.find((x: any) => x.id === id);
                  if (v) setCurrentVersion(v);
                }}
                onSubmitForReview={async (id) => {
                  await submitForReviewAction(id);
                  if (selectedUnitId) handleSelectUnit(selectedUnitId);
                }}
                onApprove={async (id) => {
                  await reviewVersionAction({ versionId: id, decision: "APPROVED" });
                  if (selectedUnitId) handleSelectUnit(selectedUnitId);
                }}
                onCompile={async (id) => {
                  await compileVersionAction(id);
                  if (selectedUnitId) handleSelectUnit(selectedUnitId);
                }}
                onPublish={async (id) => {
                  await publishVersionAction(id);
                  if (selectedUnitId) handleSelectUnit(selectedUnitId);
                }}
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

      {/* Question Bank Modal */}
      <QuestionBankSelectorModal
        isOpen={showQModal}
        onClose={() => setShowQModal(false)}
        onSearch={async (q) => {
          const res = await searchQuestionBankAction(q);
          return res.success && res.questions ? res.questions : [];
        }}
        onSelectQuestion={(q, rationale) => {
          if (!currentSpec) return;
          const newSpec = JSON.parse(JSON.stringify(currentSpec));
          if (!newSpec.authenticPyqReferences) newSpec.authenticPyqReferences = [];
          newSpec.authenticPyqReferences.push({
            questionVersionId: q.questionVersionId,
            relevanceRationale: rationale,
          });
          setCurrentSpec(newSpec);
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
          // Attached to current section
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
