"use client";

import React, { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ActiveAttemptSession } from "@/services/assessment.service";
import { AssessmentTimer } from "@/components/assessment/assessment-timer";
import { QuestionRenderer } from "@/components/assessment/question-renderer";
import { QuestionOptions } from "@/components/assessment/question-options";
import { QuestionPalette, QuestionStatus } from "@/components/assessment/question-palette";
import { SubmitDialog } from "@/components/assessment/submit-dialog";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  Bookmark,
  Send,
  RotateCcw,
  Menu,
  X,
} from "lucide-react";

interface MockTestPlayerClientProps {
  session: ActiveAttemptSession;
}

interface SavedAnswerState {
  selectedOption: string | null;
  isMarkedForReview: boolean;
  timeSpentSeconds: number;
}

export function MockTestPlayerClient({ session }: MockTestPlayerClientProps) {
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, SavedAnswerState>>(() => {
    const initial: Record<string, SavedAnswerState> = {};
    session.questions.forEach((q) => {
      if (q.savedAnswer) {
        initial[q.mockQuestionId] = q.savedAnswer;
      }
    });
    return initial;
  });

  const [isSubmitOpen, setIsSubmitOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMobilePaletteOpen, setIsMobilePaletteOpen] = useState(false);

  const currentQ = session.questions[currentIndex];
  const currentAnswer = answers[currentQ?.mockQuestionId] || { selectedOption: null, isMarkedForReview: false, timeSpentSeconds: 0 };

  // Calculate palette items
  const paletteItems = session.questions.map((q) => {
    const ans = answers[q.mockQuestionId];
    let status: QuestionStatus = "unanswered";

    if (ans?.selectedOption && ans?.isMarkedForReview) {
      status = "marked_answered";
    } else if (ans?.selectedOption) {
      status = "answered";
    } else if (ans?.isMarkedForReview) {
      status = "marked";
    }

    return {
      questionOrder: q.questionOrder,
      status,
    };
  });

  // Calculate counts
  const answeredCount = Object.values(answers).filter((a) => a.selectedOption !== null).length;
  const markedCount = Object.values(answers).filter((a) => a.isMarkedForReview).length;
  const unansweredCount = session.questions.length - answeredCount;

  // Handle Option Select
  const handleSelectOption = (optionKey: string) => {
    const newSelected = currentAnswer.selectedOption === optionKey ? null : optionKey;
    const updated = {
      ...currentAnswer,
      selectedOption: newSelected,
    };

    setAnswers((prev) => ({
      ...prev,
      [currentQ.mockQuestionId]: updated,
    }));

    // Fire background save
    fetch("/api/assessment/save-answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        attemptId: session.attemptId,
        mockQuestionId: currentQ.mockQuestionId,
        selectedOption: newSelected,
        isMarkedForReview: updated.isMarkedForReview,
        timeSpentSeconds: updated.timeSpentSeconds,
      }),
    }).catch(() => {});
  };

  // Toggle Mark for Review
  const handleToggleReview = () => {
    const updated = {
      ...currentAnswer,
      isMarkedForReview: !currentAnswer.isMarkedForReview,
    };

    setAnswers((prev) => ({
      ...prev,
      [currentQ.mockQuestionId]: updated,
    }));

    fetch("/api/assessment/save-answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        attemptId: session.attemptId,
        mockQuestionId: currentQ.mockQuestionId,
        selectedOption: updated.selectedOption,
        isMarkedForReview: updated.isMarkedForReview,
        timeSpentSeconds: updated.timeSpentSeconds,
      }),
    }).catch(() => {});
  };

  // Clear Response
  const handleClearResponse = () => {
    const updated = {
      ...currentAnswer,
      selectedOption: null,
    };

    setAnswers((prev) => ({
      ...prev,
      [currentQ.mockQuestionId]: updated,
    }));

    fetch("/api/assessment/save-answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        attemptId: session.attemptId,
        mockQuestionId: currentQ.mockQuestionId,
        selectedOption: null,
        isMarkedForReview: updated.isMarkedForReview,
        timeSpentSeconds: updated.timeSpentSeconds,
      }),
    }).catch(() => {});
  };

  // Submit Attempt
  const handleSubmitAttempt = useCallback(async () => {
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/assessment/submit-attempt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attemptId: session.attemptId }),
      });
      const data = await res.json();
      if (data.success) {
        router.push(`/mock-tests/${session.attemptId}/result`);
      }
    } catch {
      setIsSubmitting(false);
    }
  }, [session.attemptId, router]);

  return (
    <div className="fixed inset-0 z-50 bg-slate-100 flex flex-col overflow-hidden">
      {/* Test Player Header */}
      <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 text-white font-extrabold text-xs flex items-center justify-center">
            CL
          </div>
          <div>
            <h1 className="font-bold text-sm text-slate-900 truncate max-w-[200px] sm:max-w-md">
              {session.testTitle}
            </h1>
            <span className="text-[11px] text-slate-400 font-medium hidden sm:inline">
              Candidate Examination Arena
            </span>
          </div>
        </div>

        {/* Section Tabs (Desktop) */}
        {session.sections.length > 1 && (
          <div className="hidden md:flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
            {session.sections.map((sec) => (
              <button
                key={sec.id}
                type="button"
                onClick={() => {
                  const firstInSec = session.questions.findIndex((q) => q.sectionId === sec.id);
                  if (firstInSec !== -1) setCurrentIndex(firstInSec);
                }}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  currentQ?.sectionId === sec.id
                    ? "bg-white text-blue-700 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {sec.name}
              </button>
            ))}
          </div>
        )}

        {/* Timer & Controls */}
        <div className="flex items-center gap-2.5">
          <AssessmentTimer
            initialRemainingSeconds={session.remainingSeconds}
            onTimeExpired={handleSubmitAttempt}
          />
          <Button
            size="sm"
            variant="default"
            className="bg-emerald-600 hover:bg-emerald-700 font-bold text-xs"
            onClick={() => setIsSubmitOpen(true)}
          >
            <Send className="w-3.5 h-3.5 mr-1" /> Submit
          </Button>
          <button
            type="button"
            className="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100"
            onClick={() => setIsMobilePaletteOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Test Player Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Main Question Viewport */}
        <main className="flex-1 bg-white p-4 sm:p-8 overflow-y-auto flex flex-col justify-between">
          <div className="max-w-3xl w-full mx-auto space-y-6">
            <QuestionRenderer
              questionNumber={currentQ?.questionOrder || 1}
              questionText={currentQ?.questionText || ""}
              marks={currentQ?.marks || 2}
              negativeMark={currentQ?.negativeMark || 0.5}
              sectionName={currentQ?.sectionName}
            />

            <QuestionOptions
              options={currentQ?.options || []}
              selectedOption={currentAnswer.selectedOption}
              onSelectOption={handleSelectOption}
            />
          </div>

          {/* Bottom Action Footer */}
          <div className="max-w-3xl w-full mx-auto pt-6 mt-8 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant={currentAnswer.isMarkedForReview ? "secondary" : "outline"}
                size="sm"
                className={currentAnswer.isMarkedForReview ? "bg-purple-50 text-purple-700 border-purple-300" : ""}
                onClick={handleToggleReview}
              >
                <Bookmark className="w-3.5 h-3.5 mr-1.5" />
                {currentAnswer.isMarkedForReview ? "Marked" : "Mark for Review"}
              </Button>
              {currentAnswer.selectedOption && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleClearResponse}
                  className="text-xs text-slate-500 hover:text-slate-900"
                >
                  <RotateCcw className="w-3.5 h-3.5 mr-1" /> Clear
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={currentIndex === 0}
                onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
              >
                <ChevronLeft className="w-4 h-4 mr-1" /> Prev
              </Button>
              <Button
                type="button"
                variant="default"
                size="sm"
                disabled={currentIndex === session.questions.length - 1}
                onClick={() => setCurrentIndex((prev) => Math.min(session.questions.length - 1, prev + 1))}
              >
                Next <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        </main>

        {/* Question Palette Sidebar (Desktop) */}
        <aside className="hidden lg:block w-80 bg-slate-50 border-l border-slate-200 p-5 overflow-y-auto shrink-0">
          <h3 className="font-bold text-xs text-slate-900 uppercase tracking-wider font-mono mb-4">
            Question Palette
          </h3>
          <QuestionPalette
            questions={paletteItems}
            currentOrder={currentQ?.questionOrder || 1}
            onSelectQuestion={(order) => {
              const idx = session.questions.findIndex((q) => q.questionOrder === order);
              if (idx !== -1) setCurrentIndex(idx);
            }}
          />
        </aside>
      </div>

      {/* Mobile Palette Drawer */}
      {isMobilePaletteOpen && (
        <div className="fixed inset-0 z-50 lg:hidden bg-slate-900/50 backdrop-blur-xs flex justify-end">
          <div className="w-80 bg-white h-full p-5 overflow-y-auto space-y-4 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-sm text-slate-900">Question Palette</h3>
              <button
                type="button"
                onClick={() => setIsMobilePaletteOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <QuestionPalette
              questions={paletteItems}
              currentOrder={currentQ?.questionOrder || 1}
              onSelectQuestion={(order) => {
                const idx = session.questions.findIndex((q) => q.questionOrder === order);
                if (idx !== -1) setCurrentIndex(idx);
                setIsMobilePaletteOpen(false);
              }}
            />
          </div>
        </div>
      )}

      {/* Submit Confirmation Dialog */}
      <SubmitDialog
        isOpen={isSubmitOpen}
        answeredCount={answeredCount}
        unansweredCount={unansweredCount}
        markedCount={markedCount}
        onConfirm={handleSubmitAttempt}
        onCancel={() => setIsSubmitOpen(false)}
        isSubmitting={isSubmitting}
      />
    </div>
  );
}