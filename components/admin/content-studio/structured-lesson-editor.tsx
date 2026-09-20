"use client";

import React, { useState } from "react";
import { LessonDocumentSpec, SectionType, DifficultyTier } from "@/types/learning-compiler";
import {
  Plus,
  Trash2,
  Sigma,
  Lightbulb,
  AlertOctagon,
  HelpCircle,
  Bookmark,
  CheckCircle2,
  Image,
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
  const updateField = (path: string, val: any) => {
    if (isReadOnly) return;
    const newSpec = JSON.parse(JSON.stringify(spec));
    const parts = path.split(".");
    let curr = newSpec;
    for (let i = 0; i < parts.length - 1; i++) {
      curr = curr[parts[i]];
    }
    curr[parts[parts.length - 1]] = val;
    onChange(newSpec);
  };

  const addSection = () => {
    if (isReadOnly) return;
    const newSpec = JSON.parse(JSON.stringify(spec));
    const newSecId = `sec-${Date.now()}`;
    newSpec.sections.push({
      id: newSecId,
      title: "New Section",
      sectionType: "THEORY" as SectionType,
      contentMarkdown: "Enter educational theory here...",
    });
    onChange(newSpec);
  };

  const removeSection = (idx: number) => {
    if (isReadOnly) return;
    const newSpec = JSON.parse(JSON.stringify(spec));
    newSpec.sections.splice(idx, 1);
    onChange(newSpec);
  };

  const addFormula = () => {
    if (isReadOnly) return;
    const newSpec = JSON.parse(JSON.stringify(spec));
    if (!newSpec.formulaBlocks) newSpec.formulaBlocks = [];
    newSpec.formulaBlocks.push({
      id: `form-${Date.now()}`,
      name: "New Formula",
      latexFormula: "E = mc^2",
      variableDefinitions: [],
      applicableConditions: [],
    });
    onChange(newSpec);
  };

  const addExample = () => {
    if (isReadOnly) return;
    const newSpec = JSON.parse(JSON.stringify(spec));
    if (!newSpec.workedExamples) newSpec.workedExamples = [];
    newSpec.workedExamples.push({
      id: `ex-${Date.now()}`,
      difficulty: "MEDIUM" as DifficultyTier,
      problemText: "State the problem statement here...",
      stepByStepSolution: [
        { stepNumber: 1, explanation: "First step explanation." }
      ],
    });
    onChange(newSpec);
  };

  const addTrap = () => {
    if (isReadOnly) return;
    const newSpec = JSON.parse(JSON.stringify(spec));
    if (!newSpec.cognitiveTraps) newSpec.cognitiveTraps = [];
    newSpec.cognitiveTraps.push({
      trapType: "CALCULATION_SLIP",
      misconception: "Common calculation or conceptual mistake.",
      correctApproach: "Step-by-step remedy to avoid this trap.",
    });
    onChange(newSpec);
  };

  const addQuickCheck = () => {
    if (isReadOnly) return;
    const newSpec = JSON.parse(JSON.stringify(spec));
    if (!newSpec.quickChecks) newSpec.quickChecks = [];
    newSpec.quickChecks.push({
      id: `qc-${Date.now()}`,
      prompt: "Quick concept question?",
      options: [
        { id: `opt-1`, text: "Option A", isCorrect: true, feedbackExplanation: "Correct explanation." },
        { id: `opt-2`, text: "Option B", isCorrect: false, feedbackExplanation: "Incorrect." }
      ],
    });
    onChange(newSpec);
  };

  return (
    <div className="space-y-6 p-4 text-xs">
      {/* 1. Metadata Block */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
        <h3 className="font-bold text-slate-900 text-sm dark:text-slate-100">Document Metadata</h3>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="font-medium text-slate-700 dark:text-slate-300">Document Title</label>
            <input
              type="text"
              disabled={isReadOnly}
              value={spec.metadata.title}
              onChange={(e) => updateField("metadata.title", e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
          <div>
            <label className="font-medium text-slate-700 dark:text-slate-300">Difficulty Tier</label>
            <select
              disabled={isReadOnly}
              value={spec.metadata.difficultyTier}
              onChange={(e) => updateField("metadata.difficultyTier", e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="BEGINNER">Beginner</option>
              <option value="INTERMEDIATE">Intermediate</option>
              <option value="ADVANCED">Advanced</option>
            </select>
          </div>
        </div>
      </div>

      {/* 2. Structured Sections */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-900 text-sm dark:text-slate-100">Structured Theory Sections</h3>
          {!isReadOnly && (
            <button
              type="button"
              onClick={addSection}
              className="flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-1 font-semibold text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950 dark:text-indigo-300"
            >
              <Plus className="h-3.5 w-3.5" /> Add Section
            </button>
          )}
        </div>

        {spec.sections.map((sec, idx) => (
          <div
            key={sec.id || idx}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between gap-2">
              <input
                type="text"
                disabled={isReadOnly}
                value={sec.title}
                onChange={(e) => updateField(`sections.${idx}.title`, e.target.value)}
                placeholder="Section Title"
                className="font-bold text-slate-900 text-sm bg-transparent border-b border-transparent focus:border-indigo-500 focus:outline-hidden dark:text-slate-100"
              />
              {!isReadOnly && (
                <button
                  type="button"
                  onClick={() => removeSection(idx)}
                  className="text-slate-400 hover:text-rose-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>

            <textarea
              rows={4}
              disabled={isReadOnly}
              value={sec.contentMarkdown}
              onChange={(e) => updateField(`sections.${idx}.contentMarkdown`, e.target.value)}
              placeholder="Enter markdown content..."
              className="mt-3 w-full rounded-lg border border-slate-200 p-2 font-mono text-xs text-slate-800 focus:border-indigo-500 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            />

            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                disabled={isReadOnly}
                onClick={() => onOpenAssetModal(`sections.${idx}.diagramAssetId`)}
                className="flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
              >
                <Image className="h-3 w-3 text-indigo-500" />
                <span>{sec.diagramAssetId ? `Asset: ${sec.diagramAssetId}` : "Attach Diagram Asset"}</span>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* 3. Formulas */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-blue-700 font-bold dark:text-blue-400">
            <Sigma className="h-4 w-4" />
            <span>Formula Cards</span>
          </div>
          {!isReadOnly && (
            <button
              type="button"
              onClick={addFormula}
              className="flex items-center gap-1 rounded-md bg-blue-50 px-2 py-1 font-semibold text-blue-700 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300"
            >
              <Plus className="h-3.5 w-3.5" /> Add Formula
            </button>
          )}
        </div>

        {(spec.formulaBlocks || []).map((fb, idx) => (
          <div
            key={fb.id || idx}
            className="rounded-xl border border-blue-200 bg-blue-50/30 p-3 dark:border-blue-900/40 dark:bg-blue-950/20"
          >
            <input
              type="text"
              disabled={isReadOnly}
              value={fb.name}
              onChange={(e) => updateField(`formulaBlocks.${idx}.name`, e.target.value)}
              placeholder="Formula Name"
              className="w-full font-semibold text-xs border-b border-transparent bg-transparent focus:border-blue-500 focus:outline-hidden"
            />
            <input
              type="text"
              disabled={isReadOnly}
              value={fb.latexFormula}
              onChange={(e) => updateField(`formulaBlocks.${idx}.latexFormula`, e.target.value)}
              placeholder="LaTeX Formula: e.g. P = \frac{A}{B} 	imes 100"
              className="mt-2 w-full rounded border border-blue-200 bg-white p-1.5 font-mono text-xs dark:border-blue-800 dark:bg-slate-900"
            />
          </div>
        ))}
      </div>

      {/* 4. PYQ References */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-indigo-700 font-bold dark:text-indigo-400">
            <HelpCircle className="h-4 w-4" />
            <span>Authentic Question Bank References</span>
          </div>
          {!isReadOnly && (
            <button
              type="button"
              onClick={() => onOpenQuestionModal("authenticPyqReferences")}
              className="flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-1 font-semibold text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950 dark:text-indigo-300"
            >
              <Plus className="h-3.5 w-3.5" /> Search Question Bank
            </button>
          )}
        </div>

        {(spec.authenticPyqReferences || []).map((pyq, idx) => (
          <div
            key={idx}
            className="flex items-center justify-between rounded-xl border border-indigo-200 bg-indigo-50/30 p-3 dark:border-indigo-900/40 dark:bg-indigo-950/20"
          >
            <div>
              <span className="font-mono font-bold text-indigo-900 dark:text-indigo-200">
                {pyq.questionVersionId}
              </span>
              <p className="text-slate-600 text-[11px] dark:text-slate-400">{pyq.relevanceRationale}</p>
            </div>
            {!isReadOnly && (
              <button
                type="button"
                onClick={() => {
                  const newSpec = JSON.parse(JSON.stringify(spec));
                  newSpec.authenticPyqReferences.splice(idx, 1);
                  onChange(newSpec);
                }}
                className="text-slate-400 hover:text-rose-600"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
