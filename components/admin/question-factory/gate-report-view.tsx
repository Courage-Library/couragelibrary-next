"use client";

import React from "react";
import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import type { QuestionGateReport, QuestionItemGateReport } from "@/types/question-factory";

const GATE_ORDER = ["GATE_1_SCHEMA", "GATE_2_SECURITY", "GATE_3_TAXONOMY", "GATE_4_PROVENANCE", "GATE_5_ANTI_DUPLICATE"] as const;

export function GateChips({ gates }: { gates: Partial<Record<string, Pick<QuestionGateReport, "passed" | "warnings">>> }) {
  return (
    <div className="flex flex-wrap gap-1">
      {GATE_ORDER.map((g, idx) => {
        const gate = gates[g];
        const passed = gate?.passed;
        const warn = passed && (gate?.warnings?.length ?? 0) > 0;
        return (
          <span
            key={g}
            title={g}
            className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold border ${
              !gate
                ? "bg-slate-50 text-slate-400 border-slate-200"
                : !passed
                ? "bg-rose-50 text-rose-700 border-rose-200"
                : warn
                ? "bg-amber-50 text-amber-700 border-amber-200"
                : "bg-emerald-50 text-emerald-700 border-emerald-200"
            }`}
          >
            {!gate ? null : !passed ? <XCircle className="w-3 h-3" /> : warn ? <AlertTriangle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
            G{idx + 1}
          </span>
        );
      })}
    </div>
  );
}

export function ItemGateDetail({ item }: { item: Pick<QuestionItemGateReport, "errors" | "warnings" | "nearDuplicates"> }) {
  return (
    <div className="space-y-2 text-[11px]">
      {item.errors.length > 0 && (
        <ul className="space-y-0.5 text-rose-700">
          {item.errors.map((e, i) => <li key={i}>✕ {e}</li>)}
        </ul>
      )}
      {item.warnings.length > 0 && (
        <ul className="space-y-0.5 text-amber-700">
          {item.warnings.map((w, i) => <li key={i}>⚠ {w}</li>)}
        </ul>
      )}
      {item.nearDuplicates.length > 0 && (
        <div className="space-y-1">
          <p className="font-bold text-slate-700">Similar stems</p>
          {item.nearDuplicates.map((d, i) => (
            <div key={i} className="p-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-700">
              <span className="font-mono font-bold">{d.similarity.toFixed(2)}</span>{" "}
              <span className="text-slate-500">({d.scope === "BATCH" ? `batch ${d.clientRef}` : `v ${d.versionId?.slice(0, 8)}`})</span>{" "}
              {d.stemPreview}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
