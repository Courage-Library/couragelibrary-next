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
import { nextProctorSeq, type ProctorEvent } from "@/lib/assessment/proctor";
import { InstructionsModal } from "@/components/assessment/instructions-modal";
import { CandidateSecurityWatermark } from "@/components/assessment/candidate-security-watermark";
import { OfflineAnswerQueue } from "@/lib/assessment/offline-queue";
import { resumeIndex } from "@/lib/assessment/position";
import { createAnswerSync, mergePending, type SaveStatus } from "@/lib/assessment/answer-sync";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/legacy/button";
import {
  ChevronLeft,
  ChevronRight,
  Bookmark,
  Send,
  RotateCcw,
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
  LayoutGrid,
} from "lucide-react";

export type MockTestPlayerSession = ActiveAttemptSession | ActiveAdaptiveSession;

/** Q6 part B: the position is sent to the server this long after the student stops moving between questions */
const POSITION_SAVE_DEBOUNCE_MS = 1500;

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
  // send them again. Q6 part B (099): the last question and the visited set come from the SERVER; this device's copy
  // (localStorage) is only a cache, used when the server has no position yet.
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
    const orders = fixedSession.questions.map((q) => q.questionOrder);
    if (fixedSession.resumeOrder != null) {
      setCurrentIndex(resumeIndex(orders, fixedSession.resumeOrder));
      const visitedIds = fixedSession.questions.filter((q) => (fixedSession.visitedOrders ?? []).includes(q.questionOrder)).map((q) => q.mockQuestionId);
      setVisitedQuestions((prev) => new Set([...prev, ...visitedIds]));
    } else {
      try {
        const saved = JSON.parse(localStorage.getItem(progressKey) || "null") as { index?: number; visited?: string[] } | null;
        if (saved && Number.isInteger(saved.index) && (saved.index as number) >= 0 && (saved.index as number) < fixedSession.questions.length) setCurrentIndex(saved.index as number);
        if (saved && Array.isArray(saved.visited)) setVisitedQuestions((prev) => new Set([...prev, ...saved.visited!.filter((v) => known.has(v))]));
      } catch {
        /* no saved position: start at question 1 */
      }
    }
    // once, on load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!fixedSession) return;
    try {
      localStorage.setItem(progressKey, JSON.stringify({ index: currentIndex, visited: [...visitedQuestions] }));
    } catch {
      /* storage unavailable: resume uses the server position */
    }
  }, [fixedSession, progressKey, currentIndex, visitedQuestions]);

  // Q6 part B: send the position to the server (debounced, fire-and-forget — never blocks or disturbs the test)
  useEffect(() => {
    if (!fixedSession || !isExamStarted) return;
    const q = fixedSession.questions[currentIndex];
    if (!q) return;
    const visited = fixedSession.questions.filter((x) => visitedQuestions.has(x.mockQuestionId)).map((x) => x.questionOrder);
    const t = window.setTimeout(() => {
      fetch("/api/assessment/position", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attemptId: session.attemptId, order: q.questionOrder, visited }),
        keepalive: true,
      }).catch(() => undefined);
    }, POSITION_SAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [fixedSession, isExamStarted, currentIndex, visitedQuestions, session.attemptId]);

  // PROCTOR-LOG-1: fire-and-forget event (server records it only when PROCTOR_LOG_ENABLED and 094 are live); never
  // awaited, never shown — the test is not disturbed (R8)
  const sendProctorEvent = useCallback(
    (type: ProctorEvent) => {
      let storage: Storage | null = null;
      try {
        storage = window.localStorage;
      } catch {
        storage = null;
      }
      const seq = nextProctorSeq(session.attemptId, storage);
      fetch("/api/assessment/proctor-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attemptId: session.attemptId, type, seq }),
        keepalive: true,
      }).catch(() => undefined);
    },
    [session.attemptId]
  );

  // Security: Fullscreen Change Listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isNowFullscreen = Boolean(document.fullscreenElement);
      if (isExamStarted) sendProctorEvent(isNowFullscreen ? "fullscreen_enter" : "fullscreen_exit");
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
  }, [isExamStarted, sendProctorEvent]);

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
        sendProctorEvent("tab_hidden");
        flushCurrentQuestionActiveTime();
        setSecurityState((prev) => ({
          ...prev,
          tabSwitchCount: prev.tabSwitchCount + 1,
        }));
      } else if (document.visibilityState === "visible") {
        sendProctorEvent("tab_visible");
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
  }, [isExamStarted, flushCurrentQuestionActiveTime, sendProctorEvent]);

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
              className="w-full bg-primary-700 hover:bg-primary-800 text-white font-extrabold text-sm rounded-xl shadow-md cursor-pointer"
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
  // status; R8 calm (no blocking alarms — security events are a quiet, non-blocking notice, sent quietly to PROCTOR-LOG-1 (migration 094) — not
  // stored until 094 is applied and PROCTOR_LOG_ENABLED is on; never claim "recorded" before that);
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

  // EXAM-UX-1 (owner spec 23 Nov 2026): the layout fits the viewport (100dvh, no page scroll). Desktop ≥ 1024 px: top
  // bar 60 · section tabs 52 · content (question panel scrolls; palette column fixed) · action bar 68 (always visible).
  // Phone < 1024 px: top bar 54 · tabs 44 (horizontal scroll) · question (scrolls) · action bar 64 + safe area; the palette
  // is a bottom sheet. PRESENTATION ONLY — every handler below is the same as before (no engine change).
  const sections = !isAdaptive && fixedSession && fixedSession.sections.length > 1 ? fixedSession.sections : [];
  const exBtn = "focus-ring inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl px-4 text-body-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50";
  const exOutline = `${exBtn} border border-cl-line-2 bg-cl-white text-cl-charcoal hover:bg-cl-cloud`;
  const exText = `${exBtn} text-cl-slate hover:bg-cl-cloud hover:text-cl-charcoal`;
  const exPrimary = `${exBtn} bg-cl-blue text-cl-white hover:bg-cl-blue-hover`;
  const exIcon = "focus-ring flex size-12 shrink-0 items-center justify-center rounded-xl border border-cl-line-2 bg-cl-white text-cl-charcoal hover:bg-cl-cloud disabled:cursor-not-allowed disabled:opacity-50";
  const goPrevious = () => (isAdaptive ? setViewingStepNumber((prev) => Math.max(1, prev - 1)) : navigateToQuestionIndex(currentIndex - 1));
  const previousDisabled = isAdaptive ? viewingStepNumber <= 1 || isStepTransitioning : currentIndex === 0;
  const clearDisabled = !currentAnswer.selectedOption || isViewingPastStep || isStepTransitioning;
  const reviewAndSubmit = isAdaptive && (stoppingRuleMet || activeStepNumber >= (adaptiveSession?.adaptive.maxQuestions || 50));
  const openSubmit = () => {
    flushCurrentQuestionActiveTime();
    setIsSubmitOpen(true);
  };
  // section tabs: a real tablist; ← / → / Home / End move between tabs (roving tab stop), Enter / Space opens the section
  const onTabsKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const tabs = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    const i = tabs.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    const to = e.key === "ArrowRight" ? (i + 1) % tabs.length : e.key === "ArrowLeft" ? (i - 1 + tabs.length) % tabs.length : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : -1;
    if (to < 0) return;
    e.preventDefault();
    tabs[to].focus();
    tabs[to].scrollIntoView({ block: "nearest", inline: "nearest" });
  };

  return (
    <div className="fixed inset-0 z-50 flex h-dvh flex-col overflow-hidden bg-cl-cloud select-none" data-player="" data-exam-layout="v1">
      {/* Offline: neutral notice (never orange / alarm) */}
      {saveStatus === "offline" && (
        <div role="status" className="flex shrink-0 items-center justify-center gap-2 border-b border-cl-line bg-cl-cloud px-4 py-1.5 text-center text-body-sm font-medium text-cl-charcoal">
          <WifiOff aria-hidden="true" className="size-4 shrink-0" />
          <span>You are offline. Your answers are kept on this device and will be sent when you are back online.</span>
        </div>
      )}

      {/* Adaptive step error: static, next to the action (no slide-in) */}
      {stepTransitionError && (
        <div role="alert" className="flex shrink-0 flex-wrap items-center justify-center gap-3 border-b border-cl-line bg-cl-state-not-answered-tint px-4 py-1.5 text-body-sm font-medium text-cl-timer-red-text">
          <AlertCircle aria-hidden="true" className="size-4 shrink-0" />
          <span>{stepTransitionError}</span>
          <button type="button" onClick={handleAdaptiveNextStep} className={exOutline}>
            <RefreshCw aria-hidden="true" className="size-4" /> Try again
          </button>
        </div>
      )}

      {/* ============================ TOP BAR (60 px desktop / 54 px phone) ============================ */}
      <header className="flex h-[54px] shrink-0 items-center gap-2 border-b border-cl-line bg-cl-white px-3 lg:h-[60px] lg:gap-3 lg:px-5" data-exam-topbar="">
        {/* logo-suite lock-up (mark + wordmark) — a static file of the final suite, never recoloured; mark only on phones */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/courage-library-logo-suite/svg/logo-horizontal.svg" alt="Courage Library" width={132} height={28} className="hidden h-7 w-auto shrink-0 lg:block" data-exam-logo="" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/courage-library-logo-suite/svg/mark.svg" alt="Courage Library" width={28} height={28} className="size-7 shrink-0 lg:hidden" />
        {isAdaptive && (
          <div className="hidden xl:block">
            <AdaptiveProgressBadge
              currentStep={viewingStepNumber}
              minQuestions={adaptiveSession?.adaptive.minQuestions || 20}
              maxQuestions={adaptiveSession?.adaptive.maxQuestions || 50}
              difficultyTier={currentDifficultyTier}
              isStoppingRuleMet={stoppingRuleMet}
            />
          </div>
        )}
        <h1 className="min-w-0 flex-1 truncate text-center text-body-sm font-bold text-cl-charcoal" title={session.testTitle} data-exam-title="">
          {session.testTitle}
        </h1>
        <div className="flex shrink-0 items-center gap-1.5 lg:gap-2">
          <SaveStatusChip status={isStepTransitioning ? "saving" : saveStatus} />
          <AssessmentTimer initialRemainingSeconds={session.remainingSeconds} onTimeExpired={() => handleSubmitAttempt(true)} />
          <button type="button" onClick={() => setIsInstructionsOpen(true)} className={`${exText} max-lg:hidden`} data-header-label="instructions">
            <HelpCircle aria-hidden="true" className="size-4" /> Instructions
          </button>
          <button type="button" onClick={handleReturnToFullscreen} aria-pressed={securityState.isFullscreen} className={`${exText} max-lg:hidden`} data-header-label="fullscreen">
            {securityState.isFullscreen ? <Minimize2 aria-hidden="true" className="size-4" /> : <Maximize2 aria-hidden="true" className="size-4" />} Full screen
          </button>
          {/* quiet secondary action (R4): "Save & Next" stays the one primary action; the existing confirmation opens */}
          <button type="button" disabled={isSubmitting || isStepTransitioning} onClick={openSubmit} className={`${exOutline} max-lg:hidden`} data-submit-test="">
            <Send aria-hidden="true" className="size-4" /> Submit test
          </button>
          <Tooltip content="Question palette" side="bottom" className="lg:hidden">
            <button type="button" className={`lg:hidden ${exIcon}`} onClick={() => setIsMobilePaletteOpen(true)} aria-label="Open question palette" data-palette-open="">
              <LayoutGrid aria-hidden="true" className="size-5" />
            </button>
          </Tooltip>
        </div>
      </header>

      {/* Quiet, non-blocking security notice (R8) */}
      {securityNotice && (
        <div role="status" className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-b border-cl-line bg-cl-blue-tint px-4 py-1 text-body-sm text-cl-charcoal" data-security-notice="">
          <span>{securityNotice}</span>
          {securityState.showFullscreenWarning && (
            <button type="button" className={exOutline} onClick={handleReturnToFullscreen}>
              Return to fullscreen
            </button>
          )}
          <button
            type="button"
            className={exText}
            onClick={() => {
              handleDismissTabWarning();
              setSecurityState((prev) => ({ ...prev, showFullscreenWarning: false }));
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ============================ SECTION TABS (52 px / 44 px): ONE row, horizontal scroll ============================ */}
      {sections.length > 0 && (
        <div
          role="tablist"
          aria-label="Sections"
          data-section-tabs=""
          onKeyDown={onTabsKey}
          className="flex h-11 shrink-0 items-center gap-1 overflow-x-auto border-b border-cl-line bg-cl-cloud px-2 [scrollbar-width:thin] lg:h-[52px] lg:px-4"
        >
          {sections.map((sec) => {
            const isCurrentSec = currentQ?.sectionId === sec.id;
            const secQuestions = fixedSession!.questions.filter((q) => q.sectionId === sec.id);
            const secAnswered = secQuestions.filter((q) => Boolean(answers[q.mockQuestionId]?.selectedOption)).length;
            return (
              <button
                key={sec.id}
                type="button"
                role="tab"
                aria-selected={isCurrentSec}
                tabIndex={isCurrentSec ? 0 : -1}
                onClick={() => {
                  const firstInSec = fixedSession!.questions.findIndex((q) => q.sectionId === sec.id);
                  if (firstInSec !== -1) navigateToQuestionIndex(firstInSec);
                }}
                className={`focus-ring flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-body-sm font-semibold ${
                  isCurrentSec ? "bg-cl-white text-cl-charcoal shadow-xs" : "text-cl-slate hover:text-cl-charcoal"
                }`}
              >
                <span>{sec.name}</span>
                <span className={`text-caption tabular-nums ${isCurrentSec ? "text-cl-blue-text" : "text-cl-slate"}`} data-tab-count="">
                  {secAnswered}/{secQuestions.length}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* ============================ CONTENT: the question panel is the ONE scroll area ============================ */}
      <div className="flex min-h-0 flex-1">
        <main className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain bg-cl-white" data-question-scroll="">
          <CandidateSecurityWatermark
            examTitle={session.testTitle}
            maskedCandidateId={`CL••••${session.attemptId.slice(0, 4).toUpperCase()}`}
            attemptIdShort={session.attemptId.slice(0, 6).toUpperCase()}
            timestamp={new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
            isLighter
          />

          <div className="relative z-10 mx-auto w-full max-w-3xl space-y-4 p-4 sm:space-y-6 sm:p-7">
            {isViewingPastStep && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-cl-line bg-cl-cloud p-2.5 text-body-sm font-medium text-cl-charcoal">
                <span>Viewing step {viewingStepNumber} (answer locked).</span>
                <button type="button" onClick={() => setViewingStepNumber(activeStepNumber)} className={exOutline}>
                  Go to current step ({activeStepNumber})
                </button>
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
                  mockQuestionId={currentQ.mockQuestionId || null}
                  className="min-h-12 px-2 text-body-sm font-medium text-cl-slate hover:text-cl-charcoal"
                />
              </div>
            )}
          </div>
        </main>

        {/* Palette column (desktop): fixed; scrolls on its own only when a section is long (> 25 questions) */}
        <aside className="hidden w-[320px] shrink-0 overflow-y-auto overscroll-contain border-l border-cl-line bg-cl-cloud p-4 lg:block" aria-label="Question palette" data-palette-column="">
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

      {/* ============ ACTION BAR (68 px desktop / 64 px + safe area phone, each = 1 px top border + 67 / 63 px row): always visible ============ */}
      <div className="shrink-0 border-t border-cl-line bg-cl-white px-3 pb-[env(safe-area-inset-bottom)] lg:px-5" data-action-bar="">
        {/* desktop: Mark for review & next · Clear response  …  ‹ Previous · Save & Next › (ONE primary) */}
        <div className="hidden h-[67px] items-center justify-between gap-3 lg:flex">
          <div className="flex items-center gap-2">
            {isAdaptive ? (
              <button type="button" disabled={isViewingPastStep || isStepTransitioning} aria-pressed={currentAnswer.isMarkedForReview} className={exOutline} onClick={handleToggleReview}>
                <Bookmark aria-hidden="true" className="size-4" /> {currentAnswer.isMarkedForReview ? "Marked for review" : "Mark for review"}
              </button>
            ) : (
              <button type="button" className={exOutline} onClick={handleMarkAndNext} data-cbt="mark-next">
                <Bookmark aria-hidden="true" className="size-4" /> Mark for review &amp; next
              </button>
            )}
            <button type="button" disabled={clearDisabled} onClick={executeClearResponse} className={exText} data-cbt="clear">
              <RotateCcw aria-hidden="true" className="size-4" /> Clear response
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" disabled={previousDisabled} onClick={goPrevious} className={exOutline} data-cbt="previous">
              <ChevronLeft aria-hidden="true" className="size-4" /> Previous
            </button>
            {isAdaptive ? (
              reviewAndSubmit ? (
                <button type="button" onClick={() => setIsSubmitOpen(true)} className={exPrimary}>
                  Review &amp; submit <Send aria-hidden="true" className="size-4" />
                </button>
              ) : (
                <button type="button" disabled={isStepTransitioning} onClick={handleAdaptiveNextStep} className={`${exPrimary} min-w-[150px]`}>
                  {isStepTransitioning ? "Saving…" : "Save & Next"} <ChevronRight aria-hidden="true" className="size-4" />
                </button>
              )
            ) : (
              <button type="button" onClick={handleSaveAndNext} className={`${exPrimary} min-w-[150px]`} data-cbt="save-next">
                {isLastFixed ? "Save & review summary" : "Save & Next"} <ChevronRight aria-hidden="true" className="size-4" />
              </button>
            )}
          </div>
        </div>

        {/* phone / tablet: Previous · Mark · Clear (icons with labels + tooltips) · Save & Next (wide primary) */}
        <div className="flex h-[63px] items-center gap-2 lg:hidden">
          <Tooltip content="Previous" side="top">
            <button type="button" disabled={previousDisabled} onClick={goPrevious} aria-label="Previous" className={exIcon} data-cbt-phone="previous">
              <ChevronLeft aria-hidden="true" className="size-5" />
            </button>
          </Tooltip>
          {isAdaptive ? (
            <Tooltip content={currentAnswer.isMarkedForReview ? "Marked for review" : "Mark for review"} side="top">
              <button type="button" disabled={isViewingPastStep || isStepTransitioning} aria-pressed={currentAnswer.isMarkedForReview} onClick={handleToggleReview} aria-label="Mark for review" className={exIcon} data-cbt-phone="mark">
                <Bookmark aria-hidden="true" className="size-5" />
              </button>
            </Tooltip>
          ) : (
            <Tooltip content="Mark for review & next" side="top">
              <button type="button" onClick={handleMarkAndNext} aria-label="Mark for review and next" className={exIcon} data-cbt-phone="mark">
                <Bookmark aria-hidden="true" className="size-5" />
              </button>
            </Tooltip>
          )}
          <Tooltip content="Clear response" side="top">
            <button type="button" disabled={clearDisabled} onClick={executeClearResponse} aria-label="Clear response" className={exIcon} data-cbt-phone="clear">
              <RotateCcw aria-hidden="true" className="size-5" />
            </button>
          </Tooltip>
          {isAdaptive ? (
            reviewAndSubmit ? (
              <button type="button" disabled={isSubmitting || isStepTransitioning} onClick={() => setIsSubmitOpen(true)} className={`${exPrimary} min-h-12 flex-1`}>
                Review &amp; submit
              </button>
            ) : (
              <button type="button" disabled={isStepTransitioning} onClick={handleAdaptiveNextStep} className={`${exPrimary} min-h-12 flex-1`}>
                {isStepTransitioning ? "Saving…" : "Save & Next"} <ChevronRight aria-hidden="true" className="size-4" />
              </button>
            )
          ) : (
            <button type="button" onClick={handleSaveAndNext} className={`${exPrimary} min-h-12 flex-1`} data-cbt-phone="save-next">
              {isLastFixed ? "Save & review" : "Save & Next"} <ChevronRight aria-hidden="true" className="size-4" />
            </button>
          )}
        </div>
      </div>

      {/* Phone palette: accessible bottom sheet (Dialog: focus trap, Esc / overlay close, focus returns) — nothing is lost:
          Instructions + Full screen at the top, then the legend with counts, filters, the grid and Submit test */}
      <Dialog open={isMobilePaletteOpen} onOpenChange={setIsMobilePaletteOpen} variant="sheet" title="Question palette">
        <div className="flex flex-col gap-3" data-palette-sheet="">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setIsMobilePaletteOpen(false);
                setIsInstructionsOpen(true);
              }}
              className={`${exOutline} min-h-12`}
            >
              <HelpCircle aria-hidden="true" className="size-4" /> Instructions
            </button>
            <button type="button" onClick={handleReturnToFullscreen} aria-pressed={securityState.isFullscreen} className={`${exOutline} min-h-12`}>
              {securityState.isFullscreen ? <Minimize2 aria-hidden="true" className="size-4" /> : <Maximize2 aria-hidden="true" className="size-4" />} Full screen
            </button>
          </div>
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
          <button
            type="button"
            disabled={isSubmitting || isStepTransitioning}
            className={`${exOutline} min-h-12 w-full`}
            onClick={() => {
              setIsMobilePaletteOpen(false);
              openSubmit();
            }}
            data-submit-test-sheet=""
          >
            <Send aria-hidden="true" className="size-4" /> Submit test
          </button>
        </div>
      </Dialog>

      {/* Clear Response: one click + quiet undo (R6 / R8) — above the action bar on every width */}
      {undoClearState && (
        <div role="status" className="fixed bottom-[calc(76px+env(safe-area-inset-bottom))] left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-2xl bg-cl-charcoal py-1.5 pl-4 pr-1.5 text-body-sm font-medium text-cl-white shadow-e2 lg:bottom-[84px]">
          <span>Response cleared</span>
          <button type="button" onClick={handleUndoClear} className="focus-ring-on-dark flex min-h-12 items-center gap-1 rounded-xl bg-cl-white px-3 text-body-sm font-semibold text-cl-charcoal">
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
        <div className="flex items-start gap-3 text-body text-cl-charcoal" data-submit-overlay={submissionState}>
          {submissionState === "error" ? (
            <AlertCircle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-cl-timer-red-text" />
          ) : (
            <RefreshCw aria-hidden="true" className="mt-0.5 size-5 shrink-0 animate-spin text-cl-blue motion-reduce:animate-none" />
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

/**
 * R7: the save status is never optimistic — "Saved" only when every answer is confirmed by the server. EXAM-UX-1: one
 * chip for every width (the text is visually hidden below 640 px; the icon + the accessible text stay).
 */
function SaveStatusChip({ status }: { status: SaveStatus }) {
  const view: Record<SaveStatus, { icon: React.ReactNode; text: string; tone: string }> = {
    saved: { icon: <Check aria-hidden="true" className="size-4 text-cl-state-answered" />, text: "Saved", tone: "text-cl-charcoal" },
    saving: { icon: <RefreshCw aria-hidden="true" className="size-4 animate-spin text-cl-blue motion-reduce:animate-none" />, text: "Saving…", tone: "text-cl-charcoal" },
    retrying: { icon: <AlertCircle aria-hidden="true" className="size-4 text-cl-state-not-answered" />, text: "Not saved — retrying", tone: "text-cl-timer-red-text" },
    offline: { icon: <WifiOff aria-hidden="true" className="size-4 text-cl-slate" />, text: "Offline — kept on this device", tone: "text-cl-charcoal" },
    closed: { icon: <AlertCircle aria-hidden="true" className="size-4 text-cl-slate" />, text: "Time is over — saving stopped", tone: "text-cl-charcoal" },
  };
  const v = view[status];
  return (
    <div role="status" aria-live="polite" data-save-status={status} className={`flex min-h-9 items-center gap-1.5 rounded-full border border-cl-line bg-cl-white px-2.5 text-caption font-semibold ${v.tone}`}>
      {v.icon}
      <span className="sr-only sm:not-sr-only">{v.text}</span>
    </div>
  );
}
