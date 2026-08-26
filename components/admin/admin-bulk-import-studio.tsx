"use client";

import React, { useState } from "react";
import { executeBulkImportAction } from "@/app/admin/actions";
import { BulkImportResult } from "@/lib/admin/bulk-importer";
import { AdminBreadcrumbs } from "@/components/admin/admin-breadcrumbs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import {
  FileUp,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Layers,
  ArrowRight,
  RefreshCw,
  Code2,
} from "lucide-react";

interface Props {
  categories: Array<{ id: string; title: string; slug: string }>;
  patterns: Array<{ id: string; name: string }>;
  subjects: Array<{ id: string; name: string; slug: string }>;
}

const SAMPLE_TEMPLATES: Record<string, string> = {
  categories: JSON.stringify(
    [
      {
        title: "SSC GD (General Duty)",
        slug: "ssc-gd",
        category: "Staff Selection Commission (SSC)",
        description: "Constable GD in Central Armed Police Forces (CAPFs), SSF, and Rifleman.",
      },
    ],
    null,
    2
  ),
  patterns: JSON.stringify(
    [
      {
        category: "ssc-gd",
        name: "SSC GD - Mixed Sectional",
        tier_name: "Tier 1 (CBE)",
        duration_minutes: 60,
        total_questions: 80,
        total_marks: 160,
        negative_marking: 0.5,
      },
    ],
    null,
    2
  ),
  sections: JSON.stringify(
    [
      {
        name: "General Awareness",
        slug: "general-awareness",
      },
      {
        name: "Elementary Mathematics",
        slug: "elementary-mathematics",
      },
    ],
    null,
    2
  ),
  questions: JSON.stringify(
    [
      {
        category: "ssc-gd",
        section: "General Awareness",
        topic: "Indian Polity",
        question: "Which Article of the Constitution of India deals with the 'Right to Equality'?",
        options: {
          A: "Article 14-18",
          B: "Article 19-22",
          C: "Article 23-24",
          D: "Article 25-28",
        },
        correct_answer: "A",
        explanation: "Articles 14 to 18 of the Indian Constitution guarantee the fundamental Right to Equality.",
        difficulty: "medium",
        pyq_year: 2024,
        pyq_exam: "SSC GD",
      },
    ],
    null,
    2
  ),
  mock_tests: JSON.stringify(
    [
      {
        category: "ssc-gd",
        pattern: "SSC GD - Mixed Sectional",
        title: "SSC GD 2026 Full Length Mock Test 01",
        slug: "ssc-gd-2026-full-mock-01",
        duration_minutes: 60,
        total_questions: 80,
        total_marks: 160,
      },
    ],
    null,
    2
  ),
};

export function AdminBulkImportStudio({}: Props) {
  const [selectedEntity, setSelectedEntity] = useState<string>("questions");
  const [jsonText, setJsonText] = useState<string>(SAMPLE_TEMPLATES["questions"]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [previewResult, setPreviewResult] = useState<BulkImportResult | null>(null);
  const [commitResult, setCommitResult] = useState<BulkImportResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const handleEntityChange = (entity: string) => {
    setSelectedEntity(entity);
    setJsonText(SAMPLE_TEMPLATES[entity] || "[]");
    setPreviewResult(null);
    setCommitResult(null);
    setParseError(null);
  };

  const handlePreview = async () => {
    setParseError(null);
    setCommitResult(null);

    let parsedData: Array<Record<string, unknown>> = [];
    try {
      parsedData = JSON.parse(jsonText);
      if (!Array.isArray(parsedData)) {
        setParseError("Input JSON must be an array of objects [ { ... } ].");
        return;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Invalid JSON";
      setParseError(`JSON Syntax Error: ${msg}`);
      return;
    }

    setIsProcessing(true);
    try {
      const res = await executeBulkImportAction({ entity: selectedEntity, data: parsedData, mode: "preview" });
      setPreviewResult(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Preview error";
      setParseError(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCommit = async () => {
    if (!previewResult) return;

    let parsedData: Array<Record<string, unknown>> = [];
    try {
      parsedData = JSON.parse(jsonText);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Invalid JSON";
      setParseError(`JSON Syntax Error: ${msg}`);
      return;
    }

    setIsProcessing(true);
    try {
      const res = await executeBulkImportAction({ entity: selectedEntity, data: parsedData, mode: "commit" });
      setCommitResult(res);
      setPreviewResult(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Commit error";
      setParseError(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl pb-12">
      {/* Breadcrumbs */}
      <AdminBreadcrumbs items={[{ label: "Tools", href: "/admin" }, { label: "Hierarchical Bulk Import", active: true }]} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <FileUp className="w-6 h-6 text-indigo-600" /> Hierarchical Content Import Studio
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Two-stage validated importer maintaining strict Category &rarr; Pattern &rarr; Section &rarr; Question relationships.
          </p>
        </div>
      </div>

      {/* Feedback Alerts */}
      {parseError && <Alert variant="error">{parseError}</Alert>}
      {commitResult && (
        <Alert variant={commitResult.success ? "success" : "error"}>
          <div className="space-y-1">
            <span className="font-bold">
              {commitResult.success ? "✓ Bulk Import Committed Successfully!" : "Import Completed with Issues"}
            </span>
            <div className="text-xs font-mono">
              Total Records: {commitResult.totalRecords} | Created: +{commitResult.created} | Updated: ~{commitResult.updated} | Skipped: {commitResult.skipped}
            </div>
            {commitResult.errors?.length > 0 && (
              <div className="text-xs text-rose-700 mt-1">
                Errors: {commitResult.errors.join(", ")}
              </div>
            )}
          </div>
        </Alert>
      )}

      {/* Entity Selector */}
      <Card className="p-4 bg-white border-slate-200 space-y-3">
        <span className="text-xs font-bold text-slate-700 block uppercase font-mono">
          1. Select Import Entity Type
        </span>
        <div className="flex flex-wrap gap-2">
          {[
            { id: "categories", label: "Categories (Exams)" },
            { id: "patterns", label: "Patterns (Blueprints)" },
            { id: "sections", label: "Sections (Subjects)" },
            { id: "questions", label: "Questions (Hierarchy + PYQ)" },
            { id: "mock_tests", label: "Mock Tests" },
          ].map((ent) => (
            <button
              key={ent.id}
              onClick={() => handleEntityChange(ent.id)}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                selectedEntity === ent.id
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              <Layers className="w-3.5 h-3.5" /> {ent.label}
            </button>
          ))}
        </div>
      </Card>

      {/* Editor & Payload Input */}
      <Card className="p-5 bg-white border-slate-200 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-700 uppercase font-mono flex items-center gap-1.5">
            <Code2 className="w-4 h-4 text-slate-500" /> 2. Payload JSON Array
          </span>
          <button
            onClick={() => setJsonText(SAMPLE_TEMPLATES[selectedEntity] || "[]")}
            className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800"
          >
            Reset to Sample Template
          </button>
        </div>

        <textarea
          rows={14}
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
          className="w-full p-4 rounded-xl border border-slate-200 bg-slate-900 text-emerald-400 font-mono text-xs focus:outline-hidden focus:border-indigo-500 shadow-inner"
          placeholder="Paste JSON array here..."
        />

        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="default"
            size="sm"
            onClick={handlePreview}
            disabled={isProcessing || !jsonText.trim()}
            className="font-bold bg-indigo-600 hover:bg-indigo-700"
          >
            {isProcessing ? <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1.5" />}
            Validate &amp; Generate Preview
          </Button>
        </div>
      </Card>

      {/* Stage 1 Preview Card */}
      {previewResult && (
        <Card className="p-6 bg-slate-50 border-indigo-200 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" /> Stage 1: Validation &amp; Change Preview
            </h3>
            <Badge variant="indigo" className="font-mono text-xs">
              0 Mutations in Preview Mode
            </Badge>
          </div>

          {/* Diffs Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="p-3 bg-white rounded-xl border border-slate-200 text-center font-mono">
              <span className="text-[10px] text-slate-500 font-bold block uppercase">Total Records</span>
              <span className="text-xl font-black text-slate-900">{previewResult.totalRecords}</span>
            </div>
            <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-200 text-center font-mono">
              <span className="text-[10px] text-emerald-700 font-bold block uppercase">Will Create</span>
              <span className="text-xl font-black text-emerald-900">+{previewResult.created}</span>
            </div>
            <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-200 text-center font-mono">
              <span className="text-[10px] text-blue-700 font-bold block uppercase">Will Update</span>
              <span className="text-xl font-black text-blue-900">~{previewResult.updated}</span>
            </div>
            <div className="p-3 bg-slate-100 rounded-xl border border-slate-200 text-center font-mono">
              <span className="text-[10px] text-slate-600 font-bold block uppercase">Will Skip</span>
              <span className="text-xl font-black text-slate-700">{previewResult.skipped}</span>
            </div>
            <div className={`p-3 rounded-xl border text-center font-mono ${previewResult.brokenReferencesCount > 0 ? "bg-rose-50 border-rose-200" : "bg-white border-slate-200"}`}>
              <span className="text-[10px] text-rose-700 font-bold block uppercase">Broken Parent Refs</span>
              <span className="text-xl font-black text-rose-900">{previewResult.brokenReferencesCount}</span>
            </div>
          </div>

          {/* Warnings list */}
          {previewResult.warnings?.length > 0 && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1">
              <span className="font-bold flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> Hierarchy Warnings:
              </span>
              <ul className="list-disc pl-5 font-mono text-[11px] space-y-0.5">
                {previewResult.warnings.map((w: string, i: number) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Preview Snippet */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 overflow-x-auto max-h-60">
            <span className="text-[11px] font-mono text-slate-400 block mb-2">Sample Parsed Data Preview:</span>
            <pre className="text-xs font-mono text-slate-700">
              {JSON.stringify(previewResult.previewData?.slice(0, 5), null, 2)}
            </pre>
          </div>

          {/* Commit Action */}
          <div className="pt-2 flex items-center justify-between border-t border-slate-200">
            <span className="text-xs text-slate-500 font-medium">
              Review above metrics. Clicking commit will write validated records with 1:1 foreign keys.
            </span>
            <Button
              variant="default"
              size="sm"
              onClick={handleCommit}
              disabled={isProcessing}
              className="font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {isProcessing ? <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" /> : <ArrowRight className="w-4 h-4 mr-1.5" />}
              Confirm &amp; Commit Import ({previewResult.totalRecords} Records)
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
