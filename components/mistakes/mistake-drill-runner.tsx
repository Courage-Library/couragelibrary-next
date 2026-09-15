"use client";

import React, { useState, useEffect, useCallback, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DrillQuestion, DrillSubmissionResult } from "@/services/mistake.service";
import { submitDrillAction } from "@/app/mistakes/actions";
import { MistakeBookmarkButton } from "@/components/mistakes/mistake-bookmark-button";
import { MistakeDrillResult } from "@/components/mistakes/mistake-drill-result";
import {
  ChevronLeft,
  ChevronRight,
  Zap,
  Clock,
  RotateCcw,
  Flame,
  StickyNote,
  HelpCircle,
  ArrowLeft,
  AlertTriangle,
  Send,
} from "lucide-react";

interface MistakeDrillRunnerProps {
  drillId: string;
  initialQuestions: DrillQuestion[];
  mode?: "PRACTICE" | "TIMED";
  onFinish?: () => void;
}

export function MistakeDrillRunner({
  drillId,
  initialQuestions,
  mode = "PRACTICE",
  onFinish,
}: MistakeDrillRunnerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<
    Record<string, { optionId: string; optionKey: string; timeSpent: number }>
  >({});
  const [isPending, startTransition] = useTransition();
  const [drillResult, setDrillResult] = useState<DrillSubmissionResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Timers
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [currentQuestionSeconds, setCurrentQuestionSeconds] = useState(0);
  
  useEffect(() => {
    if (drillResult) return;
    const interval = setInterval(() => {
      setTotalSeconds((t) => t + 1);
      setCurrentQuestionSeconds((q) => q + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [drillResult, mode]);

  const questions = initialQuestions;
  const currentQ = questions[currentIndex];
  const currentSelected = selectedAnswers[currentQ?.question_id]?.optionKey || null;

  const handleSelectOption = (optionKey: string) => {
    if (!currentQ) return;
    const opt = currentQ.options.find((o) => o.option_key === optionKey);
    if (!opt) return;

    setSelectedAnswers((prev) => ({
      ...prev,
      [currentQ.question_id]: {
        optionId: opt.id,
        optionKey: opt.option_key,
        timeSpent: (prev[currentQ.question_id]?.timeSpent || 0) + currentQuestionSeconds,
      },
    }));
  };

  const answeredCount = Object.keys(selectedAnswers).length;
  const progressPct = questions.length > 0 ? Math.round((answeredCount / questions.length) * 100) : 0;

  const handleSubmit = useCallback(async () => {
    setShowConfirmModal(false);
    setSubmitError(null);

    const responsesPayload = questions.map((q) => {
      const ans = selectedAnswers[q.question_id];
      return {
        vault_id: q.vault_id,
        question_id: q.question_id,
        selected_option_key: ans?.optionKey,
        selected_option_id: ans?.optionId,
        response_time_seconds: ans?.timeSpent || 30,
      };
    });

    startTransition(async () => {
      try {
        const res = await submitDrillAction(drillId, responsesPayload);
        if (res.success) {
          setDrillResult(res);
        } else {
          setSubmitError(res.error || "Failed to submit drill session. Please retry.");
        }
      } catch (err: any) {
        setSubmitError(err.message || "An unexpected error occurred during submission.");
      }
    });
  }, [drillId, questions, selectedAnswers]);

  if (drillResult) {
    return (
      <MistakeDrillResult
        result={drillResult}
        onRestart={onFinish}
      />
    );
  }

  if (!currentQ) {
    return (
      <div className="text-center py-16">
        <p className="text-slate-500 text-sm">No question available.</p>
      </div>
    );
  }

  const formatTimer = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* 1. Drill Top Workspace Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/mistakes">
            <Button variant="ghost" size="sm" className="text-slate-600 hover:text-slate-900 -ml-2 text-xs font-semibold">
              <ArrowLeft className="w-4 h-4 mr-1" /> Exit Drill
            </Button>
          </Link>
          <div className="h-4 w-px bg-slate-200 hidden sm:block" />
          <div className="flex items-center gap-2">
            <Badge variant="indigo" className="text-xs px-2.5 py-0.5">
              <Zap className="w-3 h-3 mr-1 text-amber-400 fill-amber-400" /> Remediation Drill
            </Badge>
            <span className="text-xs font-bold text-slate-700">
              Q{currentIndex + 1} of {questions.length}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Timer Display */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 font-mono text-xs font-bold text-slate-800">
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            <span>{formatTimer(totalSeconds)}</span>
          </div>

          <Button
            size="sm"
            onClick={() => {
              if (answeredCount < questions.length) {
                setShowConfirmModal(true);
              } else {
                handleSubmit();
              }
            }}
            disabled={isPending}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs flex items-center gap-1.5 rounded-xl"
          >
            {isPending ? (
              <span className="flex items-center gap-1.5">
                <RotateCcw className="w-3.5 h-3.5 animate-spin" /> Evaluating...
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <Send className="w-3.5 h-3.5" /> Submit Drill
              </span>
            )}
          </Button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
        <div
          className="bg-blue-600 h-full transition-all duration-300 ease-out"
          style={{ width: `${Math.max(5, progressPct)}%` }}
        />
      </div>

      {/* 2. Question Context & Failure Mode Banner (Phase 3D key feature) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="font-bold text-slate-800 bg-slate-100 px-2.5 py-1 rounded-lg text-xs flex items-center gap-1">
            <HelpCircle className="w-3.5 h-3.5 text-slate-500" />
            {currentQ.context?.cognitive_type_name || "Conceptual Gap"}
          </span>

          {(currentQ.context?.total_mistakes_count ?? 1) >= 2 && (
            <Badge variant="outline" className="text-[11px] font-bold text-amber-700 bg-amber-50 border-amber-200 flex items-center gap-1">
              <RotateCcw className="w-3 h-3" /> Wrong {currentQ.context?.total_mistakes_count}x
            </Badge>
          )}

          <span className="text-slate-500 text-xs font-semibold flex items-center gap-1">
            <Flame className="w-3.5 h-3.5 text-amber-500" />
            Streak: <strong className="text-slate-800">{currentQ.consecutive_correct}/2</strong>
          </span>
        </div>

        <MistakeBookmarkButton questionId={currentQ.question_id} variant="icon" />
      </div>

      {/* Personal Revision Note Callout (if available) */}
      {currentQ.context?.user_custom_notes && (
        <div className="p-3.5 rounded-2xl bg-indigo-50/70 border border-indigo-100 text-xs text-indigo-900 flex items-start gap-2.5">
          <StickyNote className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-bold text-[11px] text-indigo-950 uppercase tracking-wider block">
              Your Personal Revision Note:
            </span>
            <p className="text-indigo-900/90 leading-relaxed italic">
              &ldquo;{currentQ.context.user_custom_notes}&rdquo;
            </p>
          </div>
        </div>
      )}

      {/* 3. Main Question Prompt & Options */}
      <Card className="p-6 sm:p-8 bg-white border-slate-200 rounded-3xl shadow-xs space-y-6">
        <div className="space-y-3">
          <span className="text-xs font-bold text-blue-600 uppercase tracking-wider block">
            Question {currentIndex + 1}
          </span>
          <p className="text-base sm:text-lg font-medium text-slate-900 leading-relaxed whitespace-pre-line">
            {currentQ.question_text}
          </p>
        </div>

        {/* Options List (Manual selection, no auto-advance) */}
        <div className="space-y-2.5 pt-2">
          {currentQ.options.map((opt) => {
            const isSelected = currentSelected === opt.option_key;
            return (
              <button
                key={opt.id || opt.option_key}
                type="button"
                onClick={() => handleSelectOption(opt.option_key)}
                className={`w-full text-left p-4 rounded-2xl border transition-all flex items-start gap-3.5 select-none ${
                  isSelected
                    ? "bg-blue-50/80 border-blue-600 ring-2 ring-blue-600/20 shadow-xs"
                    : "bg-slate-50/60 border-slate-200 hover:bg-slate-100/80 hover:border-slate-300"
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors ${
                    isSelected
                      ? "bg-blue-600 text-white"
                      : "bg-white border border-slate-300 text-slate-700"
                  }`}
                >
                  {opt.option_key}
                </div>
                <div className="text-xs sm:text-sm text-slate-800 leading-relaxed pt-0.5 font-medium">
                  {opt.content_text || opt.option_text}
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      {/* 4. Navigation & Question Grid Palette */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={currentIndex === 0}
            onClick={() => {
              setCurrentQuestionSeconds(0);
              setCurrentIndex((prev) => Math.max(0, prev - 1));
            }}
            className="rounded-xl font-bold text-xs text-slate-700 border-slate-200"
          >
            <ChevronLeft className="w-4 h-4 mr-1" /> Previous
          </Button>

          {/* Question Dots */}
          <div className="flex items-center gap-1.5 flex-wrap justify-center max-w-md">
            {questions.map((q, idx) => {
              const isAnswered = !!selectedAnswers[q.question_id];
              const isCurrent = idx === currentIndex;
              return (
                <button
                  key={q.question_id}
                  type="button"
                  onClick={() => {
                    setCurrentQuestionSeconds(0);
                    setCurrentIndex(idx);
                  }}
                  className={`w-7 h-7 rounded-lg text-xs font-bold transition-all ${
                    isCurrent
                      ? "bg-blue-600 text-white ring-2 ring-blue-600/30"
                      : isAnswered
                      ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                      : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>

          <Button
            variant="default"
            size="sm"
            disabled={currentIndex === questions.length - 1}
            onClick={() => {
              setCurrentQuestionSeconds(0);
              setCurrentIndex((prev) => Math.min(questions.length - 1, prev + 1));
            }}
            className="rounded-xl font-bold text-xs bg-slate-900 hover:bg-slate-800 text-white"
          >
            Next <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>

        {submitError && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">
            {submitError}
          </div>
        )}
      </div>

      {/* Unanswered Questions Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <Card className="max-w-md w-full p-6 bg-white rounded-3xl border-slate-200 shadow-xl space-y-5">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="space-y-2 text-center">
              <h3 className="text-lg font-bold text-slate-900">Unanswered Questions</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                You have answered <strong className="text-slate-900">{answeredCount}</strong> of{" "}
                <strong className="text-slate-900">{questions.length}</strong> questions. Unanswered questions will be counted as incorrect and reset your streak.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowConfirmModal(false)}
                className="rounded-xl font-bold text-xs"
              >
                Keep Practicing
              </Button>
              <Button
                size="sm"
                onClick={handleSubmit}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs"
              >
                Confirm Submit
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
