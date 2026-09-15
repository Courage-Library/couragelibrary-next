"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DrillSubmissionResult } from "@/services/mistake.service";
import { MistakeBookmarkButton } from "@/components/mistakes/mistake-bookmark-button";
import {
  CheckCircle2,
  Trophy,
  Coins,
  RotateCcw,
  BookOpen,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Flame,
  Check,
  X,
} from "lucide-react";

interface MistakeDrillResultProps {
  result: DrillSubmissionResult;
  onRestart?: () => void;
}

export function MistakeDrillResult({ result, onRestart }: MistakeDrillResultProps) {
  const [activeFilter, setActiveFilter] = useState<"ALL" | "CORRECT" | "INCORRECT">("ALL");
  const [expandedQuestions, setExpandedQuestions] = useState<Record<string, boolean>>({});

  const summary = result.summary || {
    total_questions: 0,
    correct_count: 0,
    accuracy_pct: 0,
    mastered_count: 0,
    revisiting_count: 0,
    unresolved_count: 0,
    coins_awarded: 0,
  };

  const evaluations = result.evaluations || [];

  const toggleExpand = (qId: string) => {
    setExpandedQuestions((prev) => ({
      ...prev,
      [qId]: !prev[qId],
    }));
  };

  const filteredEvaluations = evaluations.filter((ev) => {
    if (activeFilter === "CORRECT") return ev.is_correct;
    if (activeFilter === "INCORRECT") return !ev.is_correct;
    return true;
  });

  const isPerfect = summary.accuracy_pct === 100;
  const isGood = summary.accuracy_pct >= 70;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* 1. Score & Mastery Header */}
      <Card className="p-6 sm:p-8 bg-white border-slate-200 shadow-sm rounded-3xl overflow-hidden relative">
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <div
            className={`w-20 h-20 rounded-2xl flex items-center justify-center shrink-0 border ${
              isPerfect
                ? "bg-amber-50 border-amber-200 text-amber-600"
                : isGood
                ? "bg-emerald-50 border-emerald-200 text-emerald-600"
                : "bg-blue-50 border-blue-200 text-blue-600"
            }`}
          >
            {isPerfect ? (
              <Trophy className="w-10 h-10" />
            ) : isGood ? (
              <CheckCircle2 className="w-10 h-10" />
            ) : (
              <Sparkles className="w-10 h-10" />
            )}
          </div>

          <div className="space-y-1.5 text-center sm:text-left flex-1">
            <div className="flex items-center justify-center sm:justify-start gap-2">
              <Badge variant="indigo" className="text-xs px-2.5 py-0.5">
                Drill Completed
              </Badge>
              {summary.coins_awarded > 0 && (
                <Badge variant="outline" className="text-xs font-bold text-amber-700 bg-amber-50 border-amber-200 flex items-center gap-1">
                  <Coins className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                  +{summary.coins_awarded} Coins
                </Badge>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl font-black text-slate-900">
              {isPerfect
                ? "Flawless Performance!"
                : isGood
                ? "Great Remediation Progress!"
                : "Good Effort, Keep Practicing!"}
            </h1>

            <p className="text-xs sm:text-sm text-slate-600">
              You scored <strong className="text-slate-900">{summary.correct_count}</strong> out of{" "}
              <strong className="text-slate-900">{summary.total_questions}</strong> ({summary.accuracy_pct}% Accuracy).
            </p>
          </div>
        </div>

        {/* 2. Mastery Metric Badges */}
        <div className="grid grid-cols-3 gap-3 pt-6 mt-6 border-t border-slate-100">
          <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-100 text-center space-y-0.5">
            <span className="text-xl sm:text-2xl font-black text-emerald-800 block">
              {summary.mastered_count}
            </span>
            <span className="text-[11px] font-bold text-emerald-700 flex items-center justify-center gap-1">
              <Trophy className="w-3 h-3" /> Newly Mastered
            </span>
            <span className="text-[10px] text-emerald-600">Reached 2x streak</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-100 text-center space-y-0.5">
            <span className="text-xl sm:text-2xl font-black text-amber-800 block">
              {summary.revisiting_count}
            </span>
            <span className="text-[11px] font-bold text-amber-700 flex items-center justify-center gap-1">
              <Flame className="w-3 h-3" /> Revisiting
            </span>
            <span className="text-[10px] text-amber-600">1x correct streak</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-center space-y-0.5">
            <span className="text-xl sm:text-2xl font-black text-slate-800 block">
              {summary.unresolved_count}
            </span>
            <span className="text-[11px] font-bold text-slate-700 flex items-center justify-center gap-1">
              <RotateCcw className="w-3 h-3" /> Unresolved
            </span>
            <span className="text-[10px] text-slate-500">Streak reset to 0</span>
          </div>
        </div>
      </Card>

      {/* 3. Action Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200">
        <Link href="/mistakes">
          <Button variant="outline" size="sm" className="font-semibold text-slate-700 hover:text-slate-900 border-slate-200">
            <BookOpen className="w-4 h-4 mr-1.5" /> Return to Mistake Vault
          </Button>
        </Link>

        {onRestart && (
          <Button
            size="sm"
            onClick={onRestart}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-xs flex items-center gap-1.5"
          >
            <RotateCcw className="w-4 h-4" /> Start Another Drill
          </Button>
        )}
      </div>

      {/* 4. Detailed Question Review Accordion */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-bold text-slate-900">
            Detailed Solution Review ({evaluations.length} Questions)
          </h2>

          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveFilter("ALL")}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                activeFilter === "ALL" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              All ({evaluations.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter("CORRECT")}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                activeFilter === "CORRECT" ? "bg-white text-emerald-700 shadow-xs" : "text-slate-600 hover:text-emerald-700"
              }`}
            >
              Correct ({summary.correct_count})
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter("INCORRECT")}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                activeFilter === "INCORRECT" ? "bg-white text-rose-700 shadow-xs" : "text-slate-600 hover:text-rose-700"
              }`}
            >
              Incorrect ({summary.total_questions - summary.correct_count})
            </button>
          </div>
        </div>

        {filteredEvaluations.map((ev, idx) => {
          const isExpanded = expandedQuestions[ev.question_id] ?? true;
          return (
            <Card key={ev.question_id} className="p-5 bg-white border-slate-200 rounded-2xl space-y-4">
              {/* Question Item Header */}
              <div
                className="flex items-start justify-between gap-3 cursor-pointer select-none"
                onClick={() => toggleExpand(ev.question_id)}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 mt-0.5 ${
                      ev.is_correct
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-rose-100 text-rose-800"
                    }`}
                  >
                    {idx + 1}
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge
                        variant={ev.is_correct ? "success" : "destructive"}
                        className="text-[10px] font-bold px-2 py-0.5 flex items-center gap-1"
                      >
                        {ev.is_correct ? (
                          <>
                            <Check className="w-3 h-3" /> Correct
                          </>
                        ) : (
                          <>
                            <X className="w-3 h-3" /> Incorrect
                          </>
                        )}
                      </Badge>

                      <span className="text-[11px] font-semibold text-slate-500">
                        Streak: {ev.previous_consecutive} → <strong className="text-slate-900">{ev.new_consecutive}/2</strong>
                      </span>

                      {ev.new_status === "MASTERED" && (
                        <Badge variant="outline" className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border-emerald-200">
                          🏆 Mastered
                        </Badge>
                      )}
                    </div>

                    <p className="text-xs sm:text-sm font-semibold text-slate-900 leading-snug line-clamp-2">
                      {ev.question_text}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <MistakeBookmarkButton questionId={ev.question_id} variant="icon" />
                  <button
                    type="button"
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
                    aria-label="Toggle details"
                  >
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Collapsible Content */}
              {isExpanded && (
                <div className="space-y-4 pt-3 border-t border-slate-100 text-xs">
                  {/* Options Comparison */}
                  <div className="grid grid-cols-1 gap-2">
                    {ev.options.map((opt) => {
                      const isCandidatePick = ev.selected_option_key === opt.option_key;
                      const isCorrectAnswer = ev.correct_option_key === opt.option_key;

                      let rowClass = "border-slate-200 bg-slate-50/50 text-slate-700";
                      if (isCorrectAnswer) {
                        rowClass = "border-emerald-300 bg-emerald-50/70 text-emerald-950 font-medium";
                      } else if (isCandidatePick && !isCorrectAnswer) {
                        rowClass = "border-rose-300 bg-rose-50/70 text-rose-950 font-medium";
                      }

                      return (
                        <div
                          key={opt.id || opt.option_key}
                          className={`p-3 rounded-xl border flex items-start justify-between gap-3 text-xs ${rowClass}`}
                        >
                          <div className="flex items-start gap-2.5">
                            <span className="font-bold shrink-0">{opt.option_key}.</span>
                            <span>{opt.content_text || opt.option_text}</span>
                          </div>

                          <div className="shrink-0 flex items-center gap-1.5">
                            {isCorrectAnswer && (
                              <Badge variant="success" className="text-[10px] font-bold px-2 py-0.5">
                                Correct Answer
                              </Badge>
                            )}
                            {isCandidatePick && (
                              <Badge
                                variant={isCorrectAnswer ? "outline" : "destructive"}
                                className="text-[10px] font-bold px-2 py-0.5"
                              >
                                Your Selection
                              </Badge>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Solution Explanation */}
                  {ev.explanation && (
                    <div className="p-4 rounded-xl bg-blue-50/50 border border-blue-100 space-y-1.5">
                      <span className="text-[11px] font-bold text-blue-900 flex items-center gap-1">
                        <BookOpen className="w-3.5 h-3.5 text-blue-600" /> Authoritative Explanation
                      </span>
                      <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line">
                        {ev.explanation}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
