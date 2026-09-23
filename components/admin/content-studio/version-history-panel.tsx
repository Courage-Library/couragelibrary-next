"use client";

import React from "react";
import { DocumentVersion } from "@/types/learning-compiler";
import { History, CheckCircle2, Lock, FileCode, Play, Send } from "lucide-react";

interface Props {
  versions: DocumentVersion[];
  currentVersionId: string | null;
  onSelectVersion: (versionId: string) => void;
  onSubmitForReview: (versionId: string) => void;
  onApprove: (versionId: string) => void;
  onCompile: (versionId: string) => void;
  onPublish: (versionId: string) => void;
  loading?: boolean;
}

export const VersionHistoryPanel: React.FC<Props> = ({
  versions = [],
  currentVersionId,
  onSelectVersion,
  onSubmitForReview,
  onApprove,
  onCompile,
  onPublish,
  loading = false,
}) => {
  return (
    <div className="space-y-4 p-4 text-xs">
      <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
        <History className="h-4 w-4 text-blue-700" />
        <span>Version History & Actions</span>
      </div>

      <div className="space-y-2.5">
        {versions.map((v) => {
          const isSelected = v.id === currentVersionId;
          const isPublished = v.is_published;

          return (
            <div
              key={v.id}
              className={`rounded-xl border p-3.5 transition shadow-2xs ${
                isSelected
                  ? "border-blue-300 bg-blue-50/60 shadow-xs"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => onSelectVersion(v.id)}
                  className="font-bold text-blue-700 hover:text-blue-900 hover:underline text-xs"
                >
                  Version {v.version_number}
                </button>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold border ${
                    isPublished
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-slate-100 text-slate-700 border-slate-200"
                  }`}
                >
                  {v.review_status}
                </span>
              </div>

              <div className="mt-2 text-[10px] text-slate-500 font-mono space-y-0.5">
                <div>Hash: {v.compiled_artifact_hash?.slice(0, 12)}...</div>
                <div>Compiler: v{v.compiler_version}</div>
              </div>

              {/* Action Buttons */}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {v.review_status === "STRUCTURALLY_VALID" && (
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => onSubmitForReview(v.id)}
                    className="flex items-center gap-1 rounded-lg bg-amber-600 px-2.5 py-1 font-bold text-white text-[10px] hover:bg-amber-700 shadow-2xs transition disabled:opacity-50"
                  >
                    <Send className="h-3 w-3" /> Submit for Review
                  </button>
                )}

                {v.review_status === "IN_REVIEW" && (
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => onApprove(v.id)}
                    className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 font-bold text-white text-[10px] hover:bg-emerald-700 shadow-2xs transition disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-3 w-3" /> Approve Version
                  </button>
                )}

                {v.review_status === "APPROVED" && (
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => onCompile(v.id)}
                    className="flex items-center gap-1 rounded-lg bg-blue-700 px-2.5 py-1 font-bold text-white text-[10px] hover:bg-blue-800 shadow-2xs transition disabled:opacity-50"
                  >
                    <Play className="h-3 w-3" /> Compile MDX
                  </button>
                )}

                {v.review_status === "COMPILED" && !isPublished && (
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => onPublish(v.id)}
                    className="flex items-center gap-1 rounded-lg bg-teal-700 px-2.5 py-1 font-bold text-white text-[10px] hover:bg-teal-800 shadow-2xs transition disabled:opacity-50"
                  >
                    <Lock className="h-3 w-3" /> Publish (Lock Version)
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
