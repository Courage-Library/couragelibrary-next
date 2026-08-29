"use client";

import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ActiveAttemptSession } from "@/services/assessment.service";
import { BrandLogo } from "@/components/brand/logo";
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
  ShieldAlert,
  AlertTriangle,
  Monitor,
  ArrowRight,
  ShieldCheck,
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

interface SecurityState {
  isFullscreen: boolean;
  fullscreenExitCount: number;
  tabSwitchCount: number;
  showFullscreenWarning: boolean;
  showTabSwitchWarning: boolean;
}

export function MockTestPlayerClient({ session }: MockTestPlayerClientProps) {
  const router = useRouter();

  // Safety Guard: Handle empty question state gracefully
  const hasQuestions = session.questions && session.questions.length > 0;

  // Pre-exam Fullscreen Gate State
  const [isExamStarted, setIsExamStarted] = useState(false);

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
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);

  // Central Security State
  const [securityState, setSecurityState] = useState<SecurityState>({
    isFullscreen: false,
    fullscreenExitCount: 0,
    tabSwitchCount: 0,
    showFullscreenWarning: false,
    showTabSwitchWarning: false,
  });

  const [undoClearState, setUndoClearState] = useState<{
    mockQuestionId: string;
    previousOption: string | null;
  } | null>(null);

  const undoTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const saveDebounceRef = useRef<NodeJS.Timeout | null>(null);

  const currentQ = hasQuestions ? session.questions[currentIndex] : null;
  const currentAnswer = useMemo(() => {
    if (!currentQ) {
      return { selectedOption: null, isMarkedForReview: false, timeSpentSeconds: 0 };
    }
    return (
      answers[currentQ.mockQuestionId] || {
        selectedOption: null,
        isMarkedForReview: false,
        timeSpentSeconds: 0,
      }
    );
  }, [answers, currentQ]);

  // Mark current question as visited whenever index changes
  useEffect(() => {
    if (currentQ && isExamStarted) {
      setVisitedQuestions((prev) => {
        if (prev.has(currentQ.mockQuestionId)) return prev;
        const next = new Set(prev);
        next.add(currentQ.mockQuestionId);
        return next;
      });
    }
  }, [currentQ, isExamStarted]);

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

  // Security: Fullscreen Change Listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isNowFullscreen = Boolean(document.fullscreenElement);
      setSecurityState((prev) => {
        if (!isNowFullscreen && prev.isFullscreen && isExamStarted) {
          // Exited fullscreen while exam active
          return {
            ...prev,
            isFullscreen: false,
            fullscreenExitCount: prev.fullscreenExitCount + 1,
            showFullscreenWarning: true,
          };
        }
        return {
          ...prev,
          isFullscreen: isNowFullscreen,
          showFullscreenWarning: isNowFullscreen ? false : prev.showFullscreenWarning,
        };
      });
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, [isExamStarted]);

  // Security: Tab Switch / Visibility Change Listener
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!isExamStarted) return;
      if (document.visibilityState === "hidden") {
        setSecurityState((prev) => ({
          ...prev,
          tabSwitchCount: prev.tabSwitchCount + 1,
        }));
      } else if (document.visibilityState === "visible") {
        setSecurityState((prev) => {
          if (prev.tabSwitchCount > 0) {
            return {
              ...prev,
              showTabSwitchWarning: true,
            };
          }
          return prev;
        });
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [isExamStarted]);

  // Explicit User Gesture Fullscreen Handler (Starts Exam)
  const handleStartExamWithFullscreen = useCallback(() => {
    if (document.documentElement.requestFullscreen) {
      document.documentElement
        .requestFullscreen()
        .then(() => {
          setSecurityState((prev) => ({
            ...prev,
            isFullscreen: true,
            showFullscreenWarning: false,
          }));
        })
        .catch(() => {
          // Browser or device restricted element-level fullscreen
        })
        .finally(() => {
          setIsExamStarted(true);
        });
    } else {
      setIsExamStarted(true);
    }
  }, []);

  // Re-enter Fullscreen Trigger
  const handleReturnToFullscreen = useCallback(() => {
    if (document.documentElement.requestFullscreen) {
      document.documentElement
        .requestFullscreen()
        .then(() => {
          setSecurityState((prev) => ({
            ...prev,
            isFullscreen: true,
            showFullscreenWarning: false,
          }));
        })
        .catch(() => {
          setSecurityState((prev) => ({
            ...prev,
            showFullscreenWarning: false,
          }));
        });
    } else {
      setSecurityState((prev) => ({
        ...prev,
        showFullscreenWarning: false,
      }));
    }
  }, []);

  const handleDismissTabWarning = () => {
    setSecurityState((prev) => ({
      ...prev,
      showTabSwitchWarning: false,
    }));
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

  // Prompt Confirmation for Clear Response
  const handleClearResponseClick = useCallback(() => {
    if (!currentQ || !currentAnswer.selectedOption) return;
    setIsClearConfirmOpen(true);
  }, [currentQ, currentAnswer.selectedOption]);

  // Execute Clear Response with 2.5s Undo Capability
  const executeClearResponse = useCallback(() => {
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
    setIsClearConfirmOpen(false);

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
      if (
        ["INPUT", "TEXTAREA", "SELECT"].includes((document.activeElement as HTMLElement)?.tagName) ||
        !isExamStarted ||
        isSubmitOpen ||
        isInstructionsOpen ||
        isReportOpen ||
        isClearConfirmOpen ||
        securityState.showFullscreenWarning ||
        securityState.showTabSwitchWarning
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
        handleClearResponseClick();
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
    isExamStarted,
    isSubmitOpen,
    isInstructionsOpen,
    isReportOpen,
    isClearConfirmOpen,
    securityState.showFullscreenWarning,
    securityState.showTabSwitchWarning,
    currentQ,
    handleSelectOption,
    handleToggleReview,
    handleClearResponseClick,
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
      if (data.success && data.resultId) {
        OfflineAnswerQueue.clear(session.attemptId);
        router.push(`/mock-tests/${session.attemptId}/result`);
      } else {
        setSubmissionError(
          data.error || "We couldn't complete your submission. Your responses are preserved. Please try again."
        );
        setIsSubmitting(false);
      }
    } catch {
      setSubmissionError("Network communication error. Your responses are preserved locally. Please try again.");
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

  // =========================================================================
  // SAFETY GUARD 1: Empty questions state
  // =========================================================================
  if (!hasQuestions) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl max-w-md w-full p-8 text-center space-y-5 border border-slate-200 shadow-xl">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto border border-amber-200">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-lg font-black text-slate-900">This Test is Not Ready Yet</h2>
            <p className="text-xs text-slate-500 font-medium leading-relaxed">
              The questions for this examination are being prepared. Your session is safe and has not been submitted.
            </p>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <Link href="/mock-tests" className="w-1/2">
              <Button variant="outline" size="sm" className="w-full text-xs font-bold">
                Back to Mocks
              </Button>
            </Link>
            <Button
              variant="default"
              size="sm"
              onClick={() => window.location.reload()}
              className="w-1/2 bg-blue-600 hover:bg-blue-700 text-xs font-bold"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1" /> Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // PRE-EXAM FULLSCREEN GATE (Explicit User Gesture to start in Fullscreen)
  // =========================================================================
  if (!isExamStarted) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-6 shadow-2xl border border-slate-200 text-center animate-in zoom-in-95">
          <div className="flex justify-center pb-1">
            <BrandLogo size="md" variant="full" />
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-black text-slate-900 tracking-tight">
              Ready to Begin Examination
            </h2>
            <p className="text-xs text-slate-500 font-medium">
              {session.testTitle}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2.5 text-center text-xs">
            <div className="p-3 rounded-2xl bg-blue-50/80 border border-blue-100">
              <span className="font-black text-blue-900 text-lg block">{session.questions.length}</span>
              <span className="text-blue-700 text-[11px] font-bold">Questions</span>
            </div>
            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
              <span className="font-black text-slate-900 text-lg block">{session.durationMinutes}m</span>
              <span className="text-slate-600 text-[11px] font-bold">Duration</span>
            </div>
            <div className="p-3 rounded-2xl bg-emerald-50/80 border border-emerald-100">
              <span className="font-black text-emerald-900 text-lg block">+{session.questions[0]?.marks || 2} / -{session.questions[0]?.negativeMark || 0.5}</span>
              <span className="text-emerald-700 text-[11px] font-bold">Marking</span>
            </div>
          </div>

          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-left space-y-2 text-xs text-slate-600">
            <div className="flex items-center gap-2 font-bold text-slate-800">
              <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
              <span>Examination Environment Rules:</span>
            </div>
            <ul className="space-y-1.5 pl-6 list-disc text-[11px] text-slate-600">
              <li>Fullscreen mode is required to maintain testing integrity.</li>
              <li>Responses are automatically saved and synchronized in real-time.</li>
              <li>When the timer expires, your test will be auto-submitted.</li>
            </ul>
          </div>

          <div className="space-y-2.5 pt-1">
            <Button
              type="button"
              size="lg"
              onClick={handleStartExamWithFullscreen}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-sm rounded-xl shadow-md cursor-pointer"
            >
              Enter Fullscreen &amp; Begin Test <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
            <Link href="/mock-tests" className="block text-xs font-semibold text-slate-400 hover:text-slate-600">
              Return to Mock Test Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // ACTIVE EXAM WORKSPACE
  // =========================================================================
  return (
    <div className="fixed inset-0 z-50 bg-slate-100 flex flex-col overflow-hidden select-none">
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
        <div className="flex items-center gap-3 min-w-0">
          {/* Official Canonical Courage Library Logo */}
          <BrandLogo size="sm" variant="full" showText={false} />
          <div className="h-6 w-px bg-slate-200 hidden sm:block" />
          <div className="min-w-0">
            <h1 className="font-extrabold text-xs sm:text-sm text-slate-900 truncate max-w-[150px] sm:max-w-md">
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
            title="View Instructions (?)"
            className="hidden sm:flex items-center gap-1 p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition cursor-pointer text-xs font-bold"
          >
            <HelpCircle className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={handleReturnToFullscreen}
            title={securityState.isFullscreen ? "Fullscreen Active" : "Enter Fullscreen"}
            className="hidden sm:flex items-center p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition cursor-pointer"
          >
            {securityState.isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
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
        <main className="relative flex-1 bg-white p-4 sm:p-7 overflow-y-auto flex flex-col justify-between">
          {/* Subtle Repeating Security Pattern Watermark (No Logo Image) */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-0 select-none overflow-hidden opacity-[0.025]"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='260' height='140' viewBox='0 0 260 140'%3E%3Ctext x='20' y='50' fill='%230f172a' font-family='sans-serif' font-size='12' font-weight='800' letter-spacing='2.5' transform='rotate(-20 20 50)'%3ECOURAGE LIBRARY%3C/text%3E%3Ctext x='150' y='120' fill='%230f172a' font-family='sans-serif' font-size='12' font-weight='800' letter-spacing='2.5' transform='rotate(-20 150 120)'%3ECOURAGE LIBRARY%3C/text%3E%3C/svg%3E")`,
              backgroundRepeat: "repeat",
            }}
          />

          <div className="relative z-10 max-w-3xl w-full mx-auto space-y-4 sm:space-y-6">
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
            {currentQ && (
              <QuestionRenderer
                questionNumber={currentQ.questionOrder}
                totalQuestions={session.questions.length}
                questionText={currentQ.questionText || ""}
                questionImageUrl={currentQ.questionImageUrl}
                marks={currentQ.marks || 2}
                negativeMark={currentQ.negativeMark || 0.5}
                sectionName={currentQ.sectionName}
              />
            )}

            {/* Clickable Option Cards */}
            {currentQ && (
              <QuestionOptions
                options={currentQ.options || []}
                optionsType={currentQ.optionsType}
                selectedOption={currentAnswer.selectedOption}
                onSelectOption={handleSelectOption}
                disabled={isSubmitting}
              />
            )}
          </div>

          {/* Bottom Action Footer */}
          <div className="relative z-10 max-w-3xl w-full mx-auto pt-4 mt-6 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
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
                onClick={handleClearResponseClick}
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

      {/* Clear Response Confirmation Modal */}
      {isClearConfirmOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 text-center space-y-4 shadow-2xl border border-slate-200 animate-in zoom-in-95">
            <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mx-auto border border-red-200">
              <RotateCcw className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-black text-slate-900">Clear Selected Response?</h3>
              <p className="text-xs text-slate-500 font-medium">
                Are you sure you want to clear your selected answer for Question {currentQ?.questionOrder}?
              </p>
            </div>
            <div className="flex items-center gap-2.5 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsClearConfirmOpen(false)}
                className="w-1/2 text-xs font-bold"
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={executeClearResponse}
                className="w-1/2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold"
              >
                Clear Response
              </Button>
            </div>
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

      {/* ========================================================================= */}
      {/* SECURITY MODAL 1: FULLSCREEN EXITED WARNING                               */}
      {/* ========================================================================= */}
      {securityState.showFullscreenWarning && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 text-center space-y-4 shadow-2xl border border-slate-200 animate-in zoom-in-95">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto border border-amber-200">
              <Monitor className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-black text-slate-900">Fullscreen Mode Exited</h3>
              <p className="text-xs text-slate-500 font-medium leading-relaxed">
                Examination rules require full-screen focus. Please return to fullscreen mode to continue your test.
              </p>
            </div>
            {securityState.fullscreenExitCount > 1 && (
              <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs font-bold text-amber-800">
                Notice #{securityState.fullscreenExitCount} &bull; Security events are recorded with your attempt.
              </div>
            )}
            <div className="pt-2">
              <Button
                type="button"
                size="md"
                onClick={handleReturnToFullscreen}
                className="w-full bg-blue-600 hover:bg-blue-700 font-extrabold text-xs rounded-xl shadow-xs"
              >
                Return to Fullscreen <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECURITY MODAL 2: TAB SWITCH DETECTED WARNING                             */}
      {/* ========================================================================= */}
      {securityState.showTabSwitchWarning && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 text-center space-y-4 shadow-2xl border border-slate-200 animate-in zoom-in-95">
            <div className="w-14 h-14 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mx-auto border border-red-200">
              <ShieldAlert className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-black text-slate-900">Exam Window Changed</h3>
              <p className="text-xs text-slate-500 font-medium leading-relaxed">
                You navigated away from the examination window ({securityState.tabSwitchCount} time{securityState.tabSwitchCount > 1 ? "s" : ""}).
                Please remain on this page until your test is submitted.
              </p>
            </div>
            <div className="pt-2">
              <Button
                type="button"
                size="md"
                onClick={handleDismissTabWarning}
                className="w-full bg-blue-600 hover:bg-blue-700 font-extrabold text-xs rounded-xl shadow-xs"
              >
                Continue Examination
              </Button>
            </div>
          </div>
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
      {currentQ && (
        <ReportIssueDialog
          isOpen={isReportOpen}
          questionNumber={currentQ.questionOrder}
          mockQuestionId={currentQ.mockQuestionId}
          onClose={() => setIsReportOpen(false)}
        />
      )}

      {/* Instructions Reference Modal */}
      <InstructionsModal
        isOpen={isInstructionsOpen}
        onClose={() => setIsInstructionsOpen(false)}
      />
    </div>
  );
}