"use client";

import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ActiveAttemptSession } from "@/services/assessment.service";
import { AssessmentTimer } from "@/components/assessment/assessment-timer";
import { QuestionRenderer } from "@/components/assessment/question-renderer";
import { QuestionOptions } from "@/components/assessment/question-options";
import { QuestionPalette, QuestionStatus } from "@/components/assessment/question-palette";
import { SubmitDialog, SectionSubmitSummary } from "@/components/assessment/submit-dialog";
import { ReportIssueDialog } from "@/components/assessment/report-issue-dialog";
import { InstructionsModal } from "@/components/assessment/instructions-modal";
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
  Flag,
  HelpCircle,
  Maximize2,
  Minimize2,
  RefreshCw,
  Check,
} from "lucide-react";

interface MockTestPlayerClientProps {
  session: ActiveAttemptSession;
}

interface SavedAnswerState {
  selectedOption: string | null;
  isMarkedForReview: boolean;
  timeSpentSeconds: number;
}

type SaveStatus = "saved" | "saving" | "offline" | "synced";

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

  // Track visited questions for 5-state palette
  const [visitedQuestions, setVisitedQuestions] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    if (session.questions.length > 0) {
      initial.add(session.questions[0].mockQuestionId);
    }
    session.questions.forEach((q) => {
      if (q.savedAnswer && (q.savedAnswer.selectedOption || q.savedAnswer.isMarkedForReview)) {
        initial.add(q.mockQuestionId);
      }
    });
    return initial;
  });

  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [isSubmitOpen, setIsSubmitOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [isMobilePaletteOpen, setIsMobilePaletteOpen] = useState(false);
  const [isInstructionsOpen, setIsInstructionsOpen] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [undoClearState, setUndoClearState] = useState<{
    mockQuestionId: string;
    previousOption: string | null;
  } | null>(null);

  const undoTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const saveDebounceRef = useRef<NodeJS.Timeout | null>(null);

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
      setSaveStatus("synced");
      const syncedCount = await OfflineAnswerQueue.flush(session.attemptId);
      if (syncedCount > 0) {
        setTimeout(() => setSaveStatus("saved"), 3000);
      } else {
        setSaveStatus("saved");
      }
    };

    const handleOffline = () => {
      setSaveStatus("offline");
    };

    if (typeof window !== "undefined") {
      if (!navigator.onLine) setSaveStatus("offline");
      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [session.attemptId]);

  // Fullscreen change listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

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

      // 2. Set saving status
      if (navigator.onLine) {
        setSaveStatus("saving");
      } else {
        setSaveStatus("offline");
        return;
      }

      // 3. Fire background save
      if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
      saveDebounceRef.current = setTimeout(() => {
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
              setSaveStatus("saved");
            } else {
              setSaveStatus("offline");
            }
          })
          .catch(() => {
            setSaveStatus("offline");
          });
      }, 150);
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

  // Keyboard Shortcuts (1-4 / A-D, Arrows, M, C, ?)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if inside an input/textarea or if modal is open
      if (
        ["INPUT", "TEXTAREA", "SELECT"].includes((document.activeElement as HTMLElement)?.tagName) ||
        isSubmitOpen ||
        isInstructionsOpen ||
        isReportOpen
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
      } else if (e.key === "?") {
        setIsInstructionsOpen((prev) => !prev);
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
  }, [
    currentIndex,
    session.questions.length,
    isSubmitOpen,
    isInstructionsOpen,
    isReportOpen,
    currentQ,
    handleSelectOption,
    handleToggleReview,
    handleClearResponse,
  ]);

  // Submit Attempt (Flushes pending offline queue then evaluates server-side)
  const handleSubmitAttempt = useCallback(async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setSubmissionError(null);

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
        setSubmissionError(data.error || "Unable to finalize submission");
        setIsSubmitting(false);
      }
    } catch {
      setSubmissionError("Network communication error. Please retry.");
      setIsSubmitting(false);
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

  // Section-Wise Breakdown for Submit Dialog
  const sectionsSummary: SectionSubmitSummary[] = session.sections.map((sec) => {
    const secQuestions = session.questions.filter((q) => q.sectionId === sec.id);
    const secAnswered = secQuestions.filter((q) => Boolean(answers[q.mockQuestionId]?.selectedOption)).length;
    return {
      id: sec.id,
      name: sec.name,
      totalQuestions: secQuestions.length,
      answeredCount: secAnswered,
    };
  });

  return (
    <div className="fixed inset-0 z-50 bg-slate-100 flex flex-col overflow-hidden select-none">
      {/* Subtle Anti-Piracy Watermark Overlay */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 flex items-center justify-center opacity-[0.025] rotate-[-25deg] select-none text-slate-900 font-mono text-2xl font-black leading-loose text-center whitespace-pre"
      >
        {`COURAGE LIBRARY CANDIDATE ARENA\nSESSION ${session.attemptId.slice(0, 8)}\nCONFIDENTIAL`}
      </div>

      {/* Network Offline Status Banner */}
      {saveStatus === "offline" && (
        <div className="bg-amber-600 text-white text-[11px] font-bold py-1 px-4 text-center flex items-center justify-center gap-1.5 shadow-xs z-50">
          <WifiOff className="w-3.5 h-3.5" />
          <span>Offline mode active — answers are safely preserved on your device and will sync automatically.</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* EXAM PLAYER HEADER                                                        */}
      {/* ========================================================================= */}
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

        {/* Live Save Status Indicator */}
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-50 border border-slate-200/80 text-[11px] font-bold text-slate-600">
          {saveStatus === "saving" ? (
            <>
              <RefreshCw className="w-3 h-3 text-blue-600 animate-spin" />
              <span>Saving...</span>
            </>
          ) : saveStatus === "offline" ? (
            <>
              <WifiOff className="w-3 h-3 text-amber-600" />
              <span className="text-amber-700">Offline (Saved Locally)</span>
            </>
          ) : saveStatus === "synced" ? (
            <>
              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              <span className="text-emerald-700">All Synced</span>
            </>
          ) : (
            <>
              <Check className="w-3 h-3 text-emerald-600" />
              <span className="text-slate-600">Saved</span>
            </>
          )}
        </div>

        {/* Timer & Controls */}
        <div className="flex items-center gap-2">
          <AssessmentTimer
            initialRemainingSeconds={session.remainingSeconds}
            onTimeExpired={handleSubmitAttempt}
          />

          <button
            type="button"
            onClick={() => setIsInstructionsOpen(true)}
            title="View Instructions"
            className="hidden sm:flex items-center gap-1 p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition cursor-pointer text-xs font-bold"
          >
            <HelpCircle className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={toggleFullscreen}
            title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
            className="hidden sm:flex items-center p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition cursor-pointer"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          <Button
            size="sm"
            variant="default"
            disabled={isSubmitting}
            className="bg-emerald-600 hover:bg-emerald-700 font-bold text-xs shadow-xs"
            onClick={() => setIsSubmitOpen(true)}
          >
            <Send className="w-3.5 h-3.5 mr-1" /> Submit Test
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

      {/* ========================================================================= */}
      {/* EXAM WORKSPACE BODY                                                       */}
      {/* ========================================================================= */}
      <div className="flex-1 flex overflow-hidden z-10">
        {/* Main Question Viewport */}
        <main className="flex-1 bg-white p-4 sm:p-7 overflow-y-auto flex flex-col justify-between">
          <div className="max-w-3xl w-full mx-auto space-y-4 sm:space-y-6">
            {/* Section Switcher Tabs (Desktop) */}
            {session.sections.length > 1 && (
              <div className="flex items-center gap-1.5 p-1 bg-slate-100/90 rounded-2xl overflow-x-auto">
                {session.sections.map((sec) => {
                  const isCurrentSec = currentQ?.sectionId === sec.id;
                  const secQuestions = session.questions.filter((q) => q.sectionId === sec.id);
                  const secAnswered = secQuestions.filter((q) => Boolean(answers[q.mockQuestionId]?.selectedOption)).length;
                  return (
                    <button
                      key={sec.id}
                      type="button"
                      onClick={() => {
                        const firstInSec = session.questions.findIndex((q) => q.sectionId === sec.id);
                        if (firstInSec !== -1) setCurrentIndex(firstInSec);
                      }}
                      className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all whitespace-nowrap cursor-pointer flex items-center gap-2 ${
                        isCurrentSec
                          ? "bg-white text-blue-700 shadow-2xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      <span>{sec.name}</span>
                      <span className={`text-[10px] px-1.5 py-0.2 rounded-md ${isCurrentSec ? "bg-blue-50 text-blue-800" : "bg-slate-200 text-slate-700"}`}>
                        {secAnswered}/{secQuestions.length}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Question Text & Figure Renderer */}
            <QuestionRenderer
              questionNumber={currentQ?.questionOrder || 1}
              totalQuestions={session.questions.length}
              questionText={currentQ?.questionText || ""}
              questionImageUrl={currentQ?.questionImageUrl}
              marks={currentQ?.marks || 2}
              negativeMark={currentQ?.negativeMark || 0.5}
              sectionName={currentQ?.sectionName}
            />

            {/* Clickable Option Cards */}
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

              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!currentAnswer.selectedOption}
                onClick={handleClearResponse}
                className="text-xs text-slate-500 hover:text-red-700 hover:bg-red-50 font-semibold disabled:opacity-40"
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1" /> Clear Response
              </Button>

              <button
                type="button"
                onClick={() => setIsReportOpen(true)}
                title="Report issue with question"
                className="p-2 text-slate-400 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition text-xs font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Flag className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Report</span>
              </button>
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
                <ChevronLeft className="w-4 h-4 mr-1" /> Previous
              </Button>

              {currentIndex === session.questions.length - 1 ? (
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  onClick={() => setIsSubmitOpen(true)}
                  className="font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  Review &amp; Submit <Send className="w-3.5 h-3.5 ml-1.5" />
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  onClick={() => setCurrentIndex((prev) => Math.min(session.questions.length - 1, prev + 1))}
                  className="font-bold bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Next <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              )}
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
              Q {currentIndex + 1} of {session.questions.length}
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

      {/* ========================================================================= */}
      {/* MOBILE PALETTE DRAWER                                                     */}
      {/* ========================================================================= */}
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
        sectionsSummary={sectionsSummary}
        onConfirm={handleSubmitAttempt}
        onCancel={() => setIsSubmitOpen(false)}
        isSubmitting={isSubmitting}
        submissionError={submissionError}
      />

      {/* Report Issue Dialog */}
      <ReportIssueDialog
        isOpen={isReportOpen}
        questionNumber={currentQ?.questionOrder || 1}
        mockQuestionId={currentQ?.mockQuestionId || ""}
        onClose={() => setIsReportOpen(false)}
      />

      {/* Instructions Reference Modal */}
      <InstructionsModal
        isOpen={isInstructionsOpen}
        onClose={() => setIsInstructionsOpen(false)}
      />
    </div>
  );
}