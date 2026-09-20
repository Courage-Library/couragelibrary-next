"use client";

import React, { useState } from "react";
import { QuestionSearchResultItem } from "@/services/admin-content-studio.service";
import { Search, X, HelpCircle, ShieldCheck } from "lucide-react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSelectQuestion: (question: QuestionSearchResultItem, rationale: string) => void;
  onSearch: (query: string) => Promise<QuestionSearchResultItem[]>;
}

export const QuestionBankSelectorModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSelectQuestion,
  onSearch,
}) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<QuestionSearchResultItem[]>([]);
  const [selectedQ, setSelectedQ] = useState<QuestionSearchResultItem | null>(null);
  const [rationale, setRationale] = useState("Authentic PYQ application in government exams.");
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSearch = async () => {
    setLoading(true);
    try {
      const res = await onSearch(query);
      setResults(res);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="flex h-[80vh] w-full max-w-2xl flex-col rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-slate-800">
          <div className="flex items-center gap-2 font-bold text-slate-900 text-sm dark:text-slate-100">
            <HelpCircle className="h-5 w-5 text-indigo-600" />
            <span>Search Canonical Question Bank</span>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search canonical question text..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
            <button
              type="button"
              onClick={handleSearch}
              disabled={loading}
              className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-xs text-white hover:bg-indigo-700"
            >
              {loading ? "Searching..." : "Search"}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 space-y-2 text-xs">
          {results.map((q) => {
            const isSelected = selectedQ?.questionVersionId === q.questionVersionId;
            return (
              <button
                key={q.questionVersionId}
                type="button"
                onClick={() => setSelectedQ(q)}
                className={`w-full rounded-xl border p-3 text-left transition ${
                  isSelected
                    ? "border-indigo-500 bg-indigo-50/50 dark:border-indigo-600 dark:bg-indigo-950/40"
                    : "border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-indigo-700 dark:text-indigo-400">
                    {q.questionVersionId}
                  </span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {q.questionType}
                  </span>
                </div>
                <p className="mt-1.5 text-slate-800 dark:text-slate-200">{q.questionText}</p>
              </button>
            );
          })}
        </div>

        {selectedQ && (
          <div className="border-t border-slate-200 p-4 dark:border-slate-800">
            <label className="font-semibold text-xs text-slate-700 dark:text-slate-300">
              Relevance Rationale for Learning Unit
            </label>
            <input
              type="text"
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              className="mt-1 w-full rounded border border-slate-200 p-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onSelectQuestion(selectedQ, rationale);
                  onClose();
                }}
                className="rounded-lg bg-indigo-600 px-4 py-1.5 font-bold text-xs text-white hover:bg-indigo-700"
              >
                Attach Question Version
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
