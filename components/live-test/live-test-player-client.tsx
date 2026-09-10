"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps */

import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ActiveLiveTestSession, LiveAnswerPayload } from "@/types/live-test";
import { BrandLogo } from "@/components/brand/logo";
import { QuestionRenderer } from "@/components/assessment/question-renderer";
import { QuestionOptions } from "@/components/assessment/question-options";
import { QuestionPalette, QuestionPaletteItem, QuestionStatus } from "@/components/assessment/question-palette";
import { SubmitDialog, SectionSubmitSummary } from "@/components/assessment/submit-dialog";
import { CandidateSecurityWatermark } from "@/components/assessment/candidate-security-watermark";
import { saveLiveAnswerAction, submitLiveAttemptAction } from "@/app/live-tests/actions";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  Bookmark,
  RotateCcw,
  Menu,
  X,
  WifiOff,
  CheckCircle2,
  AlertTriangle,
  Radio,
  Clock
} from "lucide-react";

interface LiveTestPlayerClientProps {
  session: ActiveLiveTestSession;
}

interface SavedAnswerState {
  selectedOption: string | null;
  isMarkedForReview: boolean;
  timeSpentSeconds: number;
}

type SaveStatus = "saved" | "saving" | "offline" | "synced";

export function LiveTestPlayerClient({ session }: LiveTestPlayerClientProps) {
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState(0);

  // Initialize answers from session
  const [answers, setAnswers] = useState<Record<string, SavedAnswerState>>(() => {
    const initial: Record<string, SavedAnswerState> = {};
    (session.questions || []).forEach((q) => {
      if (q.savedAnswer) {
        initial[q.mockQuestionId] = {
          selectedOption: q.savedAnswer.selectedOption || null,
          isMarkedForReview: q.savedAnswer.isMarkedForReview || false,
          timeSpentSeconds: q.savedAnswer.timeSpentSeconds || 0,
        };
      }
    });
    return initial;
  });

  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMobilePaletteOpen, setIsMobilePaletteOpen] = useState(false);
  const [multiTabConflict, setMultiTabConflict] = useState(false);

  // Sequence tracking
  const clientSequenceRef = useRef<number>(1);
  const questionStartTimeRef = useRef<number>(Date.now());
  const answersRef = useRef(answers);
  answersRef.current = answers;

  // Server-authoritative timer countdown
  const [remainingSeconds, setRemainingSeconds] = useState<number>(() => {
    const effectiveEndMs = new Date(session.effectiveEndAt).getTime();
    return Math.max(0, Math.floor((effectiveEndMs - Date.now()) / 1000));
  });

  // Local Storage persistence key
  const localCacheKey = `live_attempt_${session.attemptId}`;

  // 1. Sync timer with server authoritative wall clock
  useEffect(() => {
    const timer = setInterval(() => {
      const effectiveEndMs = new Date(session.effectiveEndAt).getTime();
      const currentRemaining = Math.max(0, Math.floor((effectiveEndMs - Date.now()) / 1000));
      setRemainingSeconds(currentRemaining);

      if (currentRemaining <= 0) {
        clearInterval(timer);
        handleAutoSubmit();
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [session.effectiveEndAt]);

  // 2. Multi-tab coordination via BroadcastChannel
  useEffect(() => {
    if (typeof window === "undefined" || !("BroadcastChannel" in window)) return;

    const channel = new BroadcastChannel(`live_test_${session.attemptId}`);
    channel.postMessage({ type: "TAB_OPENED", timestamp: Date.now() });

    channel.onmessage = (event) => {
      if (event.data?.type === "TAB_OPENED") {
        setMultiTabConflict(true);
      } else if (event.data?.type === "ANSWER_SYNCED" && event.data?.answers) {
        setAnswers((prev) => ({ ...prev, ...event.data.answers }));
      }
    };

    return () => channel.close();
  }, [session.attemptId]);

  // 3. Current Question
  const currentQuestion = session.questions[currentIndex];

  // 4. Save answer to server (debounced / background)
  const syncAnswerToServer = useCallback(
    async (mockQuestionId: string, questionVersionId: string, answerState: SavedAnswerState) => {
      setSaveStatus("saving");
      clientSequenceRef.current += 1;
      const seq = clientSequenceRef.current;

      try {
        // Immediate local storage backup
        try {
          const cached = JSON.parse(localStorage.getItem(localCacheKey) || "{}");
          cached[mockQuestionId] = { ...answerState, sequence: seq, updatedAt: Date.now() };
          localStorage.setItem(localCacheKey, JSON.stringify(cached));
        } catch {
          // Ignore local storage error
        }

        const payload: LiveAnswerPayload = {
          attemptId: session.attemptId,
          mockQuestionId,
          questionVersionId,
          selectedOption: answerState.selectedOption,
          isMarkedForReview: answerState.isMarkedForReview,
          timeSpentSeconds: answerState.timeSpentSeconds,
          clientSequence: seq,
        };

        const res = await saveLiveAnswerAction(payload);
        if (res && res.success) {
          setSaveStatus("synced");
          setTimeout(() => setSaveStatus("saved"), 1500);

          // Broadcast to peer tabs
          if (typeof window !== "undefined" && "BroadcastChannel" in window) {
            const channel = new BroadcastChannel(`live_test_${session.attemptId}`);
            channel.postMessage({
              type: "ANSWER_SYNCED",
              answers: { [mockQuestionId]: answerState },
            });
            channel.close();
          }
        } else if (res && "autoSubmitted" in res && res.autoSubmitted) {
          router.push(`/live-tests/${session.eventSlug}/submitted`);
        } else {
          setSaveStatus("offline");
        }
      } catch {
        setSaveStatus("offline");
      }
    },
    [session.attemptId, session.eventSlug, localCacheKey, router]
  );

  // 5. User selects an option (NO AUTO ADVANCE)
  const handleSelectOption = useCallback(
    (optionKey: string) => {
      if (!currentQuestion) return;
      const qId = currentQuestion.mockQuestionId;
      const timeSpentOnQ = Math.floor((Date.now() - questionStartTimeRef.current) / 1000);
      const prev = answersRef.current[qId] || {
        selectedOption: null,
        isMarkedForReview: false,
        timeSpentSeconds: 0,
      };

      const updatedState: SavedAnswerState = {
        selectedOption: prev.selectedOption === optionKey ? null : optionKey, // Toggle
        isMarkedForReview: prev.isMarkedForReview,
        timeSpentSeconds: prev.timeSpentSeconds + timeSpentOnQ,
      };

      questionStartTimeRef.current = Date.now();
      setAnswers((prevAll) => ({ ...prevAll, [qId]: updatedState }));
      syncAnswerToServer(qId, currentQuestion.questionVersionId, updatedState);
    },
    [currentQuestion, syncAnswerToServer]
  );

  // 6. Toggle Mark for Review
  const handleToggleMarkForReview = useCallback(() => {
    if (!currentQuestion) return;
    const qId = currentQuestion.mockQuestionId;
    const timeSpentOnQ = Math.floor((Date.now() - questionStartTimeRef.current) / 1000);
    const prev = answersRef.current[qId] || {
      selectedOption: null,
      isMarkedForReview: false,
      timeSpentSeconds: 0,
    };

    const updatedState: SavedAnswerState = {
      selectedOption: prev.selectedOption,
      isMarkedForReview: !prev.isMarkedForReview,
      timeSpentSeconds: prev.timeSpentSeconds + timeSpentOnQ,
    };

    questionStartTimeRef.current = Date.now();
    setAnswers((prevAll) => ({ ...prevAll, [qId]: updatedState }));
    syncAnswerToServer(qId, currentQuestion.questionVersionId, updatedState);
  }, [currentQuestion, syncAnswerToServer]);

  // 7. Clear Response
  const handleClearResponse = useCallback(() => {
    if (!currentQuestion) return;
    const qId = currentQuestion.mockQuestionId;
    const timeSpentOnQ = Math.floor((Date.now() - questionStartTimeRef.current) / 1000);
    const prev = answersRef.current[qId] || {
      selectedOption: null,
      isMarkedForReview: false,
      timeSpentSeconds: 0,
    };

    const updatedState: SavedAnswerState = {
      selectedOption: null,
      isMarkedForReview: prev.isMarkedForReview,
      timeSpentSeconds: prev.timeSpentSeconds + timeSpentOnQ,
    };

    questionStartTimeRef.current = Date.now();
    setAnswers((prevAll) => ({ ...prevAll, [qId]: updatedState }));
    syncAnswerToServer(qId, currentQuestion.questionVersionId, updatedState);
  }, [currentQuestion, syncAnswerToServer]);

  // 8. Navigation (Manual Next / Prev)
  const handleNext = useCallback(() => {
    if (currentIndex < session.questions.length - 1) {
      questionStartTimeRef.current = Date.now();
      setCurrentIndex((prev) => prev + 1);
    }
  }, [currentIndex, session.questions.length]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      questionStartTimeRef.current = Date.now();
      setCurrentIndex((prev) => prev - 1);
    }
  }, [currentIndex]);

  const handleSelectQuestionOrder = useCallback((order: number) => {
    const idx = session.questions.findIndex((q) => q.questionOrder === order);
    if (idx !== -1) {
      questionStartTimeRef.current = Date.now();
      setCurrentIndex(idx);
      setIsMobilePaletteOpen(false);
    }
  }, [session.questions]);

  // 9. Auto-submit on Expiry
  const handleAutoSubmit = useCallback(async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await submitLiveAttemptAction(session.attemptId, true);
    } catch {
      // Ignore error on expiry
    }
    router.push(`/live-tests/${session.eventSlug}/submitted`);
  }, [isSubmitting, session.attemptId, session.eventSlug, router]);

  // 10. Manual Submit
  const handleManualSubmit = useCallback(async () => {
    setIsSubmitting(true);
    try {
      const res = await submitLiveAttemptAction(session.attemptId, false);
      if (res.success) {
        try {
          localStorage.removeItem(localCacheKey);
        } catch {}
        router.push(`/live-tests/${session.eventSlug}/submitted`);
      } else {
        alert(res.error || "Submission failed. Please check your connection.");
        setIsSubmitting(false);
      }
    } catch {
      alert("Submission failed. Please try again.");
      setIsSubmitting(false);
    }
  }, [session.attemptId, session.eventSlug, localCacheKey, router]);

  // Palette Items
  const paletteQuestions: QuestionPaletteItem[] = useMemo(() => {
    return session.questions.map((q, idx) => {
      const a = answers[q.mockQuestionId];
      const hasAnswer = Boolean(a?.selectedOption);
      const isMarked = Boolean(a?.isMarkedForReview);

      let status: QuestionStatus = "not_visited";
      if (hasAnswer && isMarked) status = "marked_answered";
      else if (isMarked) status = "marked";
      else if (hasAnswer) status = "answered";
      else if (idx === currentIndex) status = "not_answered";

      return {
        questionOrder: q.questionOrder,
        status,
      };
    });
  }, [session.questions, answers, currentIndex]);

  const answeredCount = Object.values(answers).filter((a) => a.selectedOption !== null).length;
  const markedCount = Object.values(answers).filter((a) => a.isMarkedForReview).length;
  const unansweredCount = session.questions.length - answeredCount;

  // Sections Summary for Submit Dialog
  const sectionsSummary: SectionSubmitSummary[] = useMemo(() => {
    return session.sections.map((s) => {
      const sectionQuestions = session.questions.filter((q) => q.sectionId === s.id);
      const secAnswered = sectionQuestions.filter((q) => Boolean(answers[q.mockQuestionId]?.selectedOption)).length;
      return {
        id: s.id,
        name: s.name,
        totalQuestions: sectionQuestions.length,
        answeredCount: secAnswered,
      };
    });
  }, [session.sections, session.questions, answers]);

  // Format Time Remaining (HH:MM:SS)
  const formatRemainingTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) {
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const isLowTime = remainingSeconds <= 300; // Under 5 mins

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 select-none overflow-hidden">
      {/* Top Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-3">
          <BrandLogo className="h-6 w-auto" />
          <div className="h-4 w-px bg-slate-700 hidden sm:block" />
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
              <Radio className="w-3 h-3 animate-pulse text-rose-500" />
              LIVE MOCK
            </span>
            <h1 className="text-sm font-semibold text-slate-200 hidden md:block max-w-[300px] truncate">
              {session.eventTitle}
            </h1>
          </div>
        </div>

        {/* Sync Indicator + Timer + Submit */}
        <div className="flex items-center gap-4">
          {/* Sync Status Badge */}
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400">
            {saveStatus === "saving" && (
              <span className="text-amber-400 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                Saving...
              </span>
            )}
            {saveStatus === "synced" && (
              <span className="text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Saved
              </span>
            )}
            {saveStatus === "offline" && (
              <span className="text-rose-400 flex items-center gap-1">
                <WifiOff className="w-3.5 h-3.5" />
                Offline (Saved locally)
              </span>
            )}
            {saveStatus === "saved" && (
              <span className="text-slate-500 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Synced
              </span>
            )}
          </div>

          {/* Authoritative Timer */}
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border font-mono text-sm font-bold ${
              isLowTime
                ? "bg-rose-950/40 text-rose-400 border-rose-500/40 animate-pulse"
                : "bg-slate-800/80 text-emerald-400 border-slate-700"
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>{formatRemainingTime(remainingSeconds)}</span>
          </div>

          {/* Submit Button */}
          <Button
            onClick={() => setIsSubmitModalOpen(true)}
            disabled={isSubmitting}
            className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2 rounded-lg"
          >
            Submit Test
          </Button>

          {/* Mobile Palette Toggle */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsMobilePaletteOpen(!isMobilePaletteOpen)}
            className="lg:hidden p-2 text-slate-400 border-slate-700"
          >
            {isMobilePaletteOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </Button>
        </div>
      </header>

      {/* Multi-Tab Warning Banner */}
      {multiTabConflict && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 flex items-center justify-between text-xs text-amber-300">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              Another browser tab was opened for this live exam. Answers will remain synchronized across tabs.
            </span>
          </div>
          <button
            onClick={() => setMultiTabConflict(false)}
            className="text-amber-400 hover:text-amber-200"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Runner Body */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Candidate Security Watermark */}
        <CandidateSecurityWatermark />

        {/* Left / Center: Question & Options */}
        <main className="flex-1 flex flex-col overflow-y-auto bg-slate-950 p-4 md:p-6 lg:p-8">
          {currentQuestion ? (
            <div className="max-w-4xl w-full mx-auto flex flex-col flex-1">
              {/* Question Text & Media */}
              <div className="flex-1 mb-6">
                <QuestionRenderer
                  questionNumber={currentIndex + 1}
                  totalQuestions={session.questions.length}
                  questionText={currentQuestion.questionText}
                  questionImageUrl={currentQuestion.questionImageUrl || null}
                  marks={currentQuestion.marks}
                  negativeMark={currentQuestion.negativeMark}
                  sectionName={currentQuestion.sectionName}
                />

                {/* Options List */}
                <div className="mt-6">
                  <QuestionOptions
                    options={currentQuestion.options}
                    selectedOption={answers[currentQuestion.mockQuestionId]?.selectedOption || null}
                    onSelectOption={handleSelectOption}
                  />
                </div>
              </div>

              {/* Action Buttons Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-800 mt-auto shrink-0">
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleToggleMarkForReview}
                    className={`text-xs gap-1.5 border-slate-700 ${
                      answers[currentQuestion.mockQuestionId]?.isMarkedForReview
                        ? "bg-purple-950/40 text-purple-400 border-purple-500/40"
                        : "text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    <Bookmark className="w-3.5 h-3.5" />
                    {answers[currentQuestion.mockQuestionId]?.isMarkedForReview
                      ? "Marked for Review"
                      : "Mark for Review"}
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClearResponse}
                    disabled={!answers[currentQuestion.mockQuestionId]?.selectedOption}
                    className="text-xs text-slate-400 hover:text-slate-200"
                  >
                    <RotateCcw className="w-3.5 h-3.5 mr-1" />
                    Clear Response
                  </Button>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePrev}
                    disabled={currentIndex === 0}
                    className="text-xs text-slate-300 border-slate-700 hover:bg-slate-800"
                  >
                    <ChevronLeft className="w-4 h-4 mr-1" />
                    Previous
                  </Button>

                  <Button
                    size="sm"
                    onClick={handleNext}
                    disabled={currentIndex === session.questions.length - 1}
                    className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white"
                  >
                    Next
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-slate-500">
              No questions found in this live mock test paper.
            </div>
          )}
        </main>

        {/* Right Sidebar: Palette */}
        <aside
          className={`fixed lg:static inset-y-0 right-0 z-40 w-80 bg-slate-900 border-l border-slate-800 flex flex-col transition-transform duration-300 ${
            isMobilePaletteOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"
          }`}
        >
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              Question Palette
            </h2>
            <button
              onClick={() => setIsMobilePaletteOpen(false)}
              className="lg:hidden text-slate-400 hover:text-slate-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <QuestionPalette
              questions={paletteQuestions}
              currentOrder={currentQuestion?.questionOrder || 1}
              sectionName={currentQuestion?.sectionName}
              globalTotal={session.questions.length}
              globalAnswered={answeredCount}
              onSelectQuestion={handleSelectQuestionOrder}
            />
          </div>
        </aside>
      </div>

      {/* Submit Confirmation Modal */}
      <SubmitDialog
        isOpen={isSubmitModalOpen}
        onCancel={() => setIsSubmitModalOpen(false)}
        onConfirm={handleManualSubmit}
        isSubmitting={isSubmitting}
        answeredCount={answeredCount}
        markedCount={markedCount}
        unansweredCount={unansweredCount}
        sectionsSummary={sectionsSummary}
      />
    </div>
  );
}
