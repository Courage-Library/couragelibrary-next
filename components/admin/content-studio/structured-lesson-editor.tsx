"use client";

import React, { useState } from "react";
import {
  LessonDocumentSpec,
  SectionType,
  DifficultyTier,
  CalloutVariant,
  TrapType,
} from "@/types/learning-compiler";
import {
  Plus,
  Trash2,
  Sigma,
  AlertOctagon,
  HelpCircle,
  FileText,
  Lightbulb,
  CheckCircle2,
  Image as ImageIcon,
  Sparkles,
  BookOpen,
  Target,
  Search,
  ListChecks,
  AlertTriangle,
  Zap,
} from "lucide-react";

interface Props {
  spec: LessonDocumentSpec;
  onChange: (updatedSpec: LessonDocumentSpec) => void;
  onOpenQuestionModal: (fieldPath: string) => void;
  onOpenAssetModal: (fieldPath: string) => void;
  isReadOnly?: boolean;
}

export const StructuredLessonEditor: React.FC<Props> = ({
  spec,
  onChange,
  onOpenQuestionModal,
  onOpenAssetModal,
  isReadOnly = false,
}) => {
  const [activeEditorTab, setActiveEditorTab] = useState<
    "META" | "SECTIONS" | "FORMULAS" | "EXAMPLES" | "TRAPS" | "PYQS_CHECKS" | "SUMMARY"
  >("SECTIONS");

  const updateField = (path: string, val: any) => {
    if (isReadOnly) return;
    const newSpec: LessonDocumentSpec = JSON.parse(JSON.stringify(spec));
    const parts = path.split(".");
    let curr: any = newSpec;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!curr[parts[i]]) {
        curr[parts[i]] = {};
      }
      curr = curr[parts[i]];
    }
    curr[parts[parts.length - 1]] = val;
    onChange(newSpec);
  };

  // --- SECTIONS HELPERS ---
  const addSection = () => {
    if (isReadOnly) return;
    const newSpec: LessonDocumentSpec = JSON.parse(JSON.stringify(spec));
    if (!newSpec.sections) newSpec.sections = [];
    newSpec.sections.push({
      id: `sec-${Date.now()}`,
      title: "New Theoretical Section",
      sectionType: "THEORY",
      contentMarkdown: "Enter educational theory here...",
      calloutNotes: [],
    });
    onChange(newSpec);
  };

  const removeSection = (idx: number) => {
    if (isReadOnly) return;
    const newSpec: LessonDocumentSpec = JSON.parse(JSON.stringify(spec));
    newSpec.sections.splice(idx, 1);
    onChange(newSpec);
  };

  const addCallout = (secIdx: number) => {
    if (isReadOnly) return;
    const newSpec: LessonDocumentSpec = JSON.parse(JSON.stringify(spec));
    if (!newSpec.sections[secIdx].calloutNotes) {
      newSpec.sections[secIdx].calloutNotes = [];
    }
    newSpec.sections[secIdx].calloutNotes!.push({
      variant: "TIP",
      title: "Key Exam Insight",
      body: "Add important tip or caveat...",
    });
    onChange(newSpec);
  };

  const removeCallout = (secIdx: number, calloutIdx: number) => {
    if (isReadOnly) return;
    const newSpec: LessonDocumentSpec = JSON.parse(JSON.stringify(spec));
    newSpec.sections[secIdx].calloutNotes?.splice(calloutIdx, 1);
    onChange(newSpec);
  };

  // --- FORMULA HELPERS ---
  const addFormula = () => {
    if (isReadOnly) return;
    const newSpec: LessonDocumentSpec = JSON.parse(JSON.stringify(spec));
    if (!newSpec.formulaBlocks) newSpec.formulaBlocks = [];
    newSpec.formulaBlocks.push({
      id: `form-${Date.now()}`,
      name: "Core Formula",
      latexFormula: "P = \\frac{A}{B} \\times 100",
      variableDefinitions: [{ symbol: "P", meaning: "Percentage" }],
      applicableConditions: ["When base is positive"],
      speedShortcutTrick: "Double the numerator and divide by ten.",
    });
    onChange(newSpec);
  };

  const removeFormula = (idx: number) => {
    if (isReadOnly) return;
    const newSpec: LessonDocumentSpec = JSON.parse(JSON.stringify(spec));
    newSpec.formulaBlocks?.splice(idx, 1);
    onChange(newSpec);
  };

  // --- WORKED EXAMPLES HELPERS ---
  const addWorkedExample = () => {
    if (isReadOnly) return;
    const newSpec: LessonDocumentSpec = JSON.parse(JSON.stringify(spec));
    if (!newSpec.workedExamples) newSpec.workedExamples = [];
    newSpec.workedExamples.push({
      id: `ex-${Date.now()}`,
      difficulty: "MEDIUM",
      problemText: "If the cost price of 12 articles equals selling price of 9 articles, find gain percentage.",
      stepByStepSolution: [
        {
          stepNumber: 1,
          explanation: "Let CP of 1 article = ₹1. Then CP of 12 articles = ₹12 = SP of 9 articles.",
          mathSnippet: "CP(1) = 1 \\implies SP(9) = 12",
        },
        {
          stepNumber: 2,
          explanation: "Gain on 9 articles = SP(9) - CP(9) = 12 - 9 = ₹3.",
          mathSnippet: "\\text{Gain} = 12 - 9 = 3",
        },
        {
          stepNumber: 3,
          explanation: "Gain % = (3 / 9) * 100 = 33.33%.",
          mathSnippet: "\\text{Gain \\%} = \\frac{3}{9} \\times 100 = 33.33\\%",
        },
      ],
      shortcutMethod: "Gain % = (Goods Given - Goods Sold) / Goods Sold * 100 = (12 - 9)/9 * 100 = 33.33%.",
      commonMistakeToAvoid: "Do not calculate gain on cost price of 12 articles; always base on goods sold.",
    });
    onChange(newSpec);
  };

  const removeWorkedExample = (idx: number) => {
    if (isReadOnly) return;
    const newSpec: LessonDocumentSpec = JSON.parse(JSON.stringify(spec));
    newSpec.workedExamples?.splice(idx, 1);
    onChange(newSpec);
  };

  // --- COGNITIVE TRAPS HELPERS ---
  const addCognitiveTrap = () => {
    if (isReadOnly) return;
    const newSpec: LessonDocumentSpec = JSON.parse(JSON.stringify(spec));
    if (!newSpec.cognitiveTraps) newSpec.cognitiveTraps = [];
    newSpec.cognitiveTraps.push({
      trapType: "CALCULATION_SLIP",
      misconception: "Confusing percentage markup on cost price with profit margin on selling price.",
      correctApproach: "Markup is always computed on Cost Price, while Margin is computed on Selling Price.",
    });
    onChange(newSpec);
  };

  const removeCognitiveTrap = (idx: number) => {
    if (isReadOnly) return;
    const newSpec: LessonDocumentSpec = JSON.parse(JSON.stringify(spec));
    newSpec.cognitiveTraps?.splice(idx, 1);
    onChange(newSpec);
  };

  // --- QUICK CHECKS HELPERS ---
  const addQuickCheck = () => {
    if (isReadOnly) return;
    const newSpec: LessonDocumentSpec = JSON.parse(JSON.stringify(spec));
    if (!newSpec.quickChecks) newSpec.quickChecks = [];
    newSpec.quickChecks.push({
      id: `qc-${Date.now()}`,
      prompt: "Which of the following conditions is mandatory before applying the formula?",
      options: [
        { id: "opt-1", text: "Values must be strictly positive", isCorrect: true, feedbackExplanation: "Correct! The theorem requires positive reals." },
        { id: "opt-2", text: "Values must be prime numbers", isCorrect: false, feedbackExplanation: "Incorrect. The formula applies to any real numbers." },
        { id: "opt-3", text: "Only valid for even powers", isCorrect: false, feedbackExplanation: "Incorrect. Holds for odd and even powers." },
      ],
    });
    onChange(newSpec);
  };

  const removeQuickCheck = (idx: number) => {
    if (isReadOnly) return;
    const newSpec: LessonDocumentSpec = JSON.parse(JSON.stringify(spec));
    newSpec.quickChecks?.splice(idx, 1);
    onChange(newSpec);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50/50">
      {/* Read-Only Status Banner */}
      {isReadOnly && (
        <div className="bg-amber-500/10 border-b border-amber-200 px-4 py-2 text-xs font-semibold text-amber-900 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
          <span>This version is published and permanently immutable. Editing is locked. Create a new revision to make changes.</span>
        </div>
      )}

      {/* Editor Section Sub-Navigation Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200 bg-white px-4 py-2 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveEditorTab("SECTIONS")}
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-bold text-xs transition shrink-0 ${
            activeEditorTab === "SECTIONS"
              ? "bg-blue-50 text-blue-700 border border-blue-200/80 shadow-2xs"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
          }`}
        >
          <FileText className="h-3.5 w-3.5" />
          <span>Theory ({spec.sections?.length || 0})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveEditorTab("FORMULAS")}
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-bold text-xs transition shrink-0 ${
            activeEditorTab === "FORMULAS"
              ? "bg-blue-50 text-blue-700 border border-blue-200/80 shadow-2xs"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
          }`}
        >
          <Sigma className="h-3.5 w-3.5" />
          <span>Formulas ({spec.formulaBlocks?.length || 0})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveEditorTab("EXAMPLES")}
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-bold text-xs transition shrink-0 ${
            activeEditorTab === "EXAMPLES"
              ? "bg-blue-50 text-blue-700 border border-blue-200/80 shadow-2xs"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
          }`}
        >
          <Lightbulb className="h-3.5 w-3.5" />
          <span>Examples ({spec.workedExamples?.length || 0})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveEditorTab("TRAPS")}
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-bold text-xs transition shrink-0 ${
            activeEditorTab === "TRAPS"
              ? "bg-blue-50 text-blue-700 border border-blue-200/80 shadow-2xs"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
          }`}
        >
          <AlertOctagon className="h-3.5 w-3.5" />
          <span>Traps ({spec.cognitiveTraps?.length || 0})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveEditorTab("PYQS_CHECKS")}
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-bold text-xs transition shrink-0 ${
            activeEditorTab === "PYQS_CHECKS"
              ? "bg-blue-50 text-blue-700 border border-blue-200/80 shadow-2xs"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
          }`}
        >
          <ListChecks className="h-3.5 w-3.5" />
          <span>PYQs & Checks ({spec.authenticPyqReferences?.length || 0} / {spec.quickChecks?.length || 0})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveEditorTab("SUMMARY")}
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-bold text-xs transition shrink-0 ${
            activeEditorTab === "SUMMARY"
              ? "bg-blue-50 text-blue-700 border border-blue-200/80 shadow-2xs"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
          }`}
        >
          <Zap className="h-3.5 w-3.5" />
          <span>Summary & Speed</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveEditorTab("META")}
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-bold text-xs transition shrink-0 ${
            activeEditorTab === "META"
              ? "bg-blue-50 text-blue-700 border border-blue-200/80 shadow-2xs"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
          }`}
        >
          <Target className="h-3.5 w-3.5" />
          <span>Meta & SEO</span>
        </button>
      </div>

      {/* Editor Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 text-xs">
        {/* ============================================================ */}
        {/* TAB 1: THEORY SECTIONS */}
        {/* ============================================================ */}
        {activeEditorTab === "SECTIONS" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Structured Theory Sections</h3>
                <p className="text-[11px] text-slate-500">Author theoretical concepts, derivations, and visual explanations.</p>
              </div>
              {!isReadOnly && (
                <button
                  type="button"
                  onClick={addSection}
                  className="flex items-center gap-1 rounded-lg bg-blue-700 px-3 py-1.5 font-bold text-white hover:bg-blue-800 transition shadow-2xs"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Section
                </button>
              )}
            </div>

            {(!spec.sections || spec.sections.length === 0) && (
              <div className="p-8 text-center text-slate-400 bg-white rounded-xl border border-dashed border-slate-300">
                No sections yet. Click &quot;Add Section&quot; to begin writing content.
              </div>
            )}

            {spec.sections?.map((sec, idx) => (
              <div
                key={sec.id || idx}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3 transition hover:border-slate-300"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 flex items-center gap-2">
                    <span className="font-mono text-slate-400 font-bold text-xs">#{idx + 1}</span>
                    <input
                      type="text"
                      disabled={isReadOnly}
                      value={sec.title}
                      onChange={(e) => updateField(`sections.${idx}.title`, e.target.value)}
                      placeholder="Section Title (e.g. Fundamental Theorem & Conditions)"
                      className="font-bold text-slate-900 text-sm bg-transparent border-b border-slate-200 py-1 focus:border-blue-600 focus:outline-hidden w-full"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      disabled={isReadOnly}
                      value={sec.sectionType}
                      onChange={(e) => updateField(`sections.${idx}.sectionType`, e.target.value as SectionType)}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-700"
                    >
                      <option value="THEORY">Theory</option>
                      <option value="VISUAL_EXPLANATION">Visual Explanation</option>
                      <option value="DERIVATION">Derivation</option>
                      <option value="APPLICATION">Application</option>
                    </select>
                    {!isReadOnly && (
                      <button
                        type="button"
                        onClick={() => removeSection(idx)}
                        className="text-slate-400 hover:text-rose-600 p-1 rounded-md hover:bg-rose-50 transition"
                        title="Delete Section"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-600 mb-1 block">Content (Markdown + Math LaTeX support)</label>
                  <textarea
                    rows={6}
                    disabled={isReadOnly}
                    value={sec.contentMarkdown}
                    onChange={(e) => updateField(`sections.${idx}.contentMarkdown`, e.target.value)}
                    placeholder="Enter formatted content with educational explanations, bullet points, and math expressions..."
                    className="w-full rounded-lg border border-slate-200 bg-slate-50/50 p-3 font-mono text-xs text-slate-800 focus:border-blue-600 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-600 shadow-2xs leading-relaxed"
                  />
                </div>

                {/* Attached Diagram Asset */}
                <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isReadOnly}
                      onClick={() => onOpenAssetModal(`sections.${idx}.diagramAssetId`)}
                      className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-700 hover:bg-slate-100 transition font-medium shadow-2xs"
                    >
                      <ImageIcon className="h-3.5 w-3.5 text-blue-700" />
                      <span>{sec.diagramAssetId ? `Attached Asset: ${sec.diagramAssetId}` : "Attach Diagram Asset"}</span>
                    </button>
                    {sec.diagramAssetId && !isReadOnly && (
                      <button
                        type="button"
                        onClick={() => updateField(`sections.${idx}.diagramAssetId`, undefined)}
                        className="text-slate-400 hover:text-rose-600 text-[10px] underline"
                      >
                        Remove Asset
                      </button>
                    )}
                  </div>

                  {!isReadOnly && (
                    <button
                      type="button"
                      onClick={() => addCallout(idx)}
                      className="flex items-center gap-1 rounded-lg bg-amber-50 border border-amber-200/80 px-2 py-1 text-[11px] font-bold text-amber-800 hover:bg-amber-100 transition"
                    >
                      <Plus className="h-3 w-3" /> Add Callout Note
                    </button>
                  )}
                </div>

                {/* Callout Notes */}
                {(sec.calloutNotes && sec.calloutNotes.length > 0) && (
                  <div className="mt-3 space-y-2 pl-3 border-l-2 border-amber-300">
                    {sec.calloutNotes.map((callout, cIdx) => (
                      <div key={cIdx} className="rounded-lg bg-amber-50/60 border border-amber-200/80 p-2.5 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-1">
                            <select
                              disabled={isReadOnly}
                              value={callout.variant}
                              onChange={(e) => updateField(`sections.${idx}.calloutNotes.${cIdx}.variant`, e.target.value as CalloutVariant)}
                              className="rounded border border-amber-200 bg-white px-1.5 py-0.5 text-[10px] font-bold text-amber-900"
                            >
                              <option value="TIP">TIP</option>
                              <option value="WARNING">WARNING</option>
                              <option value="INFO">INFO</option>
                              <option value="MEMORY_HOOK">MEMORY HOOK</option>
                            </select>
                            <input
                              type="text"
                              disabled={isReadOnly}
                              value={callout.title}
                              onChange={(e) => updateField(`sections.${idx}.calloutNotes.${cIdx}.title`, e.target.value)}
                              placeholder="Callout Title"
                              className="font-bold text-amber-950 text-xs bg-transparent border-b border-amber-200/60 flex-1 focus:outline-hidden"
                            />
                          </div>
                          {!isReadOnly && (
                            <button
                              type="button"
                              onClick={() => removeCallout(idx, cIdx)}
                              className="text-amber-700 hover:text-rose-600 p-0.5"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                        <textarea
                          rows={2}
                          disabled={isReadOnly}
                          value={callout.body}
                          onChange={(e) => updateField(`sections.${idx}.calloutNotes.${cIdx}.body`, e.target.value)}
                          placeholder="Callout body text..."
                          className="w-full rounded border border-amber-200 bg-white p-1.5 text-xs text-amber-950 focus:outline-hidden"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 2: FORMULA BLOCKS */}
        {/* ============================================================ */}
        {activeEditorTab === "FORMULAS" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Formula Shortcut Sheets & Cards</h3>
                <p className="text-[11px] text-slate-500">LaTeX equations, variable definitions, and rapid calculation shortcuts.</p>
              </div>
              {!isReadOnly && (
                <button
                  type="button"
                  onClick={addFormula}
                  className="flex items-center gap-1 rounded-lg bg-blue-700 px-3 py-1.5 font-bold text-white hover:bg-blue-800 transition shadow-2xs"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Formula Card
                </button>
              )}
            </div>

            {(!spec.formulaBlocks || spec.formulaBlocks.length === 0) && (
              <div className="p-8 text-center text-slate-400 bg-white rounded-xl border border-dashed border-slate-300">
                No formula cards added. Click &quot;Add Formula Card&quot; to define formulas and shortcuts.
              </div>
            )}

            {spec.formulaBlocks?.map((fb, idx) => (
              <div
                key={fb.id || idx}
                className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 shadow-2xs space-y-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <input
                    type="text"
                    disabled={isReadOnly}
                    value={fb.name}
                    onChange={(e) => updateField(`formulaBlocks.${idx}.name`, e.target.value)}
                    placeholder="Formula Name (e.g. Compound Interest Annual Compounding)"
                    className="font-bold text-blue-900 text-sm bg-transparent border-b border-blue-200/80 py-1 focus:border-blue-600 focus:outline-hidden w-full"
                  />
                  {!isReadOnly && (
                    <button
                      type="button"
                      onClick={() => removeFormula(idx)}
                      className="text-slate-400 hover:text-rose-600 p-1"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-blue-900 mb-1 block">LaTeX Formula</label>
                  <input
                    type="text"
                    disabled={isReadOnly}
                    value={fb.latexFormula}
                    onChange={(e) => updateField(`formulaBlocks.${idx}.latexFormula`, e.target.value)}
                    placeholder="LaTeX string: e.g. A = P \\left(1 + \\frac{r}{100}\\right)^t"
                    className="w-full rounded-lg border border-blue-200 bg-white p-2.5 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-hidden shadow-2xs"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-700 mb-1 block">Speed Shortcut Trick</label>
                    <input
                      type="text"
                      disabled={isReadOnly}
                      value={fb.speedShortcutTrick || ""}
                      onChange={(e) => updateField(`formulaBlocks.${idx}.speedShortcutTrick`, e.target.value)}
                      placeholder="e.g. For 2 years CI-SI difference, use D = P*(r/100)^2"
                      className="w-full rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-hidden shadow-2xs"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-700 mb-1 block">Applicable Conditions</label>
                    <input
                      type="text"
                      disabled={isReadOnly}
                      value={fb.applicableConditions?.join(", ") || ""}
                      onChange={(e) => updateField(`formulaBlocks.${idx}.applicableConditions`, e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
                      placeholder="Comma-separated: Annual compounding, t in whole years"
                      className="w-full rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-hidden shadow-2xs"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 3: WORKED EXAMPLES */}
        {/* ============================================================ */}
        {activeEditorTab === "EXAMPLES" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Worked Examples & Step-by-Step Solutions</h3>
                <p className="text-[11px] text-slate-500">Graded illustrative problems with standard and fast-track shortcut solutions.</p>
              </div>
              {!isReadOnly && (
                <button
                  type="button"
                  onClick={addWorkedExample}
                  className="flex items-center gap-1 rounded-lg bg-blue-700 px-3 py-1.5 font-bold text-white hover:bg-blue-800 transition shadow-2xs"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Worked Example
                </button>
              )}
            </div>

            {(!spec.workedExamples || spec.workedExamples.length === 0) && (
              <div className="p-8 text-center text-slate-400 bg-white rounded-xl border border-dashed border-slate-300">
                No worked examples yet. Click &quot;Add Worked Example&quot; to add step-by-step solutions.
              </div>
            )}

            {spec.workedExamples?.map((ex, idx) => (
              <div
                key={ex.id || idx}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-bold text-slate-900 text-xs">Example #{idx + 1}</span>
                  <div className="flex items-center gap-2">
                    <select
                      disabled={isReadOnly}
                      value={ex.difficulty}
                      onChange={(e) => updateField(`workedExamples.${idx}.difficulty`, e.target.value)}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-700"
                    >
                      <option value="EASY">Easy</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HARD">Hard</option>
                    </select>
                    {!isReadOnly && (
                      <button
                        type="button"
                        onClick={() => removeWorkedExample(idx)}
                        className="text-slate-400 hover:text-rose-600 p-1"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-700 mb-1 block">Problem Statement</label>
                  <textarea
                    rows={2}
                    disabled={isReadOnly}
                    value={ex.problemText}
                    onChange={(e) => updateField(`workedExamples.${idx}.problemText`, e.target.value)}
                    placeholder="Enter the full problem statement..."
                    className="w-full rounded-lg border border-slate-200 bg-slate-50/50 p-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-hidden shadow-2xs"
                  />
                </div>

                {/* Steps */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-700">Step-by-Step Solution Steps</span>
                    {!isReadOnly && (
                      <button
                        type="button"
                        onClick={() => {
                          const newSpec = JSON.parse(JSON.stringify(spec));
                          if (!newSpec.workedExamples[idx].stepByStepSolution) {
                            newSpec.workedExamples[idx].stepByStepSolution = [];
                          }
                          const stepNum = newSpec.workedExamples[idx].stepByStepSolution.length + 1;
                          newSpec.workedExamples[idx].stepByStepSolution.push({
                            stepNumber: stepNum,
                            explanation: "Step explanation...",
                            mathSnippet: "",
                          });
                          onChange(newSpec);
                        }}
                        className="text-blue-700 font-bold text-[10px] hover:underline"
                      >
                        + Add Step
                      </button>
                    )}
                  </div>

                  {ex.stepByStepSolution?.map((st, sIdx) => (
                    <div key={sIdx} className="flex gap-2 items-start bg-slate-50 p-2 rounded-lg border border-slate-200/80">
                      <span className="font-bold text-slate-600 text-xs mt-1 shrink-0">Step {st.stepNumber}:</span>
                      <div className="flex-1 space-y-1">
                        <input
                          type="text"
                          disabled={isReadOnly}
                          value={st.explanation}
                          onChange={(e) => updateField(`workedExamples.${idx}.stepByStepSolution.${sIdx}.explanation`, e.target.value)}
                          placeholder="Explanation"
                          className="w-full rounded border border-slate-200 bg-white p-1.5 text-xs text-slate-900 focus:outline-hidden"
                        />
                        <input
                          type="text"
                          disabled={isReadOnly}
                          value={st.mathSnippet || ""}
                          onChange={(e) => updateField(`workedExamples.${idx}.stepByStepSolution.${sIdx}.mathSnippet`, e.target.value)}
                          placeholder="Optional LaTeX snippet: e.g. x = \frac{-b \pm \sqrt{D}}{2a}"
                          className="w-full rounded border border-slate-200 bg-white p-1.5 font-mono text-[11px] text-slate-800 focus:outline-hidden"
                        />
                      </div>
                      {!isReadOnly && (
                        <button
                          type="button"
                          onClick={() => {
                            const newSpec = JSON.parse(JSON.stringify(spec));
                            newSpec.workedExamples[idx].stepByStepSolution.splice(sIdx, 1);
                            // re-index
                            newSpec.workedExamples[idx].stepByStepSolution.forEach((s: any, i: number) => {
                              s.stepNumber = i + 1;
                            });
                            onChange(newSpec);
                          }}
                          className="text-slate-400 hover:text-rose-600 p-1"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <div>
                    <label className="text-[11px] font-semibold text-emerald-800 mb-1 block">Shortcut Exam Method</label>
                    <input
                      type="text"
                      disabled={isReadOnly}
                      value={ex.shortcutMethod || ""}
                      onChange={(e) => updateField(`workedExamples.${idx}.shortcutMethod`, e.target.value)}
                      placeholder="Direct ratio trick or mental math shortcut..."
                      className="w-full rounded-lg border border-emerald-200 bg-emerald-50/40 p-2 text-xs text-emerald-950 focus:border-emerald-600 focus:outline-hidden shadow-2xs"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-rose-800 mb-1 block">Common Mistake to Avoid</label>
                    <input
                      type="text"
                      disabled={isReadOnly}
                      value={ex.commonMistakeToAvoid || ""}
                      onChange={(e) => updateField(`workedExamples.${idx}.commonMistakeToAvoid`, e.target.value)}
                      placeholder="Frequent calculation error or trap..."
                      className="w-full rounded-lg border border-rose-200 bg-rose-50/40 p-2 text-xs text-rose-950 focus:border-rose-600 focus:outline-hidden shadow-2xs"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 4: COGNITIVE TRAPS */}
        {/* ============================================================ */}
        {activeEditorTab === "TRAPS" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Cognitive Traps & Exam Pitfalls</h3>
                <p className="text-[11px] text-slate-500">Document negative-marking traps, distractor patterns, and keyword misinterpretations.</p>
              </div>
              {!isReadOnly && (
                <button
                  type="button"
                  onClick={addCognitiveTrap}
                  className="flex items-center gap-1 rounded-lg bg-blue-700 px-3 py-1.5 font-bold text-white hover:bg-blue-800 transition shadow-2xs"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Trap Card
                </button>
              )}
            </div>

            {(!spec.cognitiveTraps || spec.cognitiveTraps.length === 0) && (
              <div className="p-8 text-center text-slate-400 bg-white rounded-xl border border-dashed border-slate-300">
                No cognitive traps registered. Click &quot;Add Trap Card&quot; to catalog frequent mistakes.
              </div>
            )}

            {spec.cognitiveTraps?.map((trap, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-rose-200 bg-rose-50/30 p-4 shadow-2xs space-y-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-rose-900 text-xs">Trap Type:</span>
                    <select
                      disabled={isReadOnly}
                      value={trap.trapType}
                      onChange={(e) => updateField(`cognitiveTraps.${idx}.trapType`, e.target.value as TrapType)}
                      className="rounded-lg border border-rose-200 bg-white px-2 py-1 text-xs font-bold text-rose-800"
                    >
                      <option value="CALCULATION_SLIP">Calculation Slip</option>
                      <option value="MISREAD_KEYWORD">Misread Keyword</option>
                      <option value="FORMULA_CONFUSION">Formula Confusion</option>
                      <option value="DISTRACTOR_TRAP">Distractor Trap</option>
                    </select>
                  </div>
                  {!isReadOnly && (
                    <button
                      type="button"
                      onClick={() => removeCognitiveTrap(idx)}
                      className="text-slate-400 hover:text-rose-600 p-1"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>

                <div className="space-y-2">
                  <div>
                    <label className="text-[11px] font-semibold text-rose-900 mb-1 block">The Common Misconception</label>
                    <textarea
                      rows={2}
                      disabled={isReadOnly}
                      value={trap.misconception}
                      onChange={(e) => updateField(`cognitiveTraps.${idx}.misconception`, e.target.value)}
                      placeholder="Describe what candidates mistakenly assume..."
                      className="w-full rounded-lg border border-rose-200 bg-white p-2 text-xs text-rose-950 focus:outline-hidden shadow-2xs"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-emerald-900 mb-1 block">The Correct Authoritative Approach</label>
                    <textarea
                      rows={2}
                      disabled={isReadOnly}
                      value={trap.correctApproach}
                      onChange={(e) => updateField(`cognitiveTraps.${idx}.correctApproach`, e.target.value)}
                      placeholder="Explain the fail-safe method to avoid this trap..."
                      className="w-full rounded-lg border border-emerald-200 bg-white p-2 text-xs text-emerald-950 focus:outline-hidden shadow-2xs"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 5: PYQS & QUICK CHECKS */}
        {/* ============================================================ */}
        {activeEditorTab === "PYQS_CHECKS" && (
          <div className="space-y-6">
            {/* PYQ References */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Authentic Question Bank References</h3>
                  <p className="text-[11px] text-slate-500">Link verified canonical PYQs from the repository.</p>
                </div>
                {!isReadOnly && (
                  <button
                    type="button"
                    onClick={() => onOpenQuestionModal("authenticPyqReferences")}
                    className="flex items-center gap-1 rounded-lg bg-blue-700 px-3 py-1.5 font-bold text-white hover:bg-blue-800 transition shadow-2xs"
                  >
                    <Search className="h-3.5 w-3.5" /> Search Question Bank
                  </button>
                )}
              </div>

              {(!spec.authenticPyqReferences || spec.authenticPyqReferences.length === 0) && (
                <div className="p-6 text-center text-slate-400 bg-white rounded-xl border border-dashed border-slate-300">
                  No canonical PYQ references linked yet.
                </div>
              )}

              {spec.authenticPyqReferences?.map((pyq, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between rounded-xl border border-blue-200 bg-blue-50/40 p-3.5 shadow-2xs"
                >
                  <div className="space-y-1 flex-1 pr-3">
                    <span className="font-mono font-bold text-blue-900 text-xs">
                      {pyq.questionVersionId}
                    </span>
                    <input
                      type="text"
                      disabled={isReadOnly}
                      value={pyq.relevanceRationale}
                      onChange={(e) => updateField(`authenticPyqReferences.${idx}.relevanceRationale`, e.target.value)}
                      placeholder="Why is this question relevant to this concept?"
                      className="w-full rounded border border-blue-200 bg-white p-1 text-xs text-slate-800 focus:outline-hidden"
                    />
                  </div>
                  {!isReadOnly && (
                    <button
                      type="button"
                      onClick={() => {
                        const newSpec = JSON.parse(JSON.stringify(spec));
                        newSpec.authenticPyqReferences.splice(idx, 1);
                        onChange(newSpec);
                      }}
                      className="text-slate-400 hover:text-rose-600 p-1 shrink-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Quick Checks */}
            <div className="space-y-3 pt-4 border-t border-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Interactive Quick Checks</h3>
                  <p className="text-[11px] text-slate-500">In-line multiple-choice concept checks with explanations.</p>
                </div>
                {!isReadOnly && (
                  <button
                    type="button"
                    onClick={addQuickCheck}
                    className="flex items-center gap-1 rounded-lg bg-indigo-700 px-3 py-1.5 font-bold text-white hover:bg-indigo-800 transition shadow-2xs"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Quick Check
                  </button>
                )}
              </div>

              {(!spec.quickChecks || spec.quickChecks.length === 0) && (
                <div className="p-6 text-center text-slate-400 bg-white rounded-xl border border-dashed border-slate-300">
                  No quick checks created.
                </div>
              )}

              {spec.quickChecks?.map((qc, idx) => (
                <div
                  key={qc.id || idx}
                  className="rounded-xl border border-indigo-200 bg-indigo-50/30 p-4 shadow-2xs space-y-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-bold text-indigo-950 text-xs">Quick Check #{idx + 1}</span>
                    {!isReadOnly && (
                      <button
                        type="button"
                        onClick={() => removeQuickCheck(idx)}
                        className="text-slate-400 hover:text-rose-600 p-1"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  <input
                    type="text"
                    disabled={isReadOnly}
                    value={qc.prompt}
                    onChange={(e) => updateField(`quickChecks.${idx}.prompt`, e.target.value)}
                    placeholder="Enter diagnostic question prompt..."
                    className="w-full rounded-lg border border-indigo-200 bg-white p-2 text-xs font-semibold text-slate-900 focus:outline-hidden shadow-2xs"
                  />

                  {/* Options */}
                  <div className="space-y-2">
                    {qc.options?.map((opt, oIdx) => (
                      <div key={opt.id || oIdx} className="rounded-lg bg-white border border-indigo-100 p-2 space-y-1">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            disabled={isReadOnly}
                            checked={opt.isCorrect}
                            onChange={(e) => updateField(`quickChecks.${idx}.options.${oIdx}.isCorrect`, e.target.checked)}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                          <input
                            type="text"
                            disabled={isReadOnly}
                            value={opt.text}
                            onChange={(e) => updateField(`quickChecks.${idx}.options.${oIdx}.text`, e.target.value)}
                            placeholder={`Option ${String.fromCharCode(65 + oIdx)} text`}
                            className="w-full rounded border border-slate-200 p-1 text-xs text-slate-900 focus:outline-hidden"
                          />
                        </div>
                        <input
                          type="text"
                          disabled={isReadOnly}
                          value={opt.feedbackExplanation || ""}
                          onChange={(e) => updateField(`quickChecks.${idx}.options.${oIdx}.feedbackExplanation`, e.target.value)}
                          placeholder="Feedback explanation for this choice..."
                          className="w-full rounded border border-slate-100 bg-slate-50 p-1 text-[11px] text-slate-600 focus:outline-hidden"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 6: REVISION SUMMARY & SPEED RULES */}
        {/* ============================================================ */}
        {activeEditorTab === "SUMMARY" && (
          <div className="space-y-4">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Revision Summary & Last-Mile Speed Rules</h3>
              <p className="text-[11px] text-slate-500">Key takeaways, core formula recaps, and lightning speed rules.</p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-4">
              <div>
                <label className="text-[11px] font-semibold text-slate-700 mb-1 block">Key Takeaways (one per line)</label>
                <textarea
                  rows={4}
                  disabled={isReadOnly}
                  value={spec.revisionSummary?.keyTakeaways?.join("\n") || ""}
                  onChange={(e) => updateField("revisionSummary.keyTakeaways", e.target.value.split("\n").filter(Boolean))}
                  placeholder="Key takeaway 1&#10;Key takeaway 2&#10;Key takeaway 3"
                  className="w-full rounded-lg border border-slate-200 bg-slate-50/50 p-2.5 text-xs text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-hidden shadow-2xs leading-relaxed"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-700 mb-1 block">Core Formulas Recap (one per line)</label>
                <textarea
                  rows={3}
                  disabled={isReadOnly}
                  value={spec.revisionSummary?.coreFormulas?.join("\n") || ""}
                  onChange={(e) => updateField("revisionSummary.coreFormulas", e.target.value.split("\n").filter(Boolean))}
                  placeholder="Formula 1 LaTeX&#10;Formula 2 LaTeX"
                  className="w-full rounded-lg border border-slate-200 bg-slate-50/50 p-2.5 font-mono text-xs text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-hidden shadow-2xs leading-relaxed"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-700 mb-1 block">Speed Rules & Mental Shortcuts (one per line)</label>
                <textarea
                  rows={3}
                  disabled={isReadOnly}
                  value={spec.revisionSummary?.speedRules?.join("\n") || ""}
                  onChange={(e) => updateField("revisionSummary.speedRules", e.target.value.split("\n").filter(Boolean))}
                  placeholder="Speed rule 1&#10;Speed rule 2"
                  className="w-full rounded-lg border border-slate-200 bg-slate-50/50 p-2.5 text-xs text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-hidden shadow-2xs leading-relaxed"
                />
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 7: METADATA, OBJECTIVES & SEO */}
        {/* ============================================================ */}
        {activeEditorTab === "META" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-4">
              <h3 className="font-bold text-slate-900 text-sm">Document Metadata</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Document Title</label>
                  <input
                    type="text"
                    disabled={isReadOnly}
                    value={spec.metadata?.title || ""}
                    onChange={(e) => updateField("metadata.title", e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50/50 p-2 text-xs text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-hidden shadow-2xs"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Difficulty Tier</label>
                  <select
                    disabled={isReadOnly}
                    value={spec.metadata?.difficultyTier || "BEGINNER"}
                    onChange={(e) => updateField("metadata.difficultyTier", e.target.value as DifficultyTier)}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50/50 p-2 text-xs text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-hidden shadow-2xs font-medium"
                  >
                    <option value="BEGINNER">Beginner</option>
                    <option value="INTERMEDIATE">Intermediate</option>
                    <option value="ADVANCED">Advanced</option>
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Estimated Reading Minutes</label>
                  <input
                    type="number"
                    disabled={isReadOnly}
                    value={spec.metadata?.estimatedReadingMinutes || 8}
                    onChange={(e) => updateField("metadata.estimatedReadingMinutes", parseInt(e.target.value) || 5)}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50/50 p-2 text-xs text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-hidden shadow-2xs"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Target Exam Categories</label>
                  <input
                    type="text"
                    disabled={isReadOnly}
                    value={spec.metadata?.targetExamCategories?.join(", ") || ""}
                    onChange={(e) => updateField("metadata.targetExamCategories", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
                    placeholder="e.g. SSC_CGL, SSC_CHSL, RAILWAYS_NTPC"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50/50 p-2 text-xs text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-hidden shadow-2xs"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Learning Objectives (one per line)</label>
                <textarea
                  rows={3}
                  disabled={isReadOnly}
                  value={spec.learningObjectives?.join("\n") || ""}
                  onChange={(e) => updateField("learningObjectives", e.target.value.split("\n").filter(Boolean))}
                  placeholder="Master core principles&#10;Solve exam-level problems&#10;Identify negative traps"
                  className="w-full rounded-lg border border-slate-200 bg-slate-50/50 p-2 text-xs text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-hidden shadow-2xs"
                />
              </div>
            </div>

            {/* SEO Section */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
              <h3 className="font-bold text-slate-900 text-sm">Search Engine Optimization (SEO)</h3>
              <div className="space-y-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Meta Title</label>
                  <input
                    type="text"
                    disabled={isReadOnly}
                    value={spec.seo?.metaTitle || ""}
                    onChange={(e) => updateField("seo.metaTitle", e.target.value)}
                    placeholder="Complete Guide to [Topic] | Courage Library"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50/50 p-2 text-xs text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-hidden shadow-2xs"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Meta Description</label>
                  <textarea
                    rows={2}
                    disabled={isReadOnly}
                    value={spec.seo?.metaDescription || ""}
                    onChange={(e) => updateField("seo.metaDescription", e.target.value)}
                    placeholder="Comprehensive conceptual notes, shortcuts, and authentic PYQs..."
                    className="w-full rounded-lg border border-slate-200 bg-slate-50/50 p-2 text-xs text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-hidden shadow-2xs"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Focus Keywords (comma-separated)</label>
                  <input
                    type="text"
                    disabled={isReadOnly}
                    value={spec.seo?.focusKeywords?.join(", ") || ""}
                    onChange={(e) => updateField("seo.focusKeywords", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
                    placeholder="ssc cgl maths, profit and loss shortcuts, formulas"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50/50 p-2 text-xs text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-hidden shadow-2xs"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
