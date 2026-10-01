'use client';

import React, { useState } from 'react';
import {
  X,
  Sparkles,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  FileCheck,
} from 'lucide-react';
import { ComprehensiveGateReport } from '@/types/current-affairs';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess: (articleId: string) => void;
}

export function CurrentAffairsImportModal({
  isOpen,
  onClose,
  onImportSuccess,
}: Props) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [rawJson, setRawJson] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [validationReport, setValidationReport] = useState<ComprehensiveGateReport | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleValidate = async () => {
    setIsValidating(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/admin/current-affairs/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawPayload: rawJson }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        setErrorMessage(json.error?.message || 'Failed to validate JSON payload');
        return;
      }

      setValidationReport(json.data.gateReport);
      setStep(3);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error validating import payload');
    } finally {
      setIsValidating(false);
    }
  };

  const handleCreateDraft = async () => {
    setIsImporting(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/admin/current-affairs/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawPayload: rawJson }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        setErrorMessage(json.error?.message || 'Failed to persist draft in database');
        return;
      }

      onImportSuccess(json.data.articleId);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to import draft');
    } finally {
      setIsImporting(false);
    }
  };

  const renderGateStatus = (gateKey: string, gateTitle: string) => {
    const gate = validationReport?.gates?.[gateKey];
    if (!gate) return null;

    const isPassed = gate.passed;
    return (
      <div
        className={`p-3 rounded-xl border flex items-start justify-between gap-3 text-xs ${
          isPassed
            ? 'bg-emerald-50/50 border-emerald-200 text-emerald-900'
            : 'bg-rose-50/50 border-rose-200 text-rose-900'
        }`}
      >
        <div className="space-y-1 flex-1">
          <div className="flex items-center gap-2">
            {isPassed ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span className="font-bold">{gateTitle}</span>
          </div>
          {gate.errors && gate.errors.length > 0 && (
            <ul className="pl-6 list-disc space-y-0.5 text-[11px] text-rose-700">
              {gate.errors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          )}
          {gate.warnings && gate.warnings.length > 0 && (
            <ul className="pl-6 list-disc space-y-0.5 text-[11px] text-amber-700">
              {gate.warnings.map((warn, i) => (
                <li key={i}>{warn}</li>
              ))}
            </ul>
          )}
        </div>
        <span
          className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
            isPassed ? 'bg-emerald-200 text-emerald-800' : 'bg-rose-200 text-rose-800'
          }`}
        >
          {isPassed ? 'PASS' : 'FAIL'}
        </span>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-3xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">External AI Import Workspace</h2>
              <p className="text-[11px] text-slate-500">5-Gate Technical Validation &amp; Draft Boundary</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Steps Progress */}
        <div className="px-6 py-2.5 bg-slate-100/70 border-b border-slate-200 flex items-center justify-between text-[11px] font-semibold text-slate-600">
          <span className={step === 1 ? 'text-indigo-600 font-bold' : ''}>1. Instructions</span>
          <ArrowRight className="w-3 h-3 text-slate-400" />
          <span className={step === 2 ? 'text-indigo-600 font-bold' : ''}>2. Paste JSON</span>
          <ArrowRight className="w-3 h-3 text-slate-400" />
          <span className={step === 3 ? 'text-indigo-600 font-bold' : ''}>3. Validation Report</span>
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1 text-xs">
          {/* Step 1: Instructions */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-200 text-blue-900 space-y-2">
                <h3 className="font-bold flex items-center gap-1.5 text-xs">
                  <ShieldCheck className="w-4 h-4 text-blue-600" />
                  Editorial Import Protocol
                </h3>
                <p className="text-[11px] text-blue-800 leading-relaxed">
                  Courage Library enforces a strict 5-gate boundary on all external AI content:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-[11px] text-blue-800">
                  <li><strong>Gate 1 (Schema &amp; Enums):</strong> Required headline, summary, valid date, canonical category.</li>
                  <li><strong>Gate 2 (AST &amp; Sanitization):</strong> Zero scripts/iframes; AI citation markers stripped.</li>
                  <li><strong>Gate 3 (Provenance):</strong> HTTPS URLs only from primary/reputable source tiers.</li>
                  <li><strong>Gate 4 (Entity Resolution):</strong> Mapped canonical taxonomy nodes, exams, learning &amp; questions.</li>
                  <li><strong>Gate 5 (Deduplication):</strong> Deterministic SHA-256 duplicate collision check.</li>
                </ul>
              </div>

              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[11px] flex items-start gap-2.5">
                <ShieldAlert className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                <div>
                  <strong>Human Review Invariant:</strong> External AI content is strictly imported in <code>DRAFT</code> status with <code>published_version_id = NULL</code>. AI-generated content is never published automatically.
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Paste JSON */}
          {step === 2 && (
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Paste Raw JSON / Markdown from External AI
                </label>
                <textarea
                  rows={12}
                  placeholder={`{\n  "headline": "...",\n  "category": "NATIONAL",\n  "newsDate": "2026-10-01",\n  "summaryMd": "...",\n  "keyTakeaways": [...],\n  "sources": [...]\n}`}
                  value={rawJson}
                  onChange={(e) => setRawJson(e.target.value)}
                  className="w-full p-3 font-mono text-[11px] rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-slate-900 text-slate-100"
                />
              </div>

              {errorMessage && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-[11px] flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Validation Report */}
          {step === 3 && validationReport && (
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <FileCheck className="w-4 h-4 text-slate-600" />
                  <span className="font-bold text-slate-800 text-xs">5-Gate Forensic Verification</span>
                </div>
                <span className="text-[11px] font-mono text-slate-500">
                  Checksum: {validationReport.checksumSha256?.slice(0, 12)}...
                </span>
              </div>

              <div className="space-y-2">
                {renderGateStatus('GATE_1_SCHEMA', 'Gate 1: Schema Bounds & Enums')}
                {renderGateStatus('GATE_2_SECURITY', 'Gate 2: Content Sanitization & AST Security')}
                {renderGateStatus('GATE_3_PROVENANCE', 'Gate 3: Provenance & HTTPS Sources')}
                {renderGateStatus('GATE_4_TAXONOMY', 'Gate 4: Entity Resolution & Mappings')}
                {renderGateStatus('GATE_5_ANTI_DUPLICATE', 'Gate 5: SHA-256 Anti-Duplicate')}
              </div>

              {errorMessage && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-[11px] flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50/80">
          {step === 1 ? (
            <div>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setStep((step - 1) as any)}
              className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </button>
          )}

          {step === 1 && (
            <button
              onClick={() => setStep(2)}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs"
            >
              Continue to Paste JSON <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}

          {step === 2 && (
            <button
              onClick={handleValidate}
              disabled={isValidating || !rawJson.trim()}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs disabled:opacity-40"
            >
              {isValidating ? 'Running 5 Gates...' : 'Validate 5 Gates'}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}

          {step === 3 && (
            <button
              onClick={handleCreateDraft}
              disabled={isImporting || !validationReport?.passed}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isImporting ? 'Creating Draft...' : 'Create Draft in Database'}
              <CheckCircle2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
