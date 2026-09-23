"use client";

import React from "react";
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

  return (
    <div className="space-y-6 p-4 text-xs">
      {/* 1. Metadata Block */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
        <h3 className="font-bold text-slate-900 text-sm">Document Metadata</h3>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="font-semibold text-slate-700">Document Title</label>
            <input
              type="text"
              disabled={isReadOnly}
              value={spec.metadata.title}
              onChange={(e) => updateField("metadata.title", e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50/50 p-2 text-xs text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-600 shadow-2xs"
            />
          </div>
          <div>
            <label className="font-semibold text-slate-700">Difficulty Tier</label>
            <select
              disabled={isReadOnly}
              value={spec.metadata.difficultyTier}
              onChange={(e) => updateField("metadata.difficultyTier", e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50/50 p-2 text-xs text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-600 shadow-2xs font-medium"
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
          <h3 className="font-bold text-slate-900 text-sm">Structured Theory Sections</h3>
          {!isReadOnly && (
            <button
              type="button"
              onClick={addSection}
              className="flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1.5 font-bold text-blue-700 hover:bg-blue-100 transition border border-blue-200/60 shadow-2xs"
            >
              <Plus className="h-3.5 w-3.5" /> Add Section
            </button>
          )}
        </div>

        {spec.sections.map((sec, idx) => (
          <div
            key={sec.id || idx}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3"
          >
            <div className="flex items-center justify-between gap-2">
              <input
                type="text"
                disabled={isReadOnly}
                value={sec.title}
                onChange={(e) => updateField(`sections.${idx}.title`, e.target.value)}
                placeholder="Section Title"
                className="font-bold text-slate-900 text-sm bg-transparent border-b border-slate-200 py-1 focus:border-blue-600 focus:outline-hidden w-full"
              />
              {!isReadOnly && (
                <button
                  type="button"
                  onClick={() => removeSection(idx)}
                  className="text-slate-400 hover:text-rose-600 p-1"
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
              className="w-full rounded-lg border border-slate-200 bg-slate-50/50 p-2.5 font-mono text-xs text-slate-800 focus:border-blue-600 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-600 shadow-2xs leading-relaxed"
            />

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={isReadOnly}
                onClick={() => onOpenAssetModal(`sections.${idx}.diagramAssetId`)}
                className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-1 text-slate-700 hover:bg-slate-100 transition font-medium shadow-2xs"
              >
                <Image className="h-3.5 w-3.5 text-blue-700" />
                <span>{sec.diagramAssetId ? `Asset: ${sec.diagramAssetId}` : "Attach Diagram Asset"}</span>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* 3. Formulas */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-blue-700 font-bold">
            <Sigma className="h-4 w-4" />
            <span>Formula Cards</span>
          </div>
          {!isReadOnly && (
            <button
              type="button"
              onClick={addFormula}
              className="flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1.5 font-bold text-blue-700 hover:bg-blue-100 transition border border-blue-200/60 shadow-2xs"
            >
              <Plus className="h-3.5 w-3.5" /> Add Formula
            </button>
          )}
        </div>

        {(spec.formulaBlocks || []).map((fb, idx) => (
          <div
            key={fb.id || idx}
            className="rounded-xl border border-blue-200 bg-blue-50/40 p-3.5 shadow-2xs"
          >
            <input
              type="text"
              disabled={isReadOnly}
              value={fb.name}
              onChange={(e) => updateField(`formulaBlocks.${idx}.name`, e.target.value)}
              placeholder="Formula Name"
              className="w-full font-bold text-xs text-blue-900 border-b border-blue-200/60 bg-transparent py-1 focus:border-blue-600 focus:outline-hidden"
            />
            <input
              type="text"
              disabled={isReadOnly}
              value={fb.latexFormula}
              onChange={(e) => updateField(`formulaBlocks.${idx}.latexFormula`, e.target.value)}
              placeholder="LaTeX Formula: e.g. P = \frac{A}{B} \times 100"
              className="mt-2 w-full rounded-lg border border-blue-200 bg-white p-2 font-mono text-xs text-slate-800 focus:border-blue-600 focus:outline-hidden shadow-2xs"
            />
          </div>
        ))}
      </div>

      {/* 4. PYQ References */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-blue-700 font-bold">
            <HelpCircle className="h-4 w-4" />
            <span>Authentic Question Bank References</span>
          </div>
          {!isReadOnly && (
            <button
              type="button"
              onClick={() => onOpenQuestionModal("authenticPyqReferences")}
              className="flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1.5 font-bold text-blue-700 hover:bg-blue-100 transition border border-blue-200/60 shadow-2xs"
            >
              <Plus className="h-3.5 w-3.5" /> Search Question Bank
            </button>
          )}
        </div>

        {(spec.authenticPyqReferences || []).map((pyq, idx) => (
          <div
            key={idx}
            className="flex items-center justify-between rounded-xl border border-blue-200 bg-blue-50/40 p-3.5 shadow-2xs"
          >
            <div>
              <span className="font-mono font-bold text-blue-900">
                {pyq.questionVersionId}
              </span>
              <p className="text-slate-600 text-[11px] mt-0.5">{pyq.relevanceRationale}</p>
            </div>
            {!isReadOnly && (
              <button
                type="button"
                onClick={() => {
                  const newSpec = JSON.parse(JSON.stringify(spec));
                  newSpec.authenticPyqReferences.splice(idx, 1);
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
    </div>
  );
};
