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
        <ShieldCheck className="h-5 w-5 text-indigo-600" />
        <h4 className="font-bold text-slate-900 text-sm dark:text-slate-100">Structural & Security Gate</h4>
      </div>

      {isValid ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-200">
          <div className="flex items-center gap-2 font-bold">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span>Structural Validation PASSED</span>
          </div>
          <p className="mt-1 text-[11px] opacity-90">
            Document conforms to LessonDocumentSpec, AST security allowlist, and referential constraints.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3 text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/20 dark:text-rose-200">
          <div className="flex items-center gap-2 font-bold">
            <XCircle className="h-4 w-4 text-rose-600" />
            <span>Validation Blockers ({errors.length})</span>
          </div>
          <div className="mt-2 space-y-1.5">
            {errors.map((err, idx) => (
              <div key={idx} className="rounded bg-white/80 p-2 text-[11px] shadow-2xs dark:bg-slate-900/80">
                <span className="font-mono font-bold text-rose-700">[{err.code}] </span>
                <span>{err.message}</span>
                {err.path && <div className="mt-0.5 text-slate-400 font-mono text-[10px]">Path: {err.path}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200">
          <div className="flex items-center gap-2 font-bold">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <span>Warnings ({warnings.length})</span>
          </div>
          <ul className="mt-2 list-disc list-inside space-y-1 text-[11px]">
            {warnings.map((w, idx) => (
              <li key={idx}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {isPublished && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3 text-indigo-900 dark:border-indigo-900/60 dark:bg-indigo-950/20 dark:text-indigo-200">
          <span className="font-bold">🔒 Immutable Published Version</span>
          <p className="mt-1 text-[11px]">
            This version is locked and published. To make changes, create a new revision (version N+1).
          </p>
        </div>
      )}
    </div>
  );
};
