"use client";

import React from "react";
import { CheckCircle2, AlertTriangle, XCircle, ShieldCheck, ShieldAlert, FileJson, Link2, Database } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ExamFiveGateValidationResult } from "@/types/exam-knowledge";

interface FiveGatePreviewPanelProps {
  validationResult: ExamFiveGateValidationResult | null;
}

export function FiveGatePreviewPanel({ validationResult }: FiveGatePreviewPanelProps) {
  if (!validationResult) {
    return (
      <div className="p-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 text-center text-slate-500">
        <ShieldCheck className="w-8 h-8 mx-auto mb-2 text-slate-400" />
        <p className="text-xs font-medium">No validation results yet. Paste an external AI response and click Validate.</p>
      </div>
    );
  }

  const { gates, overallOutcome, errors, warnings } = validationResult;

  const getGateIcon = (status: "PASS" | "WARNING" | "FAIL" | "BLOCK") => {
    switch (status) {
      case "PASS":
        return <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />;
      case "WARNING":
        return <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />;
      case "FAIL":
      case "BLOCK":
        return <XCircle className="w-4 h-4 text-rose-600 shrink-0" />;
    }
  };

  const getGateBadge = (status: "PASS" | "WARNING" | "FAIL" | "BLOCK") => {
    switch (status) {
      case "PASS":
        return <Badge variant="success" className="text-[10px] font-bold">PASS</Badge>;
      case "WARNING":
        return <Badge variant="warning" className="text-[10px] font-bold bg-amber-100 text-amber-800 border-amber-300">WARN</Badge>;
      case "FAIL":
      case "BLOCK":
        return <Badge variant="destructive" className="text-[10px] font-bold">BLOCK</Badge>;
    }
  };

  const gateDefinitions = [
    {
      gate: gates.gate1_schema,
      num: 1,
      title: "Schema & Structure",
      desc: "Spec format, mandatory sections, valid JSON & character bounds",
      icon: FileJson,
    },
    {
      gate: gates.gate2_target,
      num: 2,
      title: "Target & Context Hash",
      desc: "Exam/cycle matching, timeless rules & SHA-256 freshness",
      icon: Link2,
    },
    {
      gate: gates.gate3_security,
      num: 3,
      title: "Security & Sanitization",
      desc: "MDX security scanner, XSS prevention & safe delimiters",
      icon: ShieldAlert,
    },
    {
      gate: gates.gate4_provenance,
      num: 4,
      title: "Sources & Claim Provenance",
      desc: "HTTP/HTTPS URLs, evidence citations & conflict detection",
      icon: Database,
    },
    {
      gate: gates.gate5_domain,
      num: 5,
      title: "Domain & Academic Integrity",
      desc: "Question bank allowlist, canonical taxonomy & post verification",
      icon: ShieldCheck,
    },
  ];

  return (
    <div className="space-y-4">
      {/* Overall Status Banner */}
      <div
        className={`p-3.5 rounded-xl border flex items-center justify-between ${
          overallOutcome === "PASS"
            ? "bg-emerald-50 border-emerald-200 text-emerald-950"
            : overallOutcome === "WARNING"
            ? "bg-amber-50 border-amber-200 text-amber-950"
            : "bg-rose-50 border-rose-200 text-rose-950"
        }`}
      >
        <div className="flex items-center gap-2.5">
          {getGateIcon(overallOutcome)}
          <div>
            <div className="text-xs font-bold">
              {overallOutcome === "PASS" && "Validation Successful — Ready for Import"}
              {overallOutcome === "WARNING" && "Validation Passed with Warnings — Human Review Advised"}
              {overallOutcome === "BLOCK" && "Validation Blocked — Must Fix Errors Before Import"}
            </div>
            <div className="text-[11px] opacity-80">
              {errors.length} error(s), {warnings.length} warning(s) detected across 5 gates.
            </div>
          </div>
        </div>
        {getGateBadge(overallOutcome)}
      </div>

      {/* 5-Gate Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {gateDefinitions.map((g) => {
          const Icon = g.icon;
          return (
            <div
              key={g.num}
              className={`p-3 rounded-xl border transition-all ${
                g.gate.status === "PASS"
                  ? "bg-white border-slate-200 shadow-xs"
                  : g.gate.status === "WARNING"
                  ? "bg-amber-50/50 border-amber-300"
                  : "bg-rose-50/50 border-rose-300"
              }`}
            >
              <div className="flex items-center justify-between gap-1 mb-2">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500">
                  Gate {g.num}
                </span>
                {getGateBadge(g.gate.status)}
              </div>
              <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900 mb-1">
                <Icon className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <span className="truncate">{g.title}</span>
              </div>
              <p className="text-[10px] text-slate-500 line-clamp-2 mb-2">{g.desc}</p>
              {g.gate.errors.length > 0 && (
                <div className="text-[10px] text-rose-700 font-medium bg-rose-100/70 p-1.5 rounded-md mt-1">
                  {g.gate.errors[0]}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Detailed Issues List if any */}
      {(errors.length > 0 || warnings.length > 0) && (
        <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-2 text-xs">
          <span className="font-bold text-slate-900 block text-[11px] uppercase tracking-wide font-mono">
            Detailed Validation Feedback
          </span>
          {errors.map((err, i) => (
            <div key={`err-${i}`} className="flex items-start gap-2 text-rose-700 font-medium">
              <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{err}</span>
            </div>
          ))}
          {warnings.map((warn, i) => (
            <div key={`warn-${i}`} className="flex items-start gap-2 text-amber-700">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{warn}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
