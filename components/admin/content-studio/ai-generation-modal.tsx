"use client";

import React, { useState } from "react";
import {
  Sparkles,
  X,
  AlertCircle,
  CheckCircle2,
  Cpu,
  Layers,
  FileText,
  Sliders,
  Lock,
  Copy,
  Check,
  ArrowRight,
  ShieldCheck,
  FileCode,
  DownloadCloud,
} from "lucide-react";
import { DocumentType } from "@/types/learning-compiler";
import {
  generateLessonWithAIAction,
  generateExternalAiPromptAction,
  validateExternalAiContentAction,
  importExternalAiContentAction,
} from "@/app/admin/content/actions";
import { ExternalAIPromptResult, CategorizedValidationResult, ExternalAITool } from "@/types/external-ai";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  learningUnitId: string;
  unitTitle: string;
  onGenerated: (result: any) => void;
}

export function AIGenerationModal({
  isOpen,
  onClose,
  learningUnitId,
  unitTitle,
  onGenerated,
}: Props) {
  const [activeTab, setActiveTab] = useState<"PROMPT" | "IMPORT" | "API">("PROMPT");

  // Common options
  const [documentType, setDocumentType] = useState<DocumentType>("CONCEPT_LESSON");
  const [targetExamId, setTargetExamId] = useState<string>("exam-ssc-cgl");
  const [includeFormulas, setIncludeFormulas] = useState(true);
  const [includeWorkedExamples, setIncludeWorkedExamples] = useState(true);
  const [includeTraps, setIncludeTraps] = useState(true);
  const [quickCheckCount, setQuickCheckCount] = useState(2);
  const [customInstructions, setCustomInstructions] = useState("");

  // Tab 1: Prompt Generation State
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  const [promptResult, setPromptResult] = useState<ExternalAIPromptResult | null>(null);
  const [hasCopied, setHasCopied] = useState(false);

  // Tab 2: Import Output State
  const [rawPastedOutput, setRawPastedOutput] = useState("");
  const [aiToolUsed, setAiToolUsed] = useState<ExternalAITool>("ChatGPT");
  const [isValidating, setIsValidating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [validationResult, setValidationResult] = useState<CategorizedValidationResult | null>(null);

  // Tab 3: Direct API State
  const [providerId, setProviderId] = useState<"MOCK" | "GOOGLE_GEMINI">("MOCK");
  const [isDirectGenerating, setIsDirectGenerating] = useState(false);

  // General error state
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  // Handler: Generate Detailed External AI Prompt
  const handleGeneratePrompt = async () => {
    setIsGeneratingPrompt(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await generateExternalAiPromptAction({
        learningUnitId,
        documentType,
        targetExamId,
        directives: {
          includeFormulas,
          includeWorkedExamples,
          includeTraps,
          quickCheckCount,
          customInstructions: customInstructions.trim() || undefined,
        },
      });

      if (!res.success || !res.promptResult) {
        setError(res.error || "Failed to generate curriculum prompt.");
        return;
      }

      setPromptResult(res.promptResult);
      setSuccessMsg('Curriculum-aware prompt generated successfully. Click "Copy Prompt" and paste into your external AI tool.');
    } catch (err: any) {
      setError(err.message || "Error generating prompt.");
    } finally {
      setIsGeneratingPrompt(false);
    }
  };

  // Handler: Copy Prompt to Clipboard
  const handleCopyPrompt = async () => {
    if (!promptResult?.promptText) return;
    try {
      await navigator.clipboard.writeText(promptResult.promptText);
      setHasCopied(true);
      setTimeout(() => setHasCopied(false), 3000);
    } catch (err) {
      setError("Failed to copy to clipboard. Please manually select and copy the text.");
    }
  };

  // Handler: Validate Pasted AI JSON
  const handleValidatePastedOutput = async () => {
    if (!rawPastedOutput.trim()) {
      setError("Please paste AI output before validating.");
      return;
    }
    setIsValidating(true);
    setError(null);
    try {
      const res = await validateExternalAiContentAction({
        rawInput: rawPastedOutput,
        learningUnitId,
        documentType,
        targetExamId,
      });

      if (!res.success || !res.validation) {
        setError(res.error || "Validation execution failed.");
        return;
      }

      setValidationResult(res.validation);
    } catch (err: any) {
      setError(err.message || "Error during validation.");
    } finally {
      setIsValidating(false);
    }
  };

  // Handler: Import Pasted AI JSON as AI_GENERATED Draft
  const handleImportDraft = async () => {
    if (!rawPastedOutput.trim()) {
      setError("Please paste AI output to import.");
      return;
    }
    setIsImporting(true);
    setError(null);
    try {
      const res = await importExternalAiContentAction({
        rawInput: rawPastedOutput,
        learningUnitId,
        documentType,
        targetExamId,
        aiToolUsed,
      });

      if (!res.success || !res.result) {
        setError(res.error || "Failed to import AI content draft.");
        return;
      }

      onGenerated(res.result);
      onClose();
    } catch (err: any) {
      setError(err.message || "Error importing AI draft.");
    } finally {
      setIsImporting(false);
    }
  };

  // Handler: Direct API Generation (Optional)
  const handleDirectGenerate = async () => {
    setIsDirectGenerating(true);
    setError(null);
    try {
      const res = await generateLessonWithAIAction({
        learningUnitId,
        documentType,
        targetExamId,
        providerId,
        directives: {
          includeFormulas,
          includeWorkedExamples,
          includeTraps,
          quickCheckCount,
          customInstructions: customInstructions.trim() || undefined,
        },
      });

      if (!res.success) {
        setError(res.error || "Generation failed.");
        return;
      }

      onGenerated(res.result);
      onClose();
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred during generation.");
    } finally {
      setIsDirectGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 text-white shadow-sm">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-bold text-slate-900 text-base dark:text-slate-100">
                AI Content Studio & External Authoring Importer
              </h2>
              <p className="text-slate-500 text-xs dark:text-slate-400">
                Target Unit: <span className="font-semibold text-slate-700 dark:text-slate-200">{unitTitle}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50/80 px-6 pt-2 dark:border-slate-800 dark:bg-slate-800/50">
          <button
            onClick={() => setActiveTab("PROMPT")}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 font-bold text-xs transition ${
              activeTab === "PROMPT"
                ? "border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            <FileCode className="h-4 w-4" />
            <span>1. Generate Prompt & Copy (Primary — Free)</span>
          </button>
          <button
            onClick={() => setActiveTab("IMPORT")}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 font-bold text-xs transition ${
              activeTab === "IMPORT"
                ? "border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            <DownloadCloud className="h-4 w-4" />
            <span>2. Paste & Import AI Output</span>
          </button>
          <button
            onClick={() => setActiveTab("API")}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 font-bold text-xs transition ${
              activeTab === "API"
                ? "border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            <Cpu className="h-4 w-4" />
            <span>3. Direct API (Optional)</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-5 overflow-y-auto p-6 text-sm">
          {error && (
            <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-rose-800 text-xs dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-emerald-800 text-xs dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* TAB 1: GENERATE PROMPT */}
          {activeTab === "PROMPT" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700 text-xs dark:text-slate-300">
                    Target Document Type
                  </label>
                  <select
                    value={documentType}
                    onChange={(e) => setDocumentType(e.target.value as DocumentType)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 font-medium text-slate-900 text-xs shadow-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="CONCEPT_LESSON">CONCEPT_LESSON (Core Theory & Fundamentals)</option>
                    <option value="WORKED_EXAMPLES">WORKED_EXAMPLES (Step-by-Step Problem Solving)</option>
                    <option value="FORMULA_SHORTCUT_SHEET">FORMULA_SHORTCUT_SHEET (High-Speed Cheat Sheet)</option>
                    <option value="COMMON_TRAPS_AND_MISTAKES">COMMON_TRAPS_AND_MISTAKES (Cognitive Traps)</option>
                    <option value="PYQ_DEEP_DIVE">PYQ_DEEP_DIVE (Exam PYQ Analysis)</option>
                    <option value="TOPIC_SUMMARY_REVISION">TOPIC_SUMMARY_REVISION (Revision Notes)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700 text-xs dark:text-slate-300">
                    Target Exam Projection
                  </label>
                  <select
                    value={targetExamId}
                    onChange={(e) => setTargetExamId(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 font-medium text-slate-900 text-xs shadow-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="exam-ssc-cgl">SSC CGL Tier 1 & 2 (Advanced)</option>
                    <option value="exam-upsc-csat">UPSC CSAT (Analytical)</option>
                    <option value="exam-banking">IBPS / SBI PO (Speed & Traps)</option>
                  </select>
                </div>
              </div>

              {/* Component Directives */}
              <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 dark:border-slate-800 dark:bg-slate-800/40">
                <span className="font-bold text-slate-700 text-xs dark:text-slate-300">
                  Curriculum Components to Require
                </span>
                <div className="grid grid-cols-3 gap-3 pt-1">
                  <label className="flex items-center gap-2 text-slate-700 text-xs dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={includeFormulas}
                      onChange={(e) => setIncludeFormulas(e.target.checked)}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    Formula Blocks
                  </label>
                  <label className="flex items-center gap-2 text-slate-700 text-xs dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={includeWorkedExamples}
                      onChange={(e) => setIncludeWorkedExamples(e.target.checked)}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    Worked Examples
                  </label>
                  <label className="flex items-center gap-2 text-slate-700 text-xs dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={includeTraps}
                      onChange={(e) => setIncludeTraps(e.target.checked)}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    Cognitive Traps
                  </label>
                </div>
              </div>

              {/* Custom Admin Directives */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 text-xs dark:text-slate-300">
                  Custom Directives / Specific Topic Focus (Optional)
                </label>
                <textarea
                  rows={2}
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  placeholder="e.g. Focus specifically on quadratic shortcuts and sign traps for 2-digit expansions."
                  maxLength={500}
                  className="w-full rounded-xl border border-slate-300 bg-white p-3 font-medium text-slate-900 text-xs shadow-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={handleGeneratePrompt}
                  disabled={isGeneratingPrompt}
                  className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 font-bold text-white text-xs shadow-sm hover:bg-indigo-700 disabled:opacity-50"
                >
                  {isGeneratingPrompt ? (
                    <>
                      <Cpu className="h-4 w-4 animate-spin" />
                      <span>Building Curriculum Prompt...</span>
                    </>
                  ) : (
                    <>
                      <FileCode className="h-4 w-4" />
                      <span>Generate AI Prompt</span>
                    </>
                  )}
                </button>

                {promptResult && (
                  <button
                    onClick={handleCopyPrompt}
                    className={`flex items-center gap-2 rounded-xl px-5 py-2 font-bold text-xs shadow-sm transition ${
                      hasCopied
                        ? "bg-emerald-600 text-white"
                        : "bg-violet-600 text-white hover:bg-violet-700"
                    }`}
                  >
                    {hasCopied ? (
                      <>
                        <Check className="h-4 w-4" />
                        <span>Copied to Clipboard!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" />
                        <span>Copy Prompt to Clipboard</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* Prompt Preview Block */}
              {promptResult && (
                <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>
                      Contract: <strong className="text-slate-700 dark:text-slate-300">{promptResult.promptContractVersion}</strong> | Hash: <code className="text-[11px]">{promptResult.contextHash.slice(0, 12)}...</code>
                    </span>
                    <span>{promptResult.characterCount.toLocaleString()} chars</span>
                  </div>
                  <pre className="max-h-60 overflow-y-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-3 font-mono text-[11px] text-slate-800 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
                    {promptResult.promptText}
                  </pre>
                  <div className="flex items-center justify-between pt-1 text-slate-500 text-xs">
                    <p className="text-[11px]">
                      Paste this into ChatGPT, Claude, Perplexity, or Gemini. Once generated, switch to <strong>Tab 2 (Paste & Import)</strong>.
                    </p>
                    <button
                      onClick={() => setActiveTab("IMPORT")}
                      className="flex items-center gap-1 font-bold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
                    >
                      <span>Proceed to Import</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: IMPORT AI OUTPUT */}
          {activeTab === "IMPORT" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 text-xs dark:text-slate-300">
                    Paste AI-Generated Output (JSON or Fenced JSON)
                  </label>
                  <p className="text-[11px] text-slate-500">
                    Raw JSON or markdown fences (```json ... ```) are automatically extracted and validated.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <label className="font-bold text-slate-700 text-xs dark:text-slate-300">
                    AI Tool Used:
                  </label>
                  <select
                    value={aiToolUsed}
                    onChange={(e) => setAiToolUsed(e.target.value as ExternalAITool)}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-1 font-medium text-slate-900 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="ChatGPT">ChatGPT (OpenAI)</option>
                    <option value="Claude">Claude (Anthropic)</option>
                    <option value="Perplexity">Perplexity</option>
                    <option value="Gemini">Google Gemini</option>
                    <option value="DeepSeek">DeepSeek</option>
                    <option value="Other">Other LLM</option>
                  </select>
                </div>
              </div>

              <textarea
                rows={10}
                value={rawPastedOutput}
                onChange={(e) => {
                  setRawPastedOutput(e.target.value);
                  setValidationResult(null);
                }}
                placeholder="Paste the exact JSON output returned by your external AI tool here..."
                className="w-full rounded-xl border border-slate-300 bg-white p-3.5 font-mono text-slate-900 text-xs shadow-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />

              {/* Validation Feedback Panel */}
              {validationResult && (
                <div
                  className={`space-y-3 rounded-xl border p-4 text-xs ${
                    validationResult.overallOutcome === "BLOCK"
                      ? "border-rose-200 bg-rose-50/70 text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200"
                      : validationResult.overallOutcome === "WARNING"
                      ? "border-amber-200 bg-amber-50/70 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200"
                      : "border-emerald-200 bg-emerald-50/70 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200"
                  }`}
                >
                  <div className="flex items-center justify-between font-bold">
                    <span className="flex items-center gap-1.5">
                      {validationResult.overallOutcome === "BLOCK" ? (
                        <AlertCircle className="h-4 w-4 text-rose-600" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      )}
                      Validation Status: {validationResult.overallOutcome}
                    </span>
                    <span className="text-[11px]">
                      Blocks: {validationResult.summary.totalBlocks} | Warnings: {validationResult.summary.totalWarnings}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-[11px]">
                    <div>
                      <p className="font-semibold">Structure & Schema:</p>
                      <p>{validationResult.structure.isValid ? "✓ Valid LessonDocumentSpec" : "✕ Structural schema invalid"}</p>
                    </div>
                    <div>
                      <p className="font-semibold">MDX Security Scan:</p>
                      <p>{validationResult.security.isSafe ? "✓ Zero forbidden tags/scripts" : "✕ Security violation detected"}</p>
                    </div>
                    <div>
                      <p className="font-semibold">Academic Pedagogical:</p>
                      <p>{validationResult.academic.isValid ? "✓ Academic rules satisfied" : "✕ Academic block rules triggered"}</p>
                    </div>
                    <div>
                      <p className="font-semibold">Question References:</p>
                      <p>{validationResult.questionReferences.isValid ? "✓ Authentic references verified" : "✕ Invalid / fabricated question references"}</p>
                    </div>
                  </div>

                  {validationResult.structure.errors.length > 0 && (
                    <div className="rounded bg-white/60 p-2 dark:bg-slate-900/60">
                      <p className="font-bold text-rose-600">Schema Errors:</p>
                      <ul className="list-inside list-disc space-y-0.5">
                        {validationResult.structure.errors.map((err, idx) => (
                          <li key={idx}>{err}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {validationResult.security.errors.length > 0 && (
                    <div className="rounded bg-white/60 p-2 dark:bg-slate-900/60">
                      <p className="font-bold text-rose-600">Security Violations:</p>
                      <ul className="list-inside list-disc space-y-0.5">
                        {validationResult.security.errors.map((err, idx) => (
                          <li key={idx}>{err}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {validationResult.academic.issues.length > 0 && (
                    <div className="rounded bg-white/60 p-2 dark:bg-slate-900/60">
                      <p className="font-bold">Academic Issues:</p>
                      <ul className="list-inside list-disc space-y-0.5">
                        {validationResult.academic.issues.map((iss, idx) => (
                          <li key={idx} className={iss.severity === "BLOCK" ? "text-rose-600 font-semibold" : "text-amber-600"}>
                            [{iss.severity}] {iss.message}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Validation and Import Action Bar */}
              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={handleValidatePastedOutput}
                  disabled={isValidating || !rawPastedOutput.trim()}
                  className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 font-bold text-slate-700 text-xs shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                >
                  {isValidating ? (
                    <>
                      <Cpu className="h-4 w-4 animate-spin" />
                      <span>Validating...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="h-4 w-4" />
                      <span>Validate Output</span>
                    </>
                  )}
                </button>

                <button
                  onClick={handleImportDraft}
                  disabled={isImporting || !rawPastedOutput.trim()}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-2 font-bold text-white text-xs shadow-md hover:from-indigo-700 hover:to-violet-700 disabled:opacity-50"
                >
                  {isImporting ? (
                    <>
                      <Cpu className="h-4 w-4 animate-spin" />
                      <span>Importing & Creating AI Draft...</span>
                    </>
                  ) : (
                    <>
                      <DownloadCloud className="h-4 w-4" />
                      <span>Import as AI Draft</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: DIRECT API GENERATION (OPTIONAL) */}
          {activeTab === "API" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-amber-200/80 bg-amber-50/60 p-3.5 text-amber-900 text-xs dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
                <p className="font-bold">Optional Direct API Path</p>
                <p className="text-[11px] leading-relaxed text-amber-800 dark:text-amber-400">
                  This connects directly to configured AI APIs (e.g. Gemini 1.5 Pro). For standard free usage without API keys, use <strong>Tab 1 & 2</strong>.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700 text-xs dark:text-slate-300">
                    API Provider Engine
                  </label>
                  <select
                    value={providerId}
                    onChange={(e) => setProviderId(e.target.value as any)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 font-medium text-slate-900 text-xs shadow-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="MOCK">Mock AI Engine (Deterministic / Offline)</option>
                    <option value="GOOGLE_GEMINI">Google Gemini 1.5 Pro (Production API)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700 text-xs dark:text-slate-300">
                    Target Document Type
                  </label>
                  <select
                    value={documentType}
                    onChange={(e) => setDocumentType(e.target.value as DocumentType)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 font-medium text-slate-900 text-xs shadow-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="CONCEPT_LESSON">CONCEPT_LESSON</option>
                    <option value="WORKED_EXAMPLES">WORKED_EXAMPLES</option>
                    <option value="FORMULA_SHORTCUT_SHEET">FORMULA_SHORTCUT_SHEET</option>
                    <option value="COMMON_TRAPS_AND_MISTAKES">COMMON_TRAPS_AND_MISTAKES</option>
                    <option value="PYQ_DEEP_DIVE">PYQ_DEEP_DIVE</option>
                    <option value="TOPIC_SUMMARY_REVISION">TOPIC_SUMMARY_REVISION</option>
                  </select>
                </div>
              </div>

              <button
                onClick={handleDirectGenerate}
                disabled={isDirectGenerating}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-2 font-bold text-white text-xs shadow-md hover:from-indigo-700 hover:to-violet-700 disabled:opacity-50"
              >
                {isDirectGenerating ? (
                  <>
                    <Cpu className="h-4 w-4 animate-spin" />
                    <span>Calling Provider API...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    <span>Generate via API</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Strict Invariant Notice */}
          <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-slate-600 text-xs dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400">
            <Lock className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
            <div className="space-y-0.5">
              <p className="font-bold text-[11px] text-slate-800 dark:text-slate-200">
                Draft-Only Human-in-the-Loop Architecture
              </p>
              <p className="text-[11px] leading-relaxed">
                All AI output is saved as an unapproved candidate <span className="font-semibold text-slate-700 dark:text-slate-300">AI_GENERATED</span> draft. It cannot publish, approve, or alter canonical syllabus taxonomy without explicit human review and approval.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-slate-200 px-6 py-3.5 dark:border-slate-800">
          <button
            onClick={onClose}
            className="rounded-xl border border-slate-300 px-4 py-2 font-bold text-slate-700 text-xs hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
