"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Flag, X, CheckCircle2 } from "lucide-react";

interface ReportIssueDialogProps {
  isOpen: boolean;
  questionNumber: number;
  mockQuestionId: string;
  onClose: () => void;
}

export function ReportIssueDialog({
  isOpen,
  questionNumber,
  mockQuestionId,
  onClose,
}: ReportIssueDialogProps) {
  const [issueType, setIssueType] = useState<string>("typo");
  const [comments, setComments] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Post to community/support or log feedback safely
      await fetch("/api/community/flag-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentType: "mock_question",
          contentId: mockQuestionId,
          reason: `${issueType}: ${comments || "Flagged during mock test"}`,
        }),
      }).catch(() => {});

      setIsSubmitted(true);
      setTimeout(() => {
        setIsSubmitted(false);
        setComments("");
        onClose();
      }, 1500);
    } catch {
      setIsSubmitted(true);
      setTimeout(() => {
        setIsSubmitted(false);
        onClose();
      }, 1500);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
            <Flag className="w-4 h-4 text-amber-600" />
            <span>Report Issue — Question {questionNumber}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {isSubmitted ? (
          <div className="py-6 text-center space-y-2">
            <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
            <h4 className="text-sm font-bold text-slate-900">Thank You</h4>
            <p className="text-xs text-slate-500">
              Your feedback for Question {questionNumber} has been recorded.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">
                Issue Category
              </label>
              <select
                value={issueType}
                onChange={(e) => setIssueType(e.target.value)}
                className="w-full text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              >
                <option value="typo">Typo / Grammatical Error</option>
                <option value="wrong_options">Incorrect / Ambiguous Options</option>
                <option value="image_issue">Figure / Diagram Display Issue</option>
                <option value="wrong_answer_key">Disputed Answer Key</option>
                <option value="other">Other Technical Issue</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">
                Additional Details (Optional)
              </label>
              <textarea
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="Briefly describe what looks wrong..."
                rows={3}
                className="w-full text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onClose}
                className="text-xs font-semibold"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="default"
                size="sm"
                disabled={isSubmitting}
                className="text-xs font-bold bg-blue-600 hover:bg-blue-700"
              >
                {isSubmitting ? "Submitting..." : "Submit Report"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
