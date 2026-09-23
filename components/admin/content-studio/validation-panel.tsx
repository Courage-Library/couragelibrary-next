"use client";

import React from "react";
import { CompilationError } from "@/types/learning-compiler";
import { CheckCircle2, AlertTriangle, XCircle, ShieldCheck } from "lucide-react";

interface Props {
  isValid: boolean;
  errors: CompilationError[];
  warnings: string[];
  isPublished?: boolean;
}

export const ValidationPanel: React.FC<Props> = ({
  isValid,
  errors = [],
  warnings = [],
  isPublished = false,
}) => {
  return (
    <div className="space-y-4 p-4 text-xs">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-blue-700" />
        <h4 className="font-bold text-slate-900 text-sm">Structural & Security Gate</h4>
      </div>

      {isValid ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-3.5 text-emerald-950 shadow-2xs">
          <div className="flex items-center gap-2 font-bold text-emerald-800">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span>Structural Validation PASSED</span>
          </div>
          <p className="mt-1 text-[11px] text-emerald-900/90 leading-relaxed">
            Document conforms to LessonDocumentSpec, AST security allowlist, and referential constraints.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-rose-200 bg-rose-50/80 p-3.5 text-rose-950 shadow-2xs">
          <div className="flex items-center gap-2 font-bold text-rose-800">
            <XCircle className="h-4 w-4 text-rose-600" />
            <span>Validation Blockers ({errors.length})</span>
          </div>
          <div className="mt-2 space-y-1.5">
            {errors.map((err, idx) => (
              <div key={idx} className="rounded-lg bg-white border border-rose-200/80 p-2.5 text-[11px] shadow-2xs">
                <span className="font-mono font-bold text-rose-700">[{err.code}] </span>
                <span className="text-slate-800">{err.message}</span>
                {err.path && <div className="mt-0.5 text-slate-500 font-mono text-[10px]">Path: {err.path}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3.5 text-amber-950 shadow-2xs">
          <div className="flex items-center gap-2 font-bold text-amber-800">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <span>Warnings ({warnings.length})</span>
          </div>
          <ul className="mt-2 list-disc list-inside space-y-1 text-[11px] text-amber-900/90">
            {warnings.map((w, idx) => (
              <li key={idx}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {isPublished && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/80 p-3.5 text-blue-950 shadow-2xs">
          <span className="font-bold text-blue-900">🔒 Immutable Published Version</span>
          <p className="mt-1 text-[11px] text-blue-900/80 leading-relaxed">
            This version is locked and published. To make changes, create a new revision (version N+1).
          </p>
        </div>
      )}
    </div>
  );
};
