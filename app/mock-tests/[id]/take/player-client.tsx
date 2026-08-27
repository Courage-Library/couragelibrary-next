"use client";

import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ActiveAttemptSession } from "@/services/assessment.service";
import { AssessmentTimer } from "@/components/assessment/assessment-timer";
import { QuestionRenderer } from "@/components/assessment/question-renderer";
import { QuestionOptions } from "@/components/assessment/question-options";
import { QuestionPalette, QuestionStatus } from "@/components/assessment/question-palette";
import { SubmitDialog } from "@/components/assessment/submit-dialog";
import { OfflineAnswerQueue } from "@/lib/assessment/offline-queue";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  Bookmark,
  Send,
  RotateCcw,
  Menu,
  X,
  WifiOff,
  CheckCircle2,
  Undo2,
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

  // Initialize answers from session
  const [answers, setAnswers] = useState<Record<string, SavedAnswerState>>(() => {
    const initial: Record<string, SavedAnswerState> = {};
    session.questions.forEach((q) => {
      if (q.savedAnswer) {
        initial[q.mockQuestionId] = q.savedAnswer;
      }
    });
    return initial;
  });

  // Track visited questions for 5-state palette (Question 0 is visited on initial load)
  const [visitedQuestions, setVisitedQuestions] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    if (session.questions.length > 0) {
      initial.add(session.questions[0].mockQuestionId);
    }
    // Also mark questions with existing saved answers as visited
    session.questions.forEach((q) => {
      if (q.savedAnswer && (q.savedAnswer.selectedOption || q.savedAnswer.isMarkedForReview)) {
        initial.add(q.mockQuestionId);
      }
    });
    return initial;
  });

  const [isSubmitOpen, setIsSubmitOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMobilePaletteOpen, setIsMobilePaletteOpen] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [syncedNotification, setSyncedNotification] = useState<string | null>(null);
  const [undoClearState, setUndoClearState] = useState<{
    mockQuestionId: string;
    previousOption: string | null;
  } | null>(null);

  const undoTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const currentQ = session.questions[currentIndex];
  const currentAnswer = useMemo(() => {
    return answers[currentQ?.mockQuestionId] || {
      selectedOption: null,
      isMarkedForReview: false,
      timeSpentSeconds: 0,
    };
  }, [answers, currentQ?.mockQuestionId]);

  // Mark current question as visited whenever index changes
  useEffect(() => {
    if (currentQ) {
      setVisitedQuestions((prev) => {
        if (prev.has(currentQ.mockQuestionId)) return prev;
        const next = new Set(prev);
        next.add(currentQ.mockQuestionId);
        return next;
      });
    }
  }, [currentQ]);

  // Network offline/online listeners with automatic queue flushing
  useEffect(() => {
    const handleOnline = async () => {
      setIsOffline(false);
      const syncedCount = await OfflineAnswerQueue.flush(session.attemptId);
      if (syncedCount > 0) {
        setSyncedNotification(`Back online — synced ${syncedCount} saved answer${syncedCount > 1 ? "s" : ""}`);
        setTimeout(() => setSyncedNotification(null), 3000);
      }
    };

    const handleOffline = () => {
      setIsOffline(true);
    };

    if (typeof window !== "undefined") {
      setIsOffline(!navigator.onLine);
      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [session.attemptId]);

  // Helper to persist answer via local buffer & background API
  const persistAnswer = useCallback(
    (mockQuestionId: string, updated: SavedAnswerState) => {
      // 1. Enqueue to localStorage for offline resilience
      OfflineAnswerQueue.enqueue(
        session.attemptId,
        mockQuestionId,
        updated.selectedOption,
        updated.isMarkedForReview,
        updated.timeSpentSeconds
      );

      // 2. Fire background save
      fetch("/api/assessment/save-answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attemptId: session.attemptId,
          mockQuestionId,
          selectedOption: updated.selectedOption,
          isMarkedForReview: updated.isMarkedForReview,
          timeSpentSeconds: updated.timeSpentSeconds,
        }),
      })
        .then((res) => {
          if (res.ok) {
            OfflineAnswerQueue.dequeue(session.attemptId, mockQuestionId);
          }
        })
        .catch(() => {
          // Network failed — safe in localStorage queue, will flush on reconnect
          setIsOffline(true);
        });
    },
    [session.attemptId]
  );

  // Handle Option Select
  const handleSelectOption = useCallback(
    (optionKey: string) => {
      if (!currentQ) return;
      const newSelected = currentAnswer.selectedOption === optionKey ? null : optionKey;
      const updated: SavedAnswerState = {
        ...currentAnswer,
        selectedOption: newSelected,
      };

      setAnswers((prev) => ({
        ...prev,
        [currentQ.mockQuestionId]: updated,
      }));

      persistAnswer(currentQ.mockQuestionId, updated);
    },
    [currentQ, currentAnswer, persistAnswer]
  );

  // Toggle Mark for Review
  const handleToggleReview = useCallback(() => {
    if (!currentQ) return;
    const updated: SavedAnswerState = {
      ...currentAnswer,
      isMarkedForReview: !currentAnswer.isMarkedForReview,
    };

    setAnswers((prev) => ({
      ...prev,
      [currentQ.mockQuestionId]: updated,
    }));

    persistAnswer(currentQ.mockQuestionId, updated);
  }, [currentQ, currentAnswer, persistAnswer]);

  // Clear Response with 2.5s Undo Capability
  const handleClearResponse = useCallback(() => {
    if (!currentQ || !currentAnswer.selectedOption) return;

    const previousOption = currentAnswer.selectedOption;
    const updated: SavedAnswerState = {
      ...currentAnswer,
      selectedOption: null,
    };

    setAnswers((prev) => ({
      ...prev,
      [currentQ.mockQuestionId]: updated,
    }));

    persistAnswer(currentQ.mockQuestionId, updated);

    // Set undo banner
    setUndoClearState({
      mockQuestionId: currentQ.mockQuestionId,
      previousOption,
    });

    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    undoTimeoutRef.current = setTimeout(() => {
      setUndoClearState(null);
    }, 2500);
  }, [currentQ, currentAnswer, persistAnswer]);

  // Restore Cleared Answer
  const handleUndoClear = useCallback(() => {
    if (!undoClearState) return;

    const { mockQuestionId, previousOption } = undoClearState;
    const existing = answers[mockQuestionId] || {
      selectedOption: null,
      isMarkedForReview: false,
      timeSpentSeconds: 0,
    };

    const restored: SavedAnswerState = {
      ...existing,
      selectedOption: previousOption,
    };

    setAnswers((prev) => ({
      ...prev,
      [mockQuestionId]: restored,
    }));

    persistAnswer(mockQuestionId, restored);
    setUndoClearState(null);
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
  }, [undoClearState, answers, persistAnswer]);

  // Keyboard Shortcuts (1-4 / A-D, Arrows, M, C)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if inside an input/textarea or if submit modal is open
      if (
        ["INPUT", "TEXTAREA", "SELECT"].includes((document.activeElement as HTMLElement)?.tagName) ||
        isSubmitOpen
      ) {
        return;
      }

      if (e.key === "ArrowRight" || e.key === "n" || e.key === "N") {
        if (currentIndex < session.questions.length - 1) {
          setCurrentIndex((prev) => prev + 1);
        }
      } else if (e.key === "ArrowLeft" || e.key === "p" || e.key === "P") {
        if (currentIndex > 0) {
          setCurrentIndex((prev) => prev - 1);
        }
      } else if (e.key === "m" || e.key === "M") {
        handleToggleReview();
      } else if (e.key === "c" || e.key === "C") {
        handleClearResponse();
      } else {
        const keyMap: Record<string, string> = {
          "1": "A",
          "2": "B",
          "3": "C",
          "4": "D",
          a: "A",
          b: "B",
          c: "C",
          d: "D",
          A: "A",
          B: "B",
          C: "C",
          D: "D",
        };

        if (keyMap[e.key] && currentQ?.options?.some((o) => o.key === keyMap[e.key])) {
          handleSelectOption(keyMap[e.key]);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentIndex, session.questions.length, isSubmitOpen, currentQ, handleSelectOption, handleToggleReview, handleClearResponse]);

  // Submit Attempt (Flushes pending offline queue then evaluates server-side)
  const handleSubmitAttempt = useCallback(async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      // 1. Attempt final flush of any offline queued answers
      await OfflineAnswerQueue.flush(session.attemptId);

      // 2. Submit to server-authoritative evaluation route
      const res = await fetch("/api/assessment/submit-attempt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attemptId: session.attemptId }),
      });

      const data = await res.json();
      if (data.success) {
        OfflineAnswerQueue.clear(session.attemptId);
        router.push(`/mock-tests/${session.attemptId}/result`);
      } else {
        setIsSubmitting(false);
        setIsSubmitOpen(false);
      }
    } catch {
      setIsSubmitting(false);
      setIsSubmitOpen(false);
    }
  }, [session.attemptId, isSubmitting, router]);

  // Calculate 5-State Palette Items
  const paletteItems = session.questions.map((q) => {
    const ans = answers[q.mockQuestionId];
    const isVisited = visitedQuestions.has(q.mockQuestionId);
    let status: QuestionStatus = "not_visited";

    if (ans?.selectedOption && ans?.isMarkedForReview) {
      status = "marked_answered";
    } else if (ans?.selectedOption) {
      status = "answered";
    } else if (ans?.isMarkedForReview) {
      status = "marked";
    } else if (isVisited) {
      status = "not_answered";
    }

    return {
      questionOrder: q.questionOrder,
      status,
    };
  });

  // Calculate Counts for Summary Modal
  const answeredCount = Object.values(answers).filter((a) => a.selectedOption !== null).length;
  const markedCount = Object.values(answers).filter((a) => a.isMarkedForReview).length;
  const unansweredCount = session.questions.length - answeredCount;

  return (
    <div className="fixed inset-0 z-50 bg-slate-100 flex flex-col overflow-hidden select-none">
      {/* Subtle Anti-Piracy Watermark Overlay */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 flex items-center justify-center opacity-[0.03] rotate-[-25deg] select-none text-slate-900 font-mono text-2xl font-black leading-loose text-center whitespace-pre"
      >
        {`COURAGE LIBRARY CANDIDATE ARENA\nSESSION ${session.attemptId.slice(0, 8)}\nCONFIDENTIAL`}
      </div>

      {/* Network Status Banners */}
      {isOffline && (
        <div className="bg-amber-600 text-white text-[11px] font-bold py-1 px-4 text-center flex items-center justify-center gap-1.5 shadow-xs z-50">
          <WifiOff className="w-3.5 h-3.5" />
          <span>Offline mode active — your answers are buffered locally and will sync automatically.</span>
        </div>
      )}

      {syncedNotification && (
        <div className="bg-emerald-600 text-white text-[11px] font-bold py-1 px-4 text-center flex items-center justify-center gap-1.5 shadow-xs z-50 animate-in fade-in">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>{syncedNotification}</span>
        </div>
      )}

      {/* Test Player Header */}
      <header className="h-14 sm:h-16 bg-white border-b border-slate-200 px-3 sm:px-6 flex items-center justify-between shrink-0 z-10">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-blue-600 text-white font-black text-xs flex items-center justify-center shrink-0 shadow-xs">
            CL
          </div>
          <div className="min-w-0">
            <h1 className="font-bold text-xs sm:text-sm text-slate-900 truncate max-w-[150px] sm:max-w-md">
              {session.testTitle}
            </h1>
            <span className="text-[10px] text-slate-400 font-semibold hidden sm:inline font-mono">
              Attempt #{session.attemptId.slice(0, 6)}
            </span>
          </div>
        </div>

        {/* Section Tabs (Desktop) */}
        {session.sections.length > 1 && (
          <div className="hidden md:flex items-center gap-1 p-1 bg-slate-100 rounded-xl max-w-md overflow-x-auto">
            {session.sections.map((sec) => (
              <button
                key={sec.id}
                type="button"
                onClick={() => {
                  const firstInSec = session.questions.findIndex((q) => q.sectionId === sec.id);
                  if (firstInSec !== -1) setCurrentIndex(firstInSec);
                }}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all whitespace-nowrap cursor-pointer ${
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
        <div className="flex items-center gap-2">
          <AssessmentTimer
            initialRemainingSeconds={session.remainingSeconds}
            onTimeExpired={handleSubmitAttempt}
          />
          <Button
            size="sm"
            variant="default"
            disabled={isSubmitting}
            className="bg-emerald-600 hover:bg-emerald-700 font-bold text-xs shadow-xs"
            onClick={() => setIsSubmitOpen(true)}
          >
            <Send className="w-3.5 h-3.5 mr-1" /> Submit
          </Button>
          <button
            type="button"
            className="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100 cursor-pointer"
            onClick={() => setIsMobilePaletteOpen(true)}
            aria-label="Open Question Palette"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Test Player Body */}
      <div className="flex-1 flex overflow-hidden z-10">
        {/* Main Question Viewport */}
        <main className="flex-1 bg-white p-4 sm:p-8 overflow-y-auto flex flex-col justify-between">
          <div className="max-w-3xl w-full mx-auto space-y-4 sm:space-y-6">
            <QuestionRenderer
              questionNumber={currentQ?.questionOrder || 1}
              questionText={currentQ?.questionText || ""}
              questionImageUrl={currentQ?.questionImageUrl}
              marks={currentQ?.marks || 2}
              negativeMark={currentQ?.negativeMark || 0.5}
              sectionName={currentQ?.sectionName}
            />

            <QuestionOptions
              options={currentQ?.options || []}
              optionsType={currentQ?.optionsType}
              selectedOption={currentAnswer.selectedOption}
              onSelectOption={handleSelectOption}
              disabled={isSubmitting}
            />
          </div>

          {/* Bottom Action Footer */}
          <div className="max-w-3xl w-full mx-auto pt-4 mt-6 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant={currentAnswer.isMarkedForReview ? "secondary" : "outline"}
                size="sm"
                className={
                  currentAnswer.isMarkedForReview
                    ? "bg-purple-50 text-purple-700 border-purple-300 font-bold"
                    : "font-semibold"
                }
                onClick={handleToggleReview}
              >
                <Bookmark className="w-3.5 h-3.5 mr-1.5" />
                {currentAnswer.isMarkedForReview ? "Marked for Review" : "Mark for Review"}
              </Button>
              {currentAnswer.selectedOption && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleClearResponse}
                  className="text-xs text-slate-500 hover:text-red-700 hover:bg-red-50 font-semibold"
                >
                  <RotateCcw className="w-3.5 h-3.5 mr-1" /> Clear Response
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
                className="font-bold"
              >
                <ChevronLeft className="w-4 h-4 mr-1" /> Prev
              </Button>
              <Button
                type="button"
                variant="default"
                size="sm"
                disabled={currentIndex === session.questions.length - 1}
                onClick={() => setCurrentIndex((prev) => Math.min(session.questions.length - 1, prev + 1))}
                className="font-bold bg-blue-600 hover:bg-blue-700"
              >
                Next <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        </main>

        {/* Question Palette Sidebar (Desktop) */}
        <aside className="hidden lg:block w-80 bg-slate-50 border-l border-slate-200 p-5 overflow-y-auto shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-xs text-slate-900 uppercase tracking-wider font-mono">
              Question Palette
            </h3>
            <span className="text-[11px] text-slate-400 font-mono">
              {currentIndex + 1} of {session.questions.length}
            </span>
          </div>
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
        <div className="fixed inset-0 z-50 lg:hidden bg-slate-900/60 backdrop-blur-xs flex justify-end animate-in fade-in">
          <div className="w-80 bg-white h-full p-5 overflow-y-auto space-y-4 shadow-2xl flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="font-bold text-sm text-slate-900">Question Palette</h3>
                <button
                  type="button"
                  onClick={() => setIsMobilePaletteOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {session.sections.length > 1 && (
                <div className="flex items-center gap-1 overflow-x-auto pb-1">
                  {session.sections.map((sec) => (
                    <button
                      key={sec.id}
                      type="button"
                      onClick={() => {
                        const firstInSec = session.questions.findIndex((q) => q.sectionId === sec.id);
                        if (firstInSec !== -1) setCurrentIndex(firstInSec);
                      }}
                      className={`px-2.5 py-1 text-[11px] font-bold rounded-lg whitespace-nowrap ${
                        currentQ?.sectionId === sec.id
                          ? "bg-blue-600 text-white"
                          : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {sec.name}
                    </button>
                  ))}
                </div>
              )}

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

            <Button
              size="sm"
              variant="default"
              className="w-full bg-emerald-600 hover:bg-emerald-700 font-bold"
              onClick={() => {
                setIsMobilePaletteOpen(false);
                setIsSubmitOpen(true);
              }}
            >
              <Send className="w-3.5 h-3.5 mr-1" /> Submit Test
            </Button>
          </div>
        </div>
      )}

      {/* Undo Clear Toast */}
      {undoClearState && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white text-xs font-bold px-4 py-2.5 rounded-2xl shadow-xl flex items-center gap-3 animate-in slide-in-from-bottom-2">
          <span>Response cleared</span>
          <button
            type="button"
            onClick={handleUndoClear}
            className="bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1 rounded-lg text-xs font-extrabold flex items-center gap-1 transition cursor-pointer"
          >
            <Undo2 className="w-3 h-3" /> Undo
          </button>
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