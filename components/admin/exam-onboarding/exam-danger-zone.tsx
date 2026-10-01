"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  Trash2,
  Lock,
  Archive,
  RefreshCw,
  CheckCircle2,
  X,
  ShieldAlert,
} from "lucide-react";
import {
  evaluateExamDeletionEligibilityAction,
  deleteExamDraftAction,
  archiveExamAction,
} from "@/app/admin/exams/actions";
import type { ExamDeletionEligibilityReport } from "@/services/exam-onboarding/exam-onboarding.service";

interface Props {
  examId: string;
  examTitle: string;
  examSlug: string;
  isActive: boolean;
  initialReport?: ExamDeletionEligibilityReport | null;
}

export function ExamDangerZone({
  examId,
  examTitle,
  examSlug,
  isActive,
  initialReport,
}: Props) {
  const router = useRouter();
  const [report, setReport] = useState<ExamDeletionEligibilityReport | null>(
    initialReport || null
  );
  const [isLoading, setIsLoading] = useState(!initialReport);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [slugInput, setSlugInput] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [isArchiving, setIsArchiving] = useState(false);
  const [archiveSuccess, setArchiveSuccess] = useState<string | null>(null);

  const fetchEligibility = async () => {
    setIsLoading(true);
    try {
      const res = await evaluateExamDeletionEligibilityAction(examId);
      if (res.success && res.report) {
        setReport(res.report);
      }
    } catch (err: any) {
      console.error("Failed to load deletion eligibility:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!initialReport && examId) {
      fetchEligibility();
    }
  }, [examId]);

  const handleDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (slugInput.trim() !== examSlug) {
      setDeleteError(`Confirmation slug must exactly match "${examSlug}".`);
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);

    try {
      const res = await deleteExamDraftAction(examId, slugInput.trim());
      if (res.error) {
        setDeleteError(res.error);
        setIsDeleting(false);
      } else {
        setIsModalOpen(false);
        router.push("/admin/exams");
        router.refresh();
      }
    } catch (err: any) {
      setDeleteError(err.message || "Failed to delete examination.");
      setIsDeleting(false);
    }
  };

  const handleArchive = async () => {
    setIsArchiving(true);
    setArchiveSuccess(null);
    try {
      const res = await archiveExamAction(examId);
      if (res.error) {
        setDeleteError(res.error);
      } else {
        setArchiveSuccess("Examination archived to draft status.");
        await fetchEligibility();
        router.refresh();
      }
    } catch (err: any) {
      setDeleteError(err.message || "Failed to archive examination.");
    } finally {
      setIsArchiving(false);
    }
  };

  return (
    <Card className="p-6 bg-white border border-rose-200/80 rounded-2xl shadow-2xs space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-rose-100 pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0" />
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider font-mono">
              Danger Zone — Controlled Examination Lifecycle
            </h3>
          </div>
          <p className="text-xs text-slate-500 font-medium">
            Permanent removal of draft / isolated development fixtures or archival of live examinations.
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={fetchEligibility}
          disabled={isLoading}
          className="text-xs border-slate-200 text-slate-600 rounded-xl flex items-center gap-1.5 self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} /> Re-evaluate Safety
        </Button>
      </div>

      {archiveSuccess && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2 font-medium">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{archiveSuccess}</span>
        </div>
      )}

      {deleteError && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2 font-medium">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{deleteError}</span>
        </div>
      )}

      {/* Server-Evaluated Dependency Summary */}
      {report && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 bg-slate-50 border border-slate-200/60 rounded-xl space-y-0.5">
            <span className="text-[10px] font-bold uppercase text-slate-400 font-mono">Candidate Attempts</span>
            <div className={`text-base font-bold font-mono ${report.dependencies.testAttempts > 0 ? "text-rose-600" : "text-slate-800"}`}>
              {report.dependencies.testAttempts}
            </div>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200/60 rounded-xl space-y-0.5">
            <span className="text-[10px] font-bold uppercase text-slate-400 font-mono">Student Goals</span>
            <div className={`text-base font-bold font-mono ${report.dependencies.userExamGoals > 0 ? "text-rose-600" : "text-slate-800"}`}>
              {report.dependencies.userExamGoals}
            </div>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200/60 rounded-xl space-y-0.5">
            <span className="text-[10px] font-bold uppercase text-slate-400 font-mono">Mock Blueprints</span>
            <div className={`text-base font-bold font-mono ${report.dependencies.mockTemplates > 0 ? "text-rose-600" : "text-slate-800"}`}>
              {report.dependencies.mockTemplates}
            </div>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200/60 rounded-xl space-y-0.5">
            <span className="text-[10px] font-bold uppercase text-slate-400 font-mono">Question Items</span>
            <div className={`text-base font-bold font-mono ${report.dependencies.questionMappings > 0 ? "text-rose-600" : "text-slate-800"}`}>
              {report.dependencies.questionMappings}
            </div>
          </div>
        </div>
      )}

      {/* State & Action Dispatcher */}
      {report && (
        <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {!report.eligible ? (
            <div className="space-y-1.5 flex-1">
              <div className="flex items-center gap-2 text-xs font-bold text-rose-700">
                <Lock className="w-4 h-4 text-rose-600 shrink-0" /> Permanent Deletion Unavailable
              </div>
              <ul className="text-xs text-rose-600/90 list-disc pl-5 space-y-1 font-medium">
                {report.blockers.map((b, idx) => (
                  <li key={idx}>{b}</li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="space-y-1 flex-1">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> Zero Protected Dependencies
              </div>
              <p className="text-xs text-slate-500">
                This draft / isolated test record can be permanently removed from the catalog.
              </p>
            </div>
          )}

          <div className="flex items-center gap-2 shrink-0">
            {isActive && (
              <Button
                type="button"
                variant="outline"
                onClick={handleArchive}
                disabled={isArchiving}
                className="text-xs font-bold text-amber-700 border-amber-300 hover:bg-amber-50 rounded-xl flex items-center gap-1.5 shadow-2xs"
              >
                <Archive className="w-3.5 h-3.5" /> {isArchiving ? "Archiving..." : "Archive / Deactivate"}
              </Button>
            )}

            <Button
              type="button"
              onClick={() => {
                setSlugInput("");
                setDeleteError(null);
                setIsModalOpen(true);
              }}
              disabled={!report.eligible || isDeleting}
              className={`text-xs font-bold px-4 py-2 rounded-xl flex items-center gap-1.5 shadow-xs transition-colors ${
                report.eligible
                  ? "bg-rose-600 hover:bg-rose-700 text-white"
                  : "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed"
              }`}
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete Examination
            </Button>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {isModalOpen && report && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-200">
          <Card className="w-full max-w-lg bg-white border border-rose-200 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-rose-100 flex items-center justify-between bg-rose-50/50">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shadow-2xs">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Permanently Delete Examination</h3>
                  <p className="text-[11px] text-slate-500 font-mono">/exams/{examSlug}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-white flex items-center justify-center transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleDelete} className="p-6 space-y-4">
              <div className="p-3.5 bg-rose-50/70 border border-rose-200/80 rounded-2xl text-xs text-rose-800 space-y-2">
                <p className="font-semibold">
                  This action permanently removes <strong>{examTitle}</strong> and its onboarding metadata. This action cannot be undone.
                </p>
                {report.warnings.length > 0 && (
                  <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-rose-700">
                    {report.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                )}
              </div>

              {deleteError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{deleteError}</span>
                </div>
              )}

              <div className="space-y-1.5 pt-1">
                <label className="text-xs font-bold text-slate-700 block">
                  Type the examination slug <span className="font-mono text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">{examSlug}</span> to confirm:
                </label>
                <input
                  type="text"
                  value={slugInput}
                  onChange={(e) => setSlugInput(e.target.value)}
                  placeholder={examSlug}
                  autoFocus
                  required
                  className="w-full px-3.5 py-2 text-xs font-mono font-bold rounded-xl border border-slate-300 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 focus:outline-none bg-slate-50/50"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isDeleting}
                  className="text-xs font-semibold rounded-xl text-slate-600"
                >
                  Cancel
                </Button>

                <Button
                  type="submit"
                  disabled={isDeleting || slugInput.trim() !== examSlug}
                  className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold px-5 py-2 rounded-xl shadow-xs disabled:opacity-40 flex items-center gap-1.5"
                >
                  {isDeleting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Deleting...
                    </>
                  ) : (
                    "Permanently Delete"
                  )}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </Card>
  );
}
