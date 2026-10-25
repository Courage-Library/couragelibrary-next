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
import { ReportQuestionButton } from "@/components/practice/report-question-button";
import { Tooltip } from "@/components/ui/tooltip";
import { InstructionsModal } from "@/components/assessment/instructions-modal";
import { CandidateSecurityWatermark } from "@/components/assessment/candidate-security-watermark";
import { OfflineAnswerQueue } from "@/lib/assessment/offline-queue";
import { createAnswerSync, mergePending, type SaveStatus } from "@/lib/assessment/answer-sync";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/legacy/button";
import {
  ChevronLeft,
  ChevronRight,
  Bookmark,
  Send,
  RotateCcw,
  Menu,
  WifiOff,
  Undo2,
  HelpCircle,
  Maximize2,
  Minimize2,
  RefreshCw,
  Check,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
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
  const lastSubmitAutoRef = useRef(false);

  // F3 (R7): autosave engine — per-question debounce, "Saved" only on server confirmation, retry with backoff,
  // offline = kept on this device, 409 = attempt closed (lib/assessment/answer-sync.ts)
  const syncRef = useRef<ReturnType<typeof createAnswerSync> | null>(null);
  const getSync = useCallback(() => {
    if (!syncRef.current) {
      syncRef.current = createAnswerSync(session.attemptId, {
        post: (body) =>
          fetch("/api/assessment/save-answer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => ({
            status: r.status,
            json: () => r.json(),
          })),
        setTimer: (fn, ms) => setTimeout(fn, ms),
        clearTimer: (t) => clearTimeout(t as ReturnType<typeof setTimeout>),
        isOnline: () => typeof navigator === "undefined" || navigator.onLine,
        keep: (id, a) => OfflineAnswerQueue.enqueue(session.attemptId, id, a.selectedOption, a.isMarkedForReview, a.timeSpentSeconds),
        forget: (id) => OfflineAnswerQueue.dequeue(session.attemptId, id),
        onStatus: setSaveStatus,
      });
    }
    return syncRef.current;
  }, [session.attemptId]);

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
        questionId: null as string | null, // resolved from the version on the server when reporting
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
    const handleOnline = () => getSync().flushAll();
    const handleOffline = () => setSaveStatus(getSync().status());

    if (typeof window !== "undefined") {
      if (!navigator.onLine) setSaveStatus("offline");
      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [getSync]);

  // F3 (R7) resume: answers kept on this device but never confirmed are newer than the server copy — merge them and
  // send them again; restore the last question and the visited set (this device; fixed mocks)
  const progressKey = `cl_mock_progress_${session.attemptId}`;
  useEffect(() => {
    if (!fixedSession) return;
    const known = new Set(fixedSession.questions.map((q) => q.mockQuestionId));
    const pending = OfflineAnswerQueue.getPending(session.attemptId).filter((p) => known.has(p.mockQuestionId));
    if (pending.length > 0) {
      setAnswers((prev) => {
        const merged = mergePending(prev, pending, known) as Record<string, SavedAnswerState>;
        pending.forEach((p) => getSync().save(p.mockQuestionId, merged[p.mockQuestionId]));
        return merged;
      });
    }
    try {
      const saved = JSON.parse(localStorage.getItem(progressKey) || "null") as { index?: number; visited?: string[] } | null;
      if (saved && Number.isInteger(saved.index) && (saved.index as number) >= 0 && (saved.index as number) < fixedSession.questions.length) setCurrentIndex(saved.index as number);
      if (saved && Array.isArray(saved.visited)) setVisitedQuestions((prev) => new Set([...prev, ...saved.visited!.filter((v) => known.has(v))]));
    } catch {
      /* no saved position: start at question 1 */
    }
    // once, on load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!fixedSession) return;
    try {
      localStorage.setItem(progressKey, JSON.stringify({ index: currentIndex, visited: [...visitedQuestions] }));
    } catch {
      /* storage unavailable: resume falls back to question 1 */
    }
  }, [fixedSession, progressKey, currentIndex, visitedQuestions]);

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

  // Persist through the autosave engine (fixed mocks; adaptive answers are persisted by the step API on Next)
  const persistAnswer = useCallback(
    (mockQuestionId: string, updated: SavedAnswerState) => {
      if (isAdaptive) return;
      getSync().save(mockQuestionId, updated);
    },
    [isAdaptive, getSync]
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

      const newSelected = optionKey; // F3 (R6): no deselect on re-click; Clear Response removes an answer
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

    setUndoClearState({
      mockQuestionId: currentQ.mockQuestionId,
      previousOption,
    });

    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    undoTimeoutRef.current = setTimeout(() => {
      setUndoClearState(null);
    }, 5000);
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

  // F3 (R6): CBT controls. "Save & Next" saves and moves on (and, as in the real CBT, an answered question it leaves is
  // no longer "marked"); "Mark for Review & Next" marks and moves on. On the last question both open the submit summary.
  const goNextOrSummary = useCallback(() => {
    if (!fixedSession) return;
    if (currentIndex < fixedSession.questions.length - 1) navigateToQuestionIndex(currentIndex + 1);
    else {
      flushCurrentQuestionActiveTime();
      setIsSubmitOpen(true);
    }
  }, [fixedSession, currentIndex, navigateToQuestionIndex, flushCurrentQuestionActiveTime]);

  const setMark = useCallback(
    (marked: boolean) => {
      if (!currentQ || isViewingPastStep || currentAnswer.isMarkedForReview === marked) return;
      const updated: SavedAnswerState = { ...currentAnswer, isMarkedForReview: marked };
      setAnswers((prev) => ({ ...prev, [currentQ.mockQuestionId]: { ...(prev[currentQ.mockQuestionId] ?? currentAnswer), isMarkedForReview: marked } }));
      persistAnswer(currentQ.mockQuestionId, updated);
    },
    [currentQ, isViewingPastStep, currentAnswer, persistAnswer]
  );

  const handleSaveAndNext = useCallback(() => {
    if (isAdaptive) return;
    setMark(false);
    goNextOrSummary();
  }, [isAdaptive, setMark, goNextOrSummary]);

  const handleMarkAndNext = useCallback(() => {
    if (isAdaptive) return;
    setMark(true);
    goNextOrSummary();
  }, [isAdaptive, setMark, goNextOrSummary]);

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
        isMobilePaletteOpen ||
        document.querySelector("dialog[open]") !== null ||
        isSubmittingRef.current ||
        isStepTransitioning
      ) {
        return;
      }

      if (e.key === "ArrowRight" || e.key === "n" || e.key === "N") {
        if (isAdaptive) {
          handleAdaptiveNextStep();
        } else {
          handleSaveAndNext();
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
        if (isAdaptive) handleToggleReview();
        else handleMarkAndNext();
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
    isMobilePaletteOpen,
    currentQ,
    handleSelectOption,
    handleToggleReview,
    handleSaveAndNext,
    handleMarkAndNext,
    navigateToQuestionIndex,
  ]);

  // Submit Attempt (Fixed and Adaptive finalization)
  const handleSubmitAttempt = useCallback(
    async (isAutoSubmit = false) => {
      if (isSubmittingRef.current) return;
      isSubmittingRef.current = true;
      lastSubmitAutoRef.current = isAutoSubmit;
      setIsSubmitting(true);
      setSubmissionState(isAutoSubmit ? "time_expired" : "submitting");
      setSubmissionError(null);

      setIsSubmitOpen(false);
      setIsInstructionsOpen(false);
      setIsMobilePaletteOpen(false);

      flushCurrentQuestionActiveTime();

      try {
        await OfflineAnswerQueue.flush(session.attemptId);

        const res = await fetch("/api/assessment/submit-attempt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ attemptId: session.attemptId }),
        });

        const data = (await res.json().catch(() => ({}))) as { success?: boolean; resultId?: string };
        if (res.ok && data.success && data.resultId) {
          setSubmissionState("submitted");
          OfflineAnswerQueue.clear(session.attemptId);
          router.push(`/mock-tests/${session.attemptId}/result`);
        } else {
          isSubmittingRef.current = false;
          setIsSubmitting(false);
          setSubmissionState("error");
          setSubmissionError("Your answers are kept. Please try again.");
          if (!isAutoSubmit) setIsSubmitOpen(true); // F3 (R7): the failure is shown, never swallowed
        }
      } catch {
        isSubmittingRef.current = false;
        setIsSubmitting(false);
        setSubmissionState("error");
        setSubmissionError("We could not reach the server. Your answers are kept on this device. Please try again.");
        if (!isAutoSubmit) setIsSubmitOpen(true);
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
  // F3-polish: the submit summary uses the palette's five states and terms
  const stateCounts = useMemo(() => {
    const c: Record<QuestionStatus, number> = { answered: 0, not_answered: 0, not_visited: 0, marked: 0, marked_answered: 0 };
    for (const p of paletteItems) c[p.status] += 1;
    return c;
  }, [paletteItems]);

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
          <div className="w-14 h-14 rounded-2xl bg-ink-100 text-fg-secondary flex items-center justify-center mx-auto border border-line">
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
              <Button variant="outline" size="lg" className="min-h-12 w-full font-semibold">
                Back to Mocks
              </Button>
            </Link>
            <Button
              variant="default"
              size="lg"
              onClick={() => window.location.reload()}
              className="min-h-12 w-1/2 font-semibold"
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
            <Link href="/mock-tests" className="focus-ring inline-flex min-h-12 items-center justify-center text-body-sm font-semibold text-fg-secondary underline underline-offset-2 hover:text-fg">
              Return to Mock Test Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // ACTIVE EXAM WORKSPACE
  // F3: R4 one primary action ("Save & Next"); R5 status always visible; R6 CBT controls + palette; R7 honest save
  // status; R8 calm (no blocking alarms — security events are a quiet, non-blocking notice, counted on this device only — nothing is stored server-side
  // yet: see PROCTOR-LOG-1 in docs/reports/ux/F3_PLAYER_AUDIT.md; never claim "recorded" until it ships);
  // R10 ≥ 48 px targets, accessible dialogs, focus rings.
  // =========================================================================
  const isLastFixed = !isAdaptive && currentIndex === (fixedSession?.questions.length || 1) - 1;
  const securityNotice = securityState.showFullscreenWarning
    ? "Fullscreen is off. Your answers are safe; return to fullscreen when you are ready."
    : securityState.showTabSwitchWarning
    ? `You left the test window (${securityState.tabSwitchCount} time${securityState.tabSwitchCount > 1 ? "s" : ""}). Stay on this window during the test.`
    : null;
  const showSubmitOverlay =
    submissionState === "time_expired" || submissionState === "submitting" || submissionState === "submitted" || (submissionState === "error" && lastSubmitAutoRef.current);
  const iconButton = "focus-ring flex size-12 items-center justify-center rounded-xl text-fg-secondary hover:bg-ink-100 hover:text-fg";
  const labelButton = "focus-ring flex min-h-12 min-w-12 items-center justify-center gap-2 rounded-xl px-3 text-body-sm font-semibold text-fg-secondary hover:bg-ink-100 hover:text-fg";

  return (
    <div className="fixed inset-0 z-50 bg-canvas flex flex-col overflow-hidden select-none" data-player="">
      {/* Offline: neutral notice (never amber / alarm) */}
      {saveStatus === "offline" && (
        <div role="status" className="flex items-center justify-center gap-2 border-b border-line bg-ink-100 px-4 py-2 text-center text-body-sm font-medium text-fg z-50">
          <WifiOff aria-hidden="true" className="size-4 shrink-0" />
          <span>You are offline. Your answers are kept on this device and will be sent when you are back online.</span>
        </div>
      )}

      {/* Adaptive step error: static, next to the action (no slide-in) */}
      {stepTransitionError && (
        <div role="alert" className="flex flex-wrap items-center justify-center gap-3 border-b border-danger-200 bg-danger-50 px-4 py-2 text-body-sm font-medium text-danger-800 z-50">
          <AlertCircle aria-hidden="true" className="size-4 shrink-0" />
          <span>{stepTransitionError}</span>
          <Button size="lg" variant="outline" onClick={handleAdaptiveNextStep} className="min-h-12 bg-surface font-semibold">
            <RefreshCw aria-hidden="true" className="mr-1 size-4" /> Try again
          </Button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* EXAM PLAYER HEADER                                                        */}
      {/* ========================================================================= */}
      <header className="min-h-16 bg-surface border-b border-line px-3 sm:px-6 flex items-center justify-between gap-2 shrink-0 z-20">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3.5 shrink-0">
          <BrandLogo size="sm" variant="icon" showText={false} />
          <span className="hidden font-black tracking-tight text-fg text-sm sm:inline sm:text-[15px] select-none whitespace-nowrap">COURAGE LIBRARY</span>
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

        <div className="hidden md:flex flex-col items-center justify-center text-center px-4 min-w-0 max-w-sm lg:max-w-md xl:max-w-lg">
          <h1 className="font-bold text-body-sm text-fg truncate w-full" title={session.testTitle}>
            {session.testTitle}
          </h1>
        </div>

        <div className="flex min-w-0 items-center gap-1.5 sm:gap-2.5">
          <div className="hidden md:block">
            <SaveStatusChip status={isStepTransitioning ? "saving" : saveStatus} />
          </div>
          <AssessmentTimer initialRemainingSeconds={session.remainingSeconds} onTimeExpired={() => handleSubmitAttempt(true)} />
          {/* F3-polish: icon + visible text at >= 1024 px; icon with tooltip + aria-label below */}
          <Tooltip content="Instructions" side="bottom" className="lg:hidden">
            <button type="button" onClick={() => setIsInstructionsOpen(true)} aria-label="Instructions" className={`hidden md:flex ${labelButton}`} data-header-label="instructions">
              <HelpCircle aria-hidden="true" className="size-5" />
              <span aria-hidden="true" className="hidden lg:inline">Instructions</span>
            </button>
          </Tooltip>
          <Tooltip content="Full screen" side="bottom" className="lg:hidden">
            <button
              type="button"
              onClick={handleReturnToFullscreen}
              aria-label="Full screen"
              aria-pressed={securityState.isFullscreen}
              className={`hidden md:flex ${labelButton}`}
              data-header-label="fullscreen"
            >
              {securityState.isFullscreen ? <Minimize2 aria-hidden="true" className="size-5" /> : <Maximize2 aria-hidden="true" className="size-5" />}
              <span aria-hidden="true" className="hidden lg:inline">Full screen</span>
            </button>
          </Tooltip>
          {/* quiet secondary action (R4): "Save & Next" stays the one primary action */}
          <Button
            size="lg"
            variant="outline"
            disabled={isSubmitting || isStepTransitioning}
            className="hidden min-h-12 font-semibold md:inline-flex"
            onClick={() => {
              flushCurrentQuestionActiveTime();
              setIsSubmitOpen(true);
            }}
          >
            <Send aria-hidden="true" className="mr-1.5 size-4" /> Submit test
          </Button>
          <button type="button" className={`lg:hidden ${iconButton} border border-line`} onClick={() => setIsMobilePaletteOpen(true)} aria-label="Open question palette">
            <Menu aria-hidden="true" className="size-5" />
          </button>
        </div>
      </header>

      {/* Quiet, non-blocking security notice (R8) */}
      {securityNotice && (
        <div role="status" className="flex flex-wrap items-center justify-center gap-2 border-b border-line bg-info-50 px-4 py-1.5 text-body-sm text-fg z-10" data-security-notice="">
          <span>{securityNotice}</span>
          {securityState.showFullscreenWarning && (
            <Button size="lg" variant="outline" className="min-h-12 bg-surface font-semibold" onClick={handleReturnToFullscreen}>
              Return to fullscreen
            </Button>
          )}
          <Button
            size="lg"
            variant="ghost"
            className="min-h-12"
            onClick={() => {
              handleDismissTabWarning();
              setSecurityState((prev) => ({ ...prev, showFullscreenWarning: false }));
            }}
          >
            Dismiss
          </Button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MOBILE STATUS STRIP (R5: progress + save status always visible)          */}
      {/* ========================================================================= */}
      <div className="md:hidden bg-surface-sunken border-b border-line px-3.5 py-1.5 flex items-center justify-between gap-2 shrink-0 z-10">
        <div className="min-w-0 flex-1 text-body-sm font-semibold text-fg tabular-nums">
          {isAdaptive ? `Step ${viewingStepNumber}` : `Q ${currentIndex + 1} of ${fixedSession?.questions.length || 0}`}
          <span className="ml-2 font-normal text-fg-secondary">
            {answeredCount} answered · {markedCount} marked
          </span>
        </div>
        <SaveStatusChip status={isStepTransitioning ? "saving" : saveStatus} compact />
      </div>

      {/* ========================================================================= */}
      {/* EXAM WORKSPACE BODY                                                       */}
      {/* ========================================================================= */}
      <div className="flex-1 flex overflow-hidden z-10">
        <main className="relative flex-1 bg-surface p-4 sm:p-7 overflow-y-auto flex flex-col justify-between pb-40 md:pb-6">
          <CandidateSecurityWatermark
            examTitle={session.testTitle}
            maskedCandidateId={`CL••••${session.attemptId.slice(0, 4).toUpperCase()}`}
            attemptIdShort={session.attemptId.slice(0, 6).toUpperCase()}
            timestamp={new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
          />

          <div className="relative z-10 max-w-3xl w-full mx-auto space-y-4 sm:space-y-6">
            {isViewingPastStep && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface-sunken p-2.5 text-body-sm font-medium text-fg">
                <span>Viewing step {viewingStepNumber} (answer locked).</span>
                <Button size="lg" variant="outline" onClick={() => setViewingStepNumber(activeStepNumber)} className="min-h-12 bg-surface font-semibold">
                  Go to current step ({activeStepNumber})
                </Button>
              </div>
            )}

            {/* Section tabs (fixed mocks): a real tablist (R6 / R10) */}
            {!isAdaptive && fixedSession && fixedSession.sections.length > 1 && (
              <div role="tablist" aria-label="Sections" data-section-tabs="" className="[scrollbar-width:none] [&::-webkit-scrollbar]:hidden flex items-center gap-1.5 overflow-x-auto rounded-2xl bg-ink-100 p-1 lg:flex-wrap lg:overflow-visible">
                {fixedSession.sections.map((sec) => {
                  const isCurrentSec = currentQ?.sectionId === sec.id;
                  const secQuestions = fixedSession.questions.filter((q) => q.sectionId === sec.id);
                  const secAnswered = secQuestions.filter((q) => Boolean(answers[q.mockQuestionId]?.selectedOption)).length;
                  return (
                    <button
                      key={sec.id}
                      type="button"
                      role="tab"
                      aria-selected={isCurrentSec}
                      onClick={() => {
                        const firstInSec = fixedSession.questions.findIndex((q) => q.sectionId === sec.id);
                        if (firstInSec !== -1) navigateToQuestionIndex(firstInSec);
                      }}
                      className={`focus-ring min-h-12 px-3 text-body-sm font-semibold rounded-xl whitespace-nowrap lg:whitespace-normal flex items-center gap-2 border-b-2 ${
                        isCurrentSec ? "bg-surface text-fg border-primary-600 shadow-xs" : "text-fg-secondary border-transparent hover:text-fg"
                      }`}
                    >
                      <span>{sec.name}</span>
                      <span className="text-caption text-fg-secondary tabular-nums">
                        {secAnswered}/{secQuestions.length}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {currentQ && (
              <QuestionRenderer
                questionNumber={currentQ.questionOrder}
                totalQuestions={isAdaptive ? undefined : fixedSession?.questions.length || 0}
                questionText={currentQ.questionText || ""}
                questionImageUrl={currentQ.questionImageUrl}
                marks={currentQ.marks || 1}
                negativeMark={currentQ.negativeMark || 0}
                sectionName={currentQ.sectionName}
              />
            )}

            {currentQ && (
              <QuestionOptions
                options={currentQ.options || []}
                optionsType={currentQ.optionsType}
                selectedOption={currentAnswer.selectedOption}
                onSelectOption={handleSelectOption}
                disabled={isSubmitting || isStepTransitioning || isViewingPastStep}
                label={`Answer options for question ${currentQ.questionOrder}`}
              />
            )}

            {/* F3-polish: "Report this question" is a quiet link under the options, not in the control row */}
            {currentQ && (
              <div className="flex justify-end" data-report-slot="">
                <ReportQuestionButton
                  questionId={currentQ.questionId ?? null}
                  questionVersionId={currentQ.questionVersionId || null}
                  className="min-h-12 px-2 text-body-sm font-medium text-fg-secondary hover:text-fg"
                />
              </div>
            )}
          </div>

          {/* Desktop action footer — CBT controls; ONE primary (Save & Next) */}
          <div className="hidden md:flex relative z-10 max-w-3xl w-full mx-auto pt-4 mt-6 border-t border-line flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {isAdaptive ? (
                <Button type="button" size="lg" variant="outline" disabled={isViewingPastStep || isStepTransitioning} aria-pressed={currentAnswer.isMarkedForReview} className="min-h-12 font-semibold" onClick={handleToggleReview}>
                  <Bookmark aria-hidden="true" className="mr-1.5 size-4" />
                  {currentAnswer.isMarkedForReview ? "Marked for review" : "Mark for review"}
                </Button>
              ) : (
                <Button type="button" size="lg" variant="outline" className="min-h-12 font-semibold" onClick={handleMarkAndNext} data-cbt="mark-next">
                  <Bookmark aria-hidden="true" className="mr-1.5 size-4" /> Mark for Review &amp; Next
                </Button>
              )}
              <Button type="button" size="lg" variant="ghost" disabled={!currentAnswer.selectedOption || isViewingPastStep || isStepTransitioning} onClick={executeClearResponse} className="min-h-12 font-semibold" data-cbt="clear">
                <RotateCcw aria-hidden="true" className="mr-1.5 size-4" /> Clear Response
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="lg"
                variant="outline"
                disabled={isAdaptive ? viewingStepNumber <= 1 || isStepTransitioning : currentIndex === 0}
                onClick={() => (isAdaptive ? setViewingStepNumber((prev) => Math.max(1, prev - 1)) : navigateToQuestionIndex(currentIndex - 1))}
                className="min-h-12 font-semibold"
              >
                <ChevronLeft aria-hidden="true" className="mr-1 size-4" /> Previous
              </Button>
              {isAdaptive ? (
                stoppingRuleMet || activeStepNumber >= (adaptiveSession?.adaptive.maxQuestions || 50) ? (
                  <Button type="button" size="lg" onClick={() => setIsSubmitOpen(true)} className="min-h-12 font-semibold">
                    Review &amp; submit <Send aria-hidden="true" className="ml-1.5 size-4" />
                  </Button>
                ) : (
                  <Button type="button" size="lg" disabled={isStepTransitioning} onClick={handleAdaptiveNextStep} className="min-h-12 min-w-[150px] font-semibold">
                    {isStepTransitioning ? "Saving…" : "Save & Next"} <ChevronRight aria-hidden="true" className="ml-1 size-4" />
                  </Button>
                )
              ) : (
                <Button type="button" size="lg" onClick={handleSaveAndNext} className="min-h-12 font-semibold" data-cbt="save-next">
                  {isLastFixed ? "Save & review summary" : "Save & Next"} <ChevronRight aria-hidden="true" className="ml-1 size-4" />
                </Button>
              )}
            </div>
          </div>
        </main>

        {/* Question palette sidebar (desktop) — the section tabs above the question are the one section switcher */}
        <aside className="hidden lg:block w-80 bg-surface-sunken border-l border-line p-5 overflow-y-auto shrink-0 space-y-4">
          <QuestionPalette
            questions={sectionPaletteItems}
            currentOrder={isAdaptive ? viewingStepNumber : currentQ?.questionOrder || 1}
            sectionName={currentSection?.name}
            globalTotal={isAdaptive ? undefined : fixedSession?.questions.length}
            globalAnswered={answeredCount}
            onSelectQuestion={navigateToQuestionOrder}
          />
        </aside>
      </div>

      {/* ========================================================================= */}
      {/* MOBILE BOTTOM ACTION BAR — ONE primary (Save & Next); Submit lives in the palette sheet / last question */}
      {/* ========================================================================= */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-surface border-t border-line z-30 px-3 pt-2 pb-[max(0.6rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-2 pb-2">
          {isAdaptive ? (
            <Button type="button" size="lg" variant="outline" disabled={isViewingPastStep || isStepTransitioning} aria-pressed={currentAnswer.isMarkedForReview} onClick={handleToggleReview} className="min-h-12 flex-1 font-semibold">
              <Bookmark aria-hidden="true" className="mr-1 size-4" /> {currentAnswer.isMarkedForReview ? "Marked" : "Mark"}
            </Button>
          ) : (
            <Button type="button" size="lg" variant="outline" onClick={handleMarkAndNext} className="min-h-12 flex-1 font-semibold">
              <Bookmark aria-hidden="true" className="mr-1 size-4" /> Mark &amp; Next
            </Button>
          )}
          <Button type="button" size="lg" variant="ghost" disabled={!currentAnswer.selectedOption || isViewingPastStep || isStepTransitioning} onClick={executeClearResponse} className="min-h-12 flex-1 font-semibold">
            <RotateCcw aria-hidden="true" className="mr-1 size-4" /> Clear
          </Button>
          <button type="button" onClick={() => setIsInstructionsOpen(true)} aria-label="Instructions" className={`${iconButton} border border-line`}>
            <HelpCircle aria-hidden="true" className="size-5" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="lg"
            variant="outline"
            disabled={isAdaptive ? viewingStepNumber <= 1 || isStepTransitioning : currentIndex === 0}
            onClick={() => (isAdaptive ? setViewingStepNumber((prev) => Math.max(1, prev - 1)) : navigateToQuestionIndex(currentIndex - 1))}
            className="min-h-12 flex-1 font-semibold"
          >
            <ChevronLeft aria-hidden="true" className="mr-0.5 size-4" /> Prev
          </Button>
          {isAdaptive ? (
            stoppingRuleMet || activeStepNumber >= (adaptiveSession?.adaptive.maxQuestions || 50) ? (
              <Button type="button" size="lg" disabled={isSubmitting || isStepTransitioning} onClick={() => setIsSubmitOpen(true)} className="min-h-12 flex-[2] font-semibold">
                Review &amp; submit
              </Button>
            ) : (
              <Button type="button" size="lg" disabled={isStepTransitioning} onClick={handleAdaptiveNextStep} className="min-h-12 flex-[2] font-semibold">
                {isStepTransitioning ? "Saving…" : "Save & Next"} <ChevronRight aria-hidden="true" className="ml-0.5 size-4" />
              </Button>
            )
          ) : (
            <Button type="button" size="lg" onClick={handleSaveAndNext} className="min-h-12 flex-[2] font-semibold">
              {isLastFixed ? "Save & review" : "Save & Next"} <ChevronRight aria-hidden="true" className="ml-0.5 size-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Mobile palette: accessible bottom sheet (focus trap, Esc) */}
      <Dialog open={isMobilePaletteOpen} onOpenChange={setIsMobilePaletteOpen} variant="sheet" title="Question palette">
        <div className="flex flex-col gap-4">
          {!isAdaptive && fixedSession && fixedSession.sections.length > 1 && (
            <div role="tablist" aria-label="Sections" className="[scrollbar-width:none] [&::-webkit-scrollbar]:hidden flex items-center gap-1 overflow-x-auto pb-1">
              {fixedSession.sections.map((sec) => (
                <button
                  key={sec.id}
                  type="button"
                  role="tab"
                  aria-selected={currentQ?.sectionId === sec.id}
                  onClick={() => {
                    const firstInSec = fixedSession.questions.findIndex((q) => q.sectionId === sec.id);
                    if (firstInSec !== -1) navigateToQuestionIndex(firstInSec);
                  }}
                  className={`focus-ring min-h-12 px-3 text-body-sm font-semibold rounded-lg whitespace-nowrap ${currentQ?.sectionId === sec.id ? "bg-primary-50 text-fg border-2 border-primary-600" : "bg-ink-100 text-fg"}`}
                >
                  {sec.name}
                </button>
              ))}
            </div>
          )}
          <QuestionPalette
            questions={sectionPaletteItems}
            currentOrder={isAdaptive ? viewingStepNumber : currentQ?.questionOrder || 1}
            sectionName={currentSection?.name}
            globalTotal={isAdaptive ? undefined : fixedSession?.questions.length}
            globalAnswered={answeredCount}
            onSelectQuestion={(order) => {
              navigateToQuestionOrder(order);
              setIsMobilePaletteOpen(false);
            }}
          />
          <Button
            size="lg"
            variant="outline"
            className="min-h-12 w-full font-semibold"
            onClick={() => {
              setIsMobilePaletteOpen(false);
              flushCurrentQuestionActiveTime();
              setIsSubmitOpen(true);
            }}
          >
            <Send aria-hidden="true" className="mr-1.5 size-4" /> Submit test
          </Button>
        </div>
      </Dialog>

      {/* Clear Response: one click + quiet undo (R6 / R8) */}
      {undoClearState && (
        <div role="status" className="fixed bottom-36 md:bottom-6 left-1/2 -translate-x-1/2 z-50 bg-ink-900 text-fg-inverse text-body-sm font-medium pl-4 pr-1.5 py-1.5 rounded-2xl shadow-e2 flex items-center gap-3">
          <span>Response cleared</span>
          <button type="button" onClick={handleUndoClear} className="focus-ring-on-dark min-h-12 rounded-xl bg-surface px-3 text-body-sm font-semibold text-fg flex items-center gap-1">
            <Undo2 aria-hidden="true" className="size-4" /> Undo
          </button>
        </div>
      )}

      {/* Submitting / time over: non-dismissible status dialog; a failed AUTO submit shows a retry here (R7) */}
      <Dialog
        open={showSubmitOverlay}
        onOpenChange={() => undefined}
        dismissible={false}
        title={
          submissionState === "error"
            ? "Your test was not submitted yet"
            : submissionState === "time_expired"
            ? "Time is over"
            : "Submitting your test"
        }
        footer={
          submissionState === "error" ? (
            <Button size="lg" className="min-h-12" onClick={() => handleSubmitAttempt(true)} data-retry-submit="">
              Try submitting again
            </Button>
          ) : undefined
        }
      >
        <div className="flex items-start gap-3 text-body text-fg-secondary" data-submit-overlay={submissionState}>
          {submissionState === "error" ? (
            <AlertCircle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-danger-700" />
          ) : (
            <RefreshCw aria-hidden="true" className="mt-0.5 size-5 shrink-0 animate-spin text-primary-600 motion-reduce:animate-none" />
          )}
          <p role="status">
            {submissionState === "error"
              ? submissionError ?? "Your answers are kept. Please try again."
              : submissionState === "time_expired"
              ? "Your answers saved so far are being submitted. Please keep this page open."
              : "Please keep this page open."}
          </p>
        </div>
      </Dialog>

      <SubmitDialog
        isOpen={isSubmitOpen}
        answeredCount={answeredCount}
        unansweredCount={unansweredCount}
        markedCount={markedCount}
        sectionsSummary={sectionsSummary}
        stateCounts={stateCounts}
        onConfirm={() => handleSubmitAttempt(false)}
        onCancel={() => setIsSubmitOpen(false)}
        isSubmitting={isSubmitting}
        submissionError={submissionError}
      />

      <InstructionsModal isOpen={isInstructionsOpen} onClose={() => setIsInstructionsOpen(false)} />
    </div>
  );
}

/** R7: the save status is never optimistic — "Saved" only when every answer is confirmed by the server. */
function SaveStatusChip({ status, compact = false }: { status: SaveStatus; compact?: boolean }) {
  const view: Record<SaveStatus, { icon: React.ReactNode; text: string; short: string; tone: string }> = {
    saved: { icon: <Check aria-hidden="true" className="size-4 text-success-700" />, text: "Saved", short: "Saved", tone: "text-fg" },
    saving: { icon: <RefreshCw aria-hidden="true" className="size-4 animate-spin text-primary-600 motion-reduce:animate-none" />, text: "Saving…", short: "Saving…", tone: "text-fg" },
    retrying: { icon: <AlertCircle aria-hidden="true" className="size-4 text-danger-700" />, text: "Not saved — retrying", short: "Not saved — retrying", tone: "text-danger-800" },
    offline: { icon: <WifiOff aria-hidden="true" className="size-4 text-fg-secondary" />, text: "Offline — kept on this device", short: "Offline", tone: "text-fg" },
    closed: { icon: <AlertCircle aria-hidden="true" className="size-4 text-fg-secondary" />, text: "Time is over — saving stopped", short: "Saving stopped", tone: "text-fg" },
  };
  const v = view[status];
  return (
    <div role="status" aria-live="polite" data-save-status={status} className={`flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-caption font-semibold ${v.tone}`}>
      {v.icon}
      <span>{compact ? v.short : v.text}</span>
    </div>
  );
}
