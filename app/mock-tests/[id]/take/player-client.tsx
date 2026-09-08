"use client";

import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ActiveAttemptSession } from "@/services/assessment.service";
import { ActiveAdaptiveSession, SafeAdaptiveQuestionPayload, DifficultyTier } from "@/services/adaptive/adaptive-types";
import { AdaptiveProgressBadge } from "@/components/assessment/adaptive-progress-badge";
import { BrandLogo } from "@/components/brand/logo";
import { AssessmentTimer } from "@/components/assessment/assessment-timer";
import { QuestionRenderer } from "@/components/assessment/question-renderer";
import { QuestionOptions } from "@/components/assessment/question-options";
import { QuestionPalette, QuestionStatus } from "@/components/assessment/question-palette";
import { SubmitDialog, SectionSubmitSummary } from "@/components/assessment/submit-dialog";
import { ReportIssueDialog } from "@/components/assessment/report-issue-dialog";
import { InstructionsModal } from "@/components/assessment/instructions-modal";
import { CandidateSecurityWatermark } from "@/components/assessment/candidate-security-watermark";
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
  AlertCircle,
  Sparkles,
} from "lucide-react";

export type MockTestPlayerSession = ActiveAttemptSession | ActiveAdaptiveSession;

interface MockTestPlayerClientProps {
  session: MockTestPlayerSession;
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

type SubmissionState = "idle" | "time_expired" | "submitting" | "submitted" | "error";

export function MockTestPlayerClient({ session }: MockTestPlayerClientProps) {
  const router = useRouter();

  // Authoritative Mode Discrimination
  const isAdaptive = Boolean("isAdaptive" in session && session.isAdaptive);
  const adaptiveSession = isAdaptive ? (session as ActiveAdaptiveSession) : null;
  const fixedSession = isAdaptive ? null : (session as ActiveAttemptSession);

  // Pre-exam Fullscreen Gate State
  const [isExamStarted, setIsExamStarted] = useState(false);

  // Fixed Mock State
  const [currentIndex, setCurrentIndex] = useState(0);

  // Adaptive Mock State
  const [generatedSteps, setGeneratedSteps] = useState<SafeAdaptiveQuestionPayload[]>(() => {
    if (adaptiveSession?.adaptive?.generatedSteps && adaptiveSession.adaptive.generatedSteps.length > 0) {
      return adaptiveSession.adaptive.generatedSteps;
    }
    if (adaptiveSession?.adaptive?.currentQuestion) {
      return [adaptiveSession.adaptive.currentQuestion];
    }
    return [];
  });

  const [activeStepNumber, setActiveStepNumber] = useState<number>(() => {
    return adaptiveSession?.adaptive?.currentStep || 1;
  });

  const [viewingStepNumber, setViewingStepNumber] = useState<number>(() => {
    return adaptiveSession?.adaptive?.currentStep || 1;
  });

  const [isStepTransitioning, setIsStepTransitioning] = useState<boolean>(false);
  const [stepTransitionError, setStepTransitionError] = useState<string | null>(null);
  const [stoppingRuleMet, setStoppingRuleMet] = useState<boolean>(() => {
    return adaptiveSession?.adaptive?.status === "stopping_rule_met";
  });
  const [stoppingReason, setStoppingReason] = useState<string | null>(() => {
    return adaptiveSession?.adaptive?.stoppingReason || null;
  });
  const [currentDifficultyTier, setCurrentDifficultyTier] = useState<DifficultyTier>(() => {
    return adaptiveSession?.adaptive?.currentDifficultyTier || "medium";
  });

  const isViewingPastStep = isAdaptive && viewingStepNumber < activeStepNumber;

  // Initialize answers from session (supports both fixed & adaptive resume)
  const [answers, setAnswers] = useState<Record<string, SavedAnswerState>>(() => {
    const initial: Record<string, SavedAnswerState> = {};
    if (isAdaptive && adaptiveSession) {
      const history = adaptiveSession.adaptive.sequenceHistory || [];
      history.forEach((step) => {
        if (step.answered_at) {
          initial[`adaptive_step_${step.step_number}`] = {
            selectedOption: step.selected_option_key || null,
            isMarkedForReview: false,
            timeSpentSeconds: step.time_spent_seconds || 0,
          };
        }
      });
    } else if (fixedSession) {
      fixedSession.questions.forEach((q) => {
        if (q.savedAnswer) {
          initial[q.mockQuestionId] = q.savedAnswer;
        }
      });
    }
    return initial;
  });

  // Track visited questions for 5-state palette (Fixed Mode)
  const [visitedQuestions, setVisitedQuestions] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    if (fixedSession && fixedSession.questions.length > 0) {
      initial.add(fixedSession.questions[0].mockQuestionId);
      fixedSession.questions.forEach((q) => {
        if (q.savedAnswer && (q.savedAnswer.selectedOption || q.savedAnswer.isMarkedForReview)) {
          initial.add(q.mockQuestionId);
        }
      });
    }
    return initial;
  });

  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [isSubmitOpen, setIsSubmitOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionState, setSubmissionState] = useState<SubmissionState>("idle");
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [isMobilePaletteOpen, setIsMobilePaletteOpen] = useState(false);
  const [isInstructionsOpen, setIsInstructionsOpen] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);

  // Active Question Time Tracking Ref
  const activeQuestionStartTimeRef = useRef<number>(Date.now());
  const isSubmittingRef = useRef(false);

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

  // Determine current active question
  const hasQuestions = isAdaptive ? generatedSteps.length > 0 : Boolean(fixedSession?.questions && fixedSession.questions.length > 0);

  const currentAdaptiveStep = useMemo(() => {
    if (!isAdaptive) return null;
    return generatedSteps.find((s) => s.step_number === viewingStepNumber) || generatedSteps[generatedSteps.length - 1] || null;
  }, [isAdaptive, generatedSteps, viewingStepNumber]);

  const currentQ = useMemo(() => {
    if (isAdaptive) {
      if (!currentAdaptiveStep) return null;
      return {
        mockQuestionId: `adaptive_step_${currentAdaptiveStep.step_number}`,
        questionOrder: currentAdaptiveStep.step_number,
        questionVersionId: currentAdaptiveStep.question_version_id,
        questionText: currentAdaptiveStep.question_text || "",
        questionImageUrl: currentAdaptiveStep.question_image_url,
        marks: 1,
        negativeMark: 0,
        sectionId: "adaptive_main_section",
        sectionName: "Adaptive Mock Assessment",
        optionsType: currentAdaptiveStep.options_type || "single_choice",
        options: currentAdaptiveStep.options.map((opt) => ({
          id: opt.id,
          key: opt.option_key,
          text: opt.option_text,
          imageUrl: opt.option_image_url,
        })),
        difficultyTier: currentAdaptiveStep.difficulty_tier,
        isLastStep: currentAdaptiveStep.is_last_step,
      };
    } else {
      return hasQuestions && fixedSession ? fixedSession.questions[currentIndex] : null;
    }
  }, [isAdaptive, currentAdaptiveStep, hasQuestions, fixedSession, currentIndex]);

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

  // Mark current question as visited whenever index/step changes
  useEffect(() => {
    if (currentQ && isExamStarted && !isAdaptive) {
      setVisitedQuestions((prev) => {
        if (prev.has(currentQ.mockQuestionId)) return prev;
        const next = new Set(prev);
        next.add(currentQ.mockQuestionId);
        return next;
      });
    }
  }, [currentQ, isExamStarted, isAdaptive]);

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

  // Explicit User Gesture Fullscreen Handler (Starts Exam)
  const handleStartExamWithFullscreen = useCallback(() => {
    activeQuestionStartTimeRef.current = Date.now();
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
        .catch(() => {})
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

  // Helper to persist answer via local buffer & background API (Fixed Mock only)
  const persistAnswer = useCallback(
    (mockQuestionId: string, updated: SavedAnswerState) => {
      if (isAdaptive) return; // Adaptive answers are authoritatively persisted on explicit Next

      OfflineAnswerQueue.enqueue(
        session.attemptId,
        mockQuestionId,
        updated.selectedOption,
        updated.isMarkedForReview,
        updated.timeSpentSeconds
      );

      if (navigator.onLine) {
        setSaveStatus("saving");
      } else {
        setSaveStatus("offline");
        return;
      }

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
    [isAdaptive, session.attemptId]
  );

  // Flush active question time spent before transitioning or saving
  const flushCurrentQuestionActiveTime = useCallback(() => {
    if (!currentQ) return;
    const now = Date.now();
    const elapsedSec = Math.max(0, Math.round((now - activeQuestionStartTimeRef.current) / 1000));
    activeQuestionStartTimeRef.current = now;

    if (elapsedSec > 0) {
      setAnswers((prev) => {
        const existing = prev[currentQ.mockQuestionId] || {
          selectedOption: null,
          isMarkedForReview: false,
          timeSpentSeconds: 0,
        };
        const updated: SavedAnswerState = {
          ...existing,
          timeSpentSeconds: existing.timeSpentSeconds + elapsedSec,
        };
        if (!isAdaptive) {
          persistAnswer(currentQ.mockQuestionId, updated);
        }
        return {
          ...prev,
          [currentQ.mockQuestionId]: updated,
        };
      });
    }
  }, [currentQ, isAdaptive, persistAnswer]);

  // Security: Tab Switch / Visibility Change Listener
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!isExamStarted) return;
      if (document.visibilityState === "hidden") {
        flushCurrentQuestionActiveTime();
        setSecurityState((prev) => ({
          ...prev,
          tabSwitchCount: prev.tabSwitchCount + 1,
        }));
      } else if (document.visibilityState === "visible") {
        activeQuestionStartTimeRef.current = Date.now();
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
  }, [isExamStarted, flushCurrentQuestionActiveTime]);

  // Safe Navigation Wrappers for Fixed Mock
  const navigateToQuestionIndex = useCallback(
    (targetIndex: number) => {
      if (!fixedSession) return;
      if (targetIndex < 0 || targetIndex >= fixedSession.questions.length || targetIndex === currentIndex) return;
      flushCurrentQuestionActiveTime();
      setCurrentIndex(targetIndex);
    },
    [fixedSession, currentIndex, flushCurrentQuestionActiveTime]
  );

  const navigateToQuestionOrder = useCallback(
    (order: number) => {
      if (isAdaptive) {
        if (order >= 1 && order <= activeStepNumber) {
          flushCurrentQuestionActiveTime();
          setViewingStepNumber(order);
        }
        return;
      }
      if (fixedSession) {
        const idx = fixedSession.questions.findIndex((q) => q.questionOrder === order);
        if (idx !== -1) {
          navigateToQuestionIndex(idx);
        }
      }
    },
    [isAdaptive, activeStepNumber, fixedSession, flushCurrentQuestionActiveTime, navigateToQuestionIndex]
  );

  // Handle Option Select — STRICT RULE: NEVER AUTO ADVANCES!
  const handleSelectOption = useCallback(
    (optionKey: string) => {
      if (!currentQ) return;
      if (isViewingPastStep) return; // Previously answered adaptive questions are read-only

      const now = Date.now();
      const elapsedSec = Math.max(0, Math.round((now - activeQuestionStartTimeRef.current) / 1000));
      activeQuestionStartTimeRef.current = now;

      const newSelected = currentAnswer.selectedOption === optionKey ? null : optionKey;
      const updated: SavedAnswerState = {
        ...currentAnswer,
        selectedOption: newSelected,
        timeSpentSeconds: currentAnswer.timeSpentSeconds + elapsedSec,
      };

      setAnswers((prev) => ({
        ...prev,
        [currentQ.mockQuestionId]: updated,
      }));

      if (!isAdaptive) {
        persistAnswer(currentQ.mockQuestionId, updated);
      }
    },
    [currentQ, isViewingPastStep, currentAnswer, isAdaptive, persistAnswer]
  );

  // Toggle Mark for Review
  const handleToggleReview = useCallback(() => {
    if (!currentQ) return;
    if (isViewingPastStep) return;

    const now = Date.now();
    const elapsedSec = Math.max(0, Math.round((now - activeQuestionStartTimeRef.current) / 1000));
    activeQuestionStartTimeRef.current = now;

    const updated: SavedAnswerState = {
      ...currentAnswer,
      isMarkedForReview: !currentAnswer.isMarkedForReview,
      timeSpentSeconds: currentAnswer.timeSpentSeconds + elapsedSec,
    };

    setAnswers((prev) => ({
      ...prev,
      [currentQ.mockQuestionId]: updated,
    }));

    if (!isAdaptive) {
      persistAnswer(currentQ.mockQuestionId, updated);
    }
  }, [currentQ, isViewingPastStep, currentAnswer, isAdaptive, persistAnswer]);

  // Prompt Confirmation for Clear Response
  const handleClearResponseClick = useCallback(() => {
    if (!currentQ || !currentAnswer.selectedOption || isViewingPastStep) return;
    setIsClearConfirmOpen(true);
  }, [currentQ, currentAnswer.selectedOption, isViewingPastStep]);

  // Execute Clear Response with 2.5s Undo Capability
  const executeClearResponse = useCallback(() => {
    if (!currentQ || !currentAnswer.selectedOption || isViewingPastStep) return;
    const now = Date.now();
    const elapsedSec = Math.max(0, Math.round((now - activeQuestionStartTimeRef.current) / 1000));
    activeQuestionStartTimeRef.current = now;

    const previousOption = currentAnswer.selectedOption;
    const updated: SavedAnswerState = {
      ...currentAnswer,
      selectedOption: null,
      timeSpentSeconds: currentAnswer.timeSpentSeconds + elapsedSec,
    };

    setAnswers((prev) => ({
      ...prev,
      [currentQ.mockQuestionId]: updated,
    }));

    if (!isAdaptive) {
      persistAnswer(currentQ.mockQuestionId, updated);
    }
    setIsClearConfirmOpen(false);

    setUndoClearState({
      mockQuestionId: currentQ.mockQuestionId,
      previousOption,
    });

    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    undoTimeoutRef.current = setTimeout(() => {
      setUndoClearState(null);
    }, 2500);
  }, [currentQ, currentAnswer, isViewingPastStep, isAdaptive, persistAnswer]);

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

    if (!isAdaptive) {
      persistAnswer(mockQuestionId, restored);
    }
    setUndoClearState(null);
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
  }, [undoClearState, answers, isAdaptive, persistAnswer]);

  // =========================================================================
  // ADAPTIVE NEXT STEP SUBMISSION & STEP PROGRESSION
  // =========================================================================
  const handleAdaptiveNextStep = useCallback(async () => {
    if (!isAdaptive || isStepTransitioning || isSubmittingRef.current) return;

    // Case A: If viewing a previous step, simply move forward locally
    if (isViewingPastStep) {
      setViewingStepNumber((prev) => Math.min(activeStepNumber, prev + 1));
      return;
    }

    // Case B: If stopping rule already satisfied, trigger final submission modal
    if (stoppingRuleMet) {
      setIsSubmitOpen(true);
      return;
    }

    // Case C: Candidate is on active step and clicks Next -> invoke authoritative API
    setIsStepTransitioning(true);
    setStepTransitionError(null);
    setSaveStatus("saving");

    const now = Date.now();
    const elapsedSec = Math.max(0, Math.round((now - activeQuestionStartTimeRef.current) / 1000));
    const totalTimeSpent = (currentAnswer.timeSpentSeconds || 0) + elapsedSec;
    activeQuestionStartTimeRef.current = now;

    try {
      const res = await fetch("/api/assessment/adaptive-step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attemptId: session.attemptId,
          stepNumber: activeStepNumber,
          selectedOptionKey: currentAnswer.selectedOption || null,
          timeSpentSeconds: totalTimeSpent,
          isMarkedForReview: currentAnswer.isMarkedForReview || false,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setSaveStatus("saved");

        // Update local answers state with final time
        setAnswers((prev) => ({
          ...prev,
          [`adaptive_step_${activeStepNumber}`]: {
            ...currentAnswer,
            timeSpentSeconds: totalTimeSpent,
          },
        }));

        if (data.currentDifficultyTier) {
          setCurrentDifficultyTier(data.currentDifficultyTier);
        }

        if (data.stoppingRuleMet) {
          setStoppingRuleMet(true);
          setStoppingReason(data.stoppingReason || "MAX_QUESTIONS_REACHED");
          setIsSubmitOpen(true);
        } else if (data.nextQuestion) {
          const nextQ = data.nextQuestion as SafeAdaptiveQuestionPayload;
          const nextStepNum = data.nextStepNumber || (activeStepNumber + 1);

          setGeneratedSteps((prev) => {
            const exists = prev.some((s) => s.step_number === nextQ.step_number);
            if (exists) return prev;
            return [...prev, nextQ];
          });

          setActiveStepNumber(nextStepNum);
          setViewingStepNumber(nextStepNum);
          activeQuestionStartTimeRef.current = Date.now();
        }
      } else {
        setSaveStatus("offline");
        setStepTransitionError(data.error || "Could not prepare next question. Please click Retry.");
      }
    } catch {
      setSaveStatus("offline");
      setStepTransitionError("Network communication error. Your response is saved. Please click Retry.");
    } finally {
      setIsStepTransitioning(false);
    }
  }, [
    isAdaptive,
    isStepTransitioning,
    isViewingPastStep,
    activeStepNumber,
    stoppingRuleMet,
    currentAnswer,
    session.attemptId,
  ]);

  // Keyboard Shortcuts
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
        securityState.showTabSwitchWarning ||
        isSubmittingRef.current ||
        isStepTransitioning
      ) {
        return;
      }

      if (e.key === "ArrowRight" || e.key === "n" || e.key === "N") {
        if (isAdaptive) {
          handleAdaptiveNextStep();
        } else if (fixedSession && currentIndex < fixedSession.questions.length - 1) {
          navigateToQuestionIndex(currentIndex + 1);
        }
      } else if (e.key === "ArrowLeft" || e.key === "p" || e.key === "P") {
        if (isAdaptive) {
          if (viewingStepNumber > 1) {
            setViewingStepNumber((prev) => prev - 1);
          }
        } else if (currentIndex > 0) {
          navigateToQuestionIndex(currentIndex - 1);
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
    isAdaptive,
    viewingStepNumber,
    isStepTransitioning,
    handleAdaptiveNextStep,
    fixedSession,
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
    navigateToQuestionIndex,
  ]);

  // Submit Attempt (Fixed and Adaptive finalization)
  const handleSubmitAttempt = useCallback(
    async (isAutoSubmit = false) => {
      if (isSubmittingRef.current) return;
      isSubmittingRef.current = true;
      setIsSubmitting(true);
      setSubmissionState(isAutoSubmit ? "time_expired" : "submitting");
      setSubmissionError(null);

      setIsSubmitOpen(false);
      setIsInstructionsOpen(false);
      setIsReportOpen(false);
      setIsClearConfirmOpen(false);
      setIsMobilePaletteOpen(false);

      flushCurrentQuestionActiveTime();

      try {
        await OfflineAnswerQueue.flush(session.attemptId);

        const res = await fetch("/api/assessment/submit-attempt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ attemptId: session.attemptId }),
        });

        const data = await res.json();
        if (data.success && data.resultId) {
          setSubmissionState("submitted");
          OfflineAnswerQueue.clear(session.attemptId);
          router.push(`/mock-tests/${session.attemptId}/result`);
        } else {
          isSubmittingRef.current = false;
          setIsSubmitting(false);
          setSubmissionState("error");
          setSubmissionError(
            data.error || "We couldn't complete your submission. Your responses are preserved. Please try again."
          );
        }
      } catch {
        isSubmittingRef.current = false;
        setIsSubmitting(false);
        setSubmissionState("error");
        setSubmissionError("Network communication error. Your responses are preserved locally. Please try again.");
      }
    },
    [session.attemptId, flushCurrentQuestionActiveTime, router]
  );

  // Palette Items Calculation
  const paletteItems = useMemo(() => {
    if (isAdaptive) {
      const items = [];
      for (let step = 1; step <= activeStepNumber; step++) {
        const ans = answers[`adaptive_step_${step}`];
        let status: QuestionStatus = "not_answered";

        if (step < activeStepNumber) {
          if (ans?.selectedOption && ans?.isMarkedForReview) {
            status = "marked_answered";
          } else if (ans?.selectedOption) {
            status = "answered";
          } else if (ans?.isMarkedForReview) {
            status = "marked";
          } else {
            status = "answered";
          }
        } else {
          if (ans?.selectedOption && ans?.isMarkedForReview) {
            status = "marked_answered";
          } else if (ans?.selectedOption) {
            status = "answered";
          } else if (ans?.isMarkedForReview) {
            status = "marked";
          } else {
            status = "not_answered";
          }
        }

        items.push({
          questionOrder: step,
          status,
        });
      }
      return items;
    }

    if (!fixedSession) return [];

    return fixedSession.questions.map((q) => {
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
  }, [isAdaptive, activeStepNumber, answers, fixedSession, visitedQuestions]);

  // Section-wise filtering for Question Palette
  const currentSection = useMemo(() => {
    if (isAdaptive) {
      return { id: "adaptive_main_section", name: "Adaptive Assessment" };
    }
    return fixedSession?.sections.find((s) => s.id === currentQ?.sectionId) || fixedSession?.sections[0];
  }, [isAdaptive, fixedSession, currentQ?.sectionId]);

  const currentSectionQuestions = useMemo(() => {
    if (isAdaptive) return [];
    if (!currentSection || !fixedSession) return [];
    return fixedSession.questions.filter((q) => q.sectionId === currentSection.id);
  }, [isAdaptive, fixedSession, currentSection]);

  const sectionPaletteItems = useMemo(() => {
    if (isAdaptive) return paletteItems;
    const currentSecOrderSet = new Set(currentSectionQuestions.map((q) => q.questionOrder));
    return paletteItems.filter((p) => currentSecOrderSet.has(p.questionOrder));
  }, [isAdaptive, paletteItems, currentSectionQuestions]);

  // Summary Counts
  const answeredCount = Object.values(answers).filter((a) => a.selectedOption !== null).length;
  const markedCount = Object.values(answers).filter((a) => a.isMarkedForReview).length;
  const totalQuestionCount = isAdaptive ? activeStepNumber : (fixedSession?.questions.length || 0);
  const unansweredCount = Math.max(0, totalQuestionCount - answeredCount);

  // Section Breakdown for Submit Dialog
  const sectionsSummary: SectionSubmitSummary[] = useMemo(() => {
    if (isAdaptive) {
      return [
        {
          id: "adaptive_main_section",
          name: "Adaptive Assessment",
          totalQuestions: activeStepNumber,
          answeredCount: answeredCount,
        },
      ];
    }
    if (!fixedSession) return [];
    return fixedSession.sections.map((sec) => {
      const secQuestions = fixedSession.questions.filter((q) => q.sectionId === sec.id);
      const secAnswered = secQuestions.filter((q) => Boolean(answers[q.mockQuestionId]?.selectedOption)).length;
      return {
        id: sec.id,
        name: sec.name,
        totalQuestions: secQuestions.length,
        answeredCount: secAnswered,
      };
    });
  }, [isAdaptive, activeStepNumber, answeredCount, fixedSession, answers]);

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
  // PRE-EXAM FULLSCREEN GATE
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
              <span className="font-black text-blue-900 text-lg block">
                {isAdaptive ? `${adaptiveSession?.adaptive.minQuestions}-${adaptiveSession?.adaptive.maxQuestions}` : (fixedSession?.questions.length || 0)}
              </span>
              <span className="text-blue-700 text-[11px] font-bold">{isAdaptive ? "Adaptive Qs" : "Questions"}</span>
            </div>
            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
              <span className="font-black text-slate-900 text-lg block">{session.durationMinutes}m</span>
              <span className="text-slate-600 text-[11px] font-bold">Duration</span>
            </div>
            <div className="p-3 rounded-2xl bg-emerald-50/80 border border-emerald-100">
              <span className="font-black text-emerald-900 text-lg block">
                {isAdaptive ? "+1 / 0" : `+${fixedSession?.questions[0]?.marks || 2} / -${fixedSession?.questions[0]?.negativeMark || 0.5}`}
              </span>
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
              {isAdaptive ? (
                <>
                  <li>This test adapts dynamically based on your performance.</li>
                  <li>Click <strong>Next Question</strong> to submit each response and load the next item.</li>
                </>
              ) : (
                <li>Responses are automatically saved and synchronized in real-time.</li>
              )}
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

      {/* Transition Error Retry Banner (Adaptive Mode) */}
      {stepTransitionError && (
        <div className="bg-rose-600 text-white text-xs font-bold py-2 px-4 text-center flex items-center justify-between gap-2 shadow-md z-50 animate-in slide-in-from-top-1">
          <div className="flex items-center gap-2 mx-auto">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{stepTransitionError}</span>
            <Button
              size="sm"
              variant="outline"
              onClick={handleAdaptiveNextStep}
              className="ml-2 bg-white text-rose-700 hover:bg-rose-50 h-7 text-xs font-black cursor-pointer"
            >
              <RefreshCw className="w-3 h-3 mr-1" /> Retry
            </Button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* EXAM PLAYER HEADER                                                        */}
      {/* ========================================================================= */}
      <header className="h-14 sm:h-16 bg-white border-b border-slate-200 px-3 sm:px-6 flex items-center justify-between shrink-0 z-20">
        {/* ZONE 1: BRAND IDENTITY & ADAPTIVE BADGE */}
        <div className="flex items-center gap-2 sm:gap-3.5 shrink-0">
          <BrandLogo size="sm" variant="icon" showText={false} />
          <span className="font-black tracking-tight text-slate-900 text-xs sm:text-[15px] select-none whitespace-nowrap">
            COURAGE LIBRARY
          </span>
          <div className="hidden md:block h-5 sm:h-6 w-px bg-slate-200" />
          {isAdaptive && (
            <div className="hidden sm:block">
              <AdaptiveProgressBadge
                currentStep={viewingStepNumber}
                minQuestions={adaptiveSession?.adaptive.minQuestions || 20}
                maxQuestions={adaptiveSession?.adaptive.maxQuestions || 50}
                difficultyTier={currentDifficultyTier}
                isStoppingRuleMet={stoppingRuleMet}
              />
            </div>
          )}
        </div>

        {/* ZONE 2: TEST IDENTITY & METADATA */}
        <div className="hidden md:flex flex-col items-center justify-center text-center px-4 min-w-0 max-w-sm lg:max-w-md xl:max-w-lg">
          <h1 className="font-black text-xs sm:text-sm text-slate-900 truncate w-full tracking-tight" title={session.testTitle}>
            {session.testTitle}
          </h1>
          <span className="text-[10px] text-slate-500 font-bold font-mono tracking-wider">
            Attempt #{session.attemptId.slice(0, 6).toUpperCase()}
          </span>
        </div>

        {/* ZONE 3: CONTROLS & DESKTOP SUBMIT */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          {/* Live Save Status Indicator */}
          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-50 border border-slate-200/80 text-[11px] font-bold text-slate-600">
            {isStepTransitioning || saveStatus === "saving" ? (
              <>
                <RefreshCw className="w-3 h-3 text-blue-600 animate-spin" />
                <span>Saving...</span>
              </>
            ) : saveStatus === "offline" ? (
              <>
                <WifiOff className="w-3 h-3 text-amber-600" />
                <span className="text-amber-700">Offline (Saved)</span>
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

          {/* Persistent Timer */}
          <AssessmentTimer
            initialRemainingSeconds={session.remainingSeconds}
            onTimeExpired={() => handleSubmitAttempt(true)}
          />

          {/* Desktop Instructions / Help Button */}
          <button
            type="button"
            onClick={() => setIsInstructionsOpen(true)}
            title="View Instructions (?)"
            className="hidden md:flex items-center gap-1 p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition cursor-pointer text-xs font-bold"
          >
            <HelpCircle className="w-4 h-4" />
          </button>

          {/* Desktop Fullscreen Button */}
          <button
            type="button"
            onClick={handleReturnToFullscreen}
            title={securityState.isFullscreen ? "Fullscreen Active" : "Enter Fullscreen"}
            className="hidden md:flex items-center p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition cursor-pointer"
          >
            {securityState.isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          {/* DESKTOP ONLY: Submit Test Button */}
          <Button
            size="sm"
            variant="default"
            disabled={isSubmitting || isStepTransitioning}
            className="hidden md:inline-flex bg-emerald-600 hover:bg-emerald-700 font-bold text-xs shadow-xs"
            onClick={() => setIsSubmitOpen(true)}
          >
            <Send className="w-3.5 h-3.5 mr-1" /> Submit Test
          </Button>

          {/* Mobile / Tablet Palette Drawer Toggle Button */}
          <button
            type="button"
            className="lg:hidden p-2 rounded-xl text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition cursor-pointer flex items-center gap-1 text-xs font-bold border border-slate-200/80"
            onClick={() => setIsMobilePaletteOpen(true)}
            aria-label="Open Question Palette"
          >
            <Menu className="w-4 h-4" />
            <span className="hidden xs:inline text-[11px]">Palette</span>
          </button>
        </div>
      </header>

      {/* ========================================================================= */}
      {/* MOBILE TEST CONTEXT & ADAPTIVE STRIP                                      */}
      {/* ========================================================================= */}
      <div className="md:hidden bg-slate-50/95 border-b border-slate-200 px-3.5 py-1.5 flex items-center justify-between gap-2 shrink-0 z-10">
        <div className="min-w-0 flex-1">
          <div className="font-extrabold text-[12px] text-slate-900 truncate leading-tight" title={session.testTitle}>
            {session.testTitle}
          </div>
          <div className="text-[10px] text-slate-500 font-bold font-mono tracking-wide leading-none mt-0.5">
            Attempt #{session.attemptId.slice(0, 6).toUpperCase()}
          </div>
        </div>

        {isAdaptive ? (
          <AdaptiveProgressBadge
            currentStep={viewingStepNumber}
            minQuestions={adaptiveSession?.adaptive.minQuestions || 20}
            maxQuestions={adaptiveSession?.adaptive.maxQuestions || 50}
            difficultyTier={currentDifficultyTier}
            isStoppingRuleMet={stoppingRuleMet}
            className="text-[10px] py-0.5 px-2"
          />
        ) : (
          <div className="shrink-0 flex items-center gap-1 text-[10px] font-bold text-slate-600 bg-white px-2 py-0.5 rounded-md border border-slate-200 shadow-2xs">
            {saveStatus === "saving" ? (
              <>
                <RefreshCw className="w-2.5 h-2.5 text-blue-600 animate-spin" />
                <span>Saving</span>
              </>
            ) : saveStatus === "offline" ? (
              <>
                <WifiOff className="w-2.5 h-2.5 text-amber-600" />
                <span className="text-amber-700">Offline</span>
              </>
            ) : (
              <>
                <Check className="w-2.5 h-2.5 text-emerald-600" />
                <span>Saved</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* EXAM WORKSPACE BODY                                                       */}
      {/* ========================================================================= */}
      <div className="flex-1 flex overflow-hidden z-10">
        {/* Main Question Viewport */}
        <main className="relative flex-1 bg-white p-4 sm:p-7 overflow-y-auto flex flex-col justify-between pb-28 md:pb-6">
          {/* Dynamic Candidate Security Watermark */}
          <CandidateSecurityWatermark
            examTitle={session.testTitle}
            maskedCandidateId={`CL••••${session.attemptId.slice(0, 4).toUpperCase()}`}
            attemptIdShort={session.attemptId.slice(0, 6).toUpperCase()}
            timestamp={new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
          />

          <div className="relative z-10 max-w-3xl w-full mx-auto space-y-4 sm:space-y-6">
            {/* Read-Only Past Step Notice Banner */}
            {isViewingPastStep && (
              <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-800 flex items-center justify-between">
                <span>Viewing Step {viewingStepNumber} (Answer Locked). Click Next to return to active question.</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setViewingStepNumber(activeStepNumber)}
                  className="h-6 text-[11px] font-bold bg-white text-amber-900 border-amber-300"
                >
                  Go to Active Step ({activeStepNumber})
                </Button>
              </div>
            )}

            {/* Section Switcher Tabs (Fixed Mock Only) */}
            {!isAdaptive && fixedSession && fixedSession.sections.length > 1 && (
              <div className="flex items-center gap-1.5 p-1 bg-slate-100/90 rounded-2xl overflow-x-auto">
                {fixedSession.sections.map((sec) => {
                  const isCurrentSec = currentQ?.sectionId === sec.id;
                  const secQuestions = fixedSession.questions.filter((q) => q.sectionId === sec.id);
                  const secAnswered = secQuestions.filter((q) => Boolean(answers[q.mockQuestionId]?.selectedOption)).length;
                  return (
                    <button
                      key={sec.id}
                      type="button"
                      onClick={() => {
                        const firstInSec = fixedSession.questions.findIndex((q) => q.sectionId === sec.id);
                        if (firstInSec !== -1) navigateToQuestionIndex(firstInSec);
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
                totalQuestions={isAdaptive ? (adaptiveSession?.adaptive.maxQuestions || 50) : (fixedSession?.questions.length || 0)}
                questionText={currentQ.questionText || ""}
                questionImageUrl={currentQ.questionImageUrl}
                marks={currentQ.marks || 1}
                negativeMark={currentQ.negativeMark || 0}
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
                disabled={isSubmitting || isStepTransitioning || isViewingPastStep}
              />
            )}
          </div>

          {/* Desktop Bottom Action Footer */}
          <div className="hidden md:flex relative z-10 max-w-3xl w-full mx-auto pt-4 mt-6 border-t border-slate-100 flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant={currentAnswer.isMarkedForReview ? "secondary" : "outline"}
                size="sm"
                disabled={isViewingPastStep || isStepTransitioning}
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
                disabled={!currentAnswer.selectedOption || isViewingPastStep || isStepTransitioning}
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
                <span>Report</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isAdaptive ? (viewingStepNumber <= 1 || isStepTransitioning) : (currentIndex === 0)}
                onClick={() => {
                  if (isAdaptive) {
                    setViewingStepNumber((prev) => Math.max(1, prev - 1));
                  } else {
                    navigateToQuestionIndex(currentIndex - 1);
                  }
                }}
                className="font-bold"
              >
                <ChevronLeft className="w-4 h-4 mr-1" /> Previous
              </Button>

              {isAdaptive ? (
                stoppingRuleMet || activeStepNumber >= (adaptiveSession?.adaptive.maxQuestions || 50) ? (
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
                    disabled={isStepTransitioning}
                    onClick={handleAdaptiveNextStep}
                    className="font-bold bg-blue-600 hover:bg-blue-700 text-white min-w-[130px]"
                  >
                    {isStepTransitioning ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Next Question...
                      </>
                    ) : (
                      <>
                        Next Question <ChevronRight className="w-4 h-4 ml-1" />
                      </>
                    )}
                  </Button>
                )
              ) : currentIndex === (fixedSession?.questions.length || 1) - 1 ? (
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
                  onClick={() => navigateToQuestionIndex(currentIndex + 1)}
                  className="font-bold bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Next <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              )}
            </div>
          </div>
        </main>

        {/* Question Palette Sidebar (Desktop) */}
        <aside className="hidden lg:block w-80 bg-slate-50 border-l border-slate-200 p-5 overflow-y-auto shrink-0 space-y-4">
          {!isAdaptive && fixedSession && fixedSession.sections.length > 1 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-600 uppercase tracking-wider font-mono">
                <span>Sections</span>
                <span>
                  {fixedSession.sections.findIndex((s) => s.id === currentSection?.id) + 1} of {fixedSession.sections.length}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {fixedSession.sections.map((sec) => {
                  const isSecActive = currentSection?.id === sec.id;
                  const secQs = fixedSession.questions.filter((q) => q.sectionId === sec.id);
                  const secAns = secQs.filter((q) => Boolean(answers[q.mockQuestionId]?.selectedOption)).length;
                  return (
                    <button
                      key={sec.id}
                      type="button"
                      onClick={() => {
                        const firstInSec = fixedSession.questions.findIndex((q) => q.sectionId === sec.id);
                        if (firstInSec !== -1) navigateToQuestionIndex(firstInSec);
                      }}
                      className={`p-2 rounded-xl text-left border transition-all cursor-pointer ${
                        isSecActive
                          ? "bg-blue-50/90 border-blue-300 text-blue-900 shadow-2xs font-bold"
                          : "bg-white border-slate-200 text-slate-600 hover:bg-slate-100/80 font-medium"
                      }`}
                    >
                      <div className="text-[11px] font-bold truncate">{sec.name}</div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {secAns}/{secQs.length} answered
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <QuestionPalette
            questions={sectionPaletteItems}
            currentOrder={isAdaptive ? viewingStepNumber : (currentQ?.questionOrder || 1)}
            sectionName={currentSection?.name}
            globalTotal={isAdaptive ? (adaptiveSession?.adaptive.maxQuestions || 50) : fixedSession?.questions.length}
            globalAnswered={answeredCount}
            onSelectQuestion={navigateToQuestionOrder}
          />
        </aside>
      </div>

      {/* ========================================================================= */}
      {/* MOBILE FIXED BOTTOM ACTION BAR                                            */}
      {/* ========================================================================= */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-200/90 z-30 px-3 pt-2 pb-[max(0.6rem,env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
        {/* Row 1: Utility Actions */}
        <div className="flex items-center justify-between gap-1.5 pb-2 border-b border-slate-100">
          <button
            type="button"
            disabled={isViewingPastStep || isStepTransitioning}
            onClick={handleToggleReview}
            className={`flex-1 py-1 px-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition cursor-pointer ${
              currentAnswer.isMarkedForReview
                ? "bg-purple-100 text-purple-800 border border-purple-300 shadow-2xs"
                : "bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200"
            }`}
          >
            <Bookmark className="w-3.5 h-3.5" />
            <span>{currentAnswer.isMarkedForReview ? "Marked" : "Review"}</span>
          </button>

          <button
            type="button"
            disabled={!currentAnswer.selectedOption || isViewingPastStep || isStepTransitioning}
            onClick={handleClearResponseClick}
            className="flex-1 py-1 px-2 rounded-lg text-[11px] font-bold text-slate-600 hover:text-red-700 bg-slate-50 hover:bg-red-50 border border-slate-200 flex items-center justify-center gap-1 transition cursor-pointer disabled:opacity-40 disabled:hover:bg-slate-50 disabled:hover:text-slate-600 disabled:cursor-not-allowed"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Clear</span>
          </button>

          <button
            type="button"
            onClick={() => setIsReportOpen(true)}
            className="py-1 px-2.5 rounded-lg text-[11px] font-bold text-slate-600 hover:text-amber-700 bg-slate-50 hover:bg-amber-50 border border-slate-200 flex items-center justify-center gap-1 transition cursor-pointer"
            title="Report Question Issue"
          >
            <Flag className="w-3.5 h-3.5" />
            <span>Report</span>
          </button>

          <button
            type="button"
            onClick={() => setIsInstructionsOpen(true)}
            className="py-1 px-2 rounded-lg text-[11px] font-bold text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 flex items-center justify-center transition cursor-pointer"
            title="View Instructions"
          >
            <HelpCircle className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Row 2: Navigation & Direct Submit Actions */}
        <div className="flex items-center gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isAdaptive ? (viewingStepNumber <= 1 || isStepTransitioning) : (currentIndex === 0)}
            onClick={() => {
              if (isAdaptive) {
                setViewingStepNumber((prev) => Math.max(1, prev - 1));
              } else {
                navigateToQuestionIndex(currentIndex - 1);
              }
            }}
            className="flex-1 h-9 font-bold text-xs"
          >
            <ChevronLeft className="w-4 h-4 mr-0.5" /> Prev
          </Button>

          {isAdaptive ? (
            stoppingRuleMet || activeStepNumber >= (adaptiveSession?.adaptive.maxQuestions || 50) ? (
              <Button
                type="button"
                variant="default"
                size="sm"
                disabled={isSubmitting || isStepTransitioning}
                onClick={() => setIsSubmitOpen(true)}
                className="flex-2 h-9 font-bold text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
              >
                Review &amp; Submit <Send className="w-3.5 h-3.5 ml-1.5" />
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  disabled={isStepTransitioning}
                  onClick={handleAdaptiveNextStep}
                  className="flex-1 h-9 font-bold text-xs bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {isStepTransitioning ? "Next..." : "Next"} <ChevronRight className="w-4 h-4 ml-0.5" />
                </Button>

                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  disabled={isSubmitting || isStepTransitioning}
                  onClick={() => setIsSubmitOpen(true)}
                  className="h-9 px-3.5 font-bold text-xs bg-emerald-600 hover:bg-emerald-700 text-white shrink-0 shadow-xs"
                >
                  <Send className="w-3.5 h-3.5 mr-1" /> Submit
                </Button>
              </>
            )
          ) : currentIndex === (fixedSession?.questions.length || 1) - 1 ? (
            <Button
              type="button"
              variant="default"
              size="sm"
              disabled={isSubmitting}
              onClick={() => setIsSubmitOpen(true)}
              className="flex-2 h-9 font-bold text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
            >
              Review &amp; Submit <Send className="w-3.5 h-3.5 ml-1.5" />
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={() => navigateToQuestionIndex(currentIndex + 1)}
                className="flex-1 h-9 font-bold text-xs bg-blue-600 hover:bg-blue-700 text-white"
              >
                Next <ChevronRight className="w-4 h-4 ml-0.5" />
              </Button>

              <Button
                type="button"
                variant="default"
                size="sm"
                disabled={isSubmitting}
                onClick={() => setIsSubmitOpen(true)}
                className="h-9 px-3.5 font-bold text-xs bg-emerald-600 hover:bg-emerald-700 text-white shrink-0 shadow-xs"
              >
                <Send className="w-3.5 h-3.5 mr-1" /> Submit
              </Button>
            </>
          )}
        </div>
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

              {!isAdaptive && fixedSession && fixedSession.sections.length > 1 && (
                <div className="flex items-center gap-1 overflow-x-auto pb-1">
                  {fixedSession.sections.map((sec) => (
                    <button
                      key={sec.id}
                      type="button"
                      onClick={() => {
                        const firstInSec = fixedSession.questions.findIndex((q) => q.sectionId === sec.id);
                        if (firstInSec !== -1) navigateToQuestionIndex(firstInSec);
                      }}
                      className={`px-2.5 py-1 text-[11px] font-bold rounded-lg whitespace-nowrap cursor-pointer ${
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
                questions={sectionPaletteItems}
                currentOrder={isAdaptive ? viewingStepNumber : (currentQ?.questionOrder || 1)}
                sectionName={currentSection?.name}
                globalTotal={isAdaptive ? (adaptiveSession?.adaptive.maxQuestions || 50) : fixedSession?.questions.length}
                globalAnswered={answeredCount}
                onSelectQuestion={(order) => {
                  navigateToQuestionOrder(order);
                  setIsMobilePaletteOpen(false);
                }}
              />
            </div>

            <Button
              size="sm"
              variant="default"
              className="w-full bg-emerald-600 hover:bg-emerald-700 font-bold cursor-pointer"
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

      {/* Security Modal 1: Fullscreen Exited Warning */}
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

      {/* Security Modal 2: Tab Switch Detected Warning */}
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

      {/* Submitting / Time Expired Fullscreen Overlay */}
      {(submissionState === "time_expired" || submissionState === "submitting" || submissionState === "submitted") && (
        <div className="fixed inset-0 z-[100] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-sm w-full p-8 text-center space-y-4 shadow-2xl border border-slate-200 animate-in zoom-in-95">
            <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto border border-blue-200">
              <RefreshCw className="w-8 h-8 animate-spin" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-lg font-black text-slate-900">
                {submissionState === "time_expired" ? "Time Expired — Securing Test" : "Submitting Examination"}
              </h3>
              <p className="text-xs text-slate-500 font-medium leading-relaxed">
                {submissionState === "time_expired"
                  ? "Your examination timer has ended. Finalizing responses and submitting test for evaluation."
                  : "Securing your responses and calculating performance metrics. Please do not close or refresh."}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 font-medium flex items-center justify-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Authoritative Evaluation in Progress</span>
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
        onConfirm={() => handleSubmitAttempt(false)}
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
          questionVersionId={currentQ.questionVersionId}
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
