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
      <div className="flex h-[80vh] w-full max-w-2xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 p-4">
          <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
            <HelpCircle className="h-5 w-5 text-blue-700" />
            <span>Search Canonical Question Bank</span>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search canonical question text..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs text-slate-900 focus:border-blue-600 focus:outline-none shadow-2xs"
              />
            </div>
            <button
              type="button"
              onClick={handleSearch}
              disabled={loading}
              className="rounded-lg bg-blue-700 px-4 py-2 font-bold text-xs text-white hover:bg-blue-800 disabled:opacity-50 transition shadow-2xs"
            >
              {loading ? "Searching..." : "Search"}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2 text-xs">
          {results.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              Enter a search query to find authentic questions.
            </div>
          ) : (
            results.map((q) => {
              const isSelected = selectedQ?.questionVersionId === q.questionVersionId;
              return (
                <button
                  key={q.questionVersionId}
                  type="button"
                  onClick={() => setSelectedQ(q)}
                  className={`w-full rounded-xl border p-3 text-left transition shadow-2xs ${
                    isSelected
                      ? "border-blue-500 bg-blue-50/60 shadow-xs"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-blue-700">
                      {q.questionVersionId}
                    </span>
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 border border-slate-200/60">
                      {q.questionType}
                    </span>
                  </div>
                  <p className="mt-1.5 text-slate-800 leading-relaxed">{q.questionText}</p>
                </button>
              );
            })
          )}
        </div>

        {selectedQ && (
          <div className="border-t border-slate-200 p-4 bg-slate-50/50">
            <label className="font-bold text-xs text-slate-800">
              Relevance Rationale for Learning Unit
            </label>
            <input
              type="text"
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none shadow-2xs"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onSelectQuestion(selectedQ, rationale);
                  onClose();
                }}
                className="rounded-lg bg-blue-700 px-4 py-1.5 font-bold text-xs text-white hover:bg-blue-800 transition shadow-2xs"
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
