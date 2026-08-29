"use client";

import React, { useState } from "react";
import Link from "next/link";
import { StreakRecoveryEligibility, StreakRecoveryResult } from "@/services/gamification.service";

interface StreakRecoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  eligibility: StreakRecoveryEligibility | null;
  onSuccess?: (result: StreakRecoveryResult) => void;
}

export function StreakRecoveryModal({
  isOpen,
  onClose,
  eligibility,
  onSuccess,
}: StreakRecoveryModalProps) {
  const [step, setStep] = useState<"REVIEW" | "CONFIRM" | "SUCCESS">("REVIEW");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<StreakRecoveryResult | null>(null);

  if (!isOpen || !eligibility) return null;

  const currentStreak = eligibility.currentStreak;
  const freezesHeld = eligibility.freezesHeld;
  const formattedDate = eligibility.formattedMissedDate || eligibility.missedDate || "your missed study day";
  const hasShields = freezesHeld >= 1;

  const handleStartConfirm = () => {
    if (!hasShields) return;
    setErrorMsg(null);
    setStep("CONFIRM");
  };

  const handleCancelConfirm = () => {
    setStep("REVIEW");
  };

  const handleExecuteRecovery = async () => {
    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/gamification/streak-recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: `streak_freeze_${eligibility.missedDate}_${Date.now()}`,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success || !data.result) {
        setErrorMsg(data.error || "Streak recovery failed. Please try again.");
        setIsSubmitting(false);
        return;
      }

      setSuccessResult(data.result);
      setStep("SUCCESS");
      if (onSuccess) {
        onSuccess(data.result);
      }
    } catch {
      setErrorMsg("Network connection error. Please check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (isSubmitting) return;
    setStep("REVIEW");
    setErrorMsg(null);
    setSuccessResult(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md overflow-hidden bg-white border shadow-2xl rounded-2xl border-slate-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-blue-100 text-blue-700">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                {step === "SUCCESS" ? "Streak Saved" : "Restore Study Streak"}
              </h3>
              <span className="text-[11px] text-slate-500 font-medium">
                {step === "SUCCESS" ? "Recovery completed" : "Streak Freeze Recovery"}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="p-1.5 text-slate-400 transition-colors rounded-lg hover:text-slate-600 hover:bg-slate-100 disabled:opacity-50"
            aria-label="Close dialog"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5">
          {/* STEP 1: REVIEW ELIGIBLE MISSED DAY */}
          {step === "REVIEW" && (
            <div className="space-y-4">
              <div className="text-center space-y-1">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider font-mono">
                  Your streak was interrupted on
                </span>
                <h4 className="text-base font-extrabold text-slate-900">{formattedDate}</h4>
              </div>

              {/* Stats Box */}
              <div className="grid grid-cols-2 gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200/80 text-xs">
                <div className="space-y-0.5">
                  <span className="text-[10px] uppercase font-bold text-slate-400 font-mono">Streak Before Missed Day</span>
                  <div className="flex items-center gap-1 text-base font-black text-amber-600 font-mono">
                    <svg className="w-4 h-4 text-amber-500 fill-amber-500" viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="10" />
                    </svg>
                    <span>{currentStreak} Days</span>
                  </div>
                </div>
                <div className="space-y-0.5">
                  <span className="text-[10px] uppercase font-bold text-slate-400 font-mono">Shields Available</span>
                  <div className="flex items-center gap-1 text-base font-black text-blue-700 font-mono">
                    <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    <span>{freezesHeld} / 2</span>
                  </div>
                </div>
              </div>

              {/* Info Note */}
              <p className="text-xs text-slate-600 leading-relaxed bg-blue-50/50 p-3 rounded-xl border border-blue-100/80">
                Using 1 Streak Freeze Shield protects this missed calendar day and keeps your study streak intact. Your streak will continue when you submit your next qualifying test.
              </p>

              {/* Action Button */}
              {hasShields ? (
                <button
                  type="button"
                  onClick={handleStartConfirm}
                  className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 transition-all shadow-xs active:scale-[0.98]"
                >
                  <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  <span>Use 1 Freeze Shield</span>
                </button>
              ) : (
                <div className="space-y-2 text-center">
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs font-medium text-amber-900">
                    You have 0 / 2 Streak Freeze Shields available.
                  </div>
                  <Link
                    href="/store"
                    onClick={handleClose}
                    className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold text-amber-800 bg-amber-100/80 hover:bg-amber-200/80 transition-colors"
                  >
                    <span>Get a Streak Freeze in Store</span>
                  </Link>
                </div>
              )}
            </div>
          )}

          {/* STEP 2: CONFIRMATION PROMPT */}
          {step === "CONFIRM" && (
            <div className="space-y-4">
              <div className="text-center space-y-1.5">
                <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-2">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <h4 className="text-base font-bold text-slate-900">Protect {formattedDate}?</h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  This will consume <strong>1 Streak Freeze Shield</strong> and preserve your <strong>{currentStreak}-day streak</strong>. The missed day will be marked as <strong>Protected</strong>.
                </p>
                <p className="text-[11px] text-slate-400">This action cannot be undone.</p>
              </div>

              {errorMsg && (
                <div className="p-3 text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-xl">
                  {errorMsg}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={handleCancelConfirm}
                  disabled={isSubmitting}
                  className="py-2.5 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleExecuteRecovery}
                  disabled={isSubmitting}
                  className="inline-flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-xs disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <span>Protecting...</span>
                    </>
                  ) : (
                    <span>Protect This Day</span>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: SUCCESS STATE */}
          {step === "SUCCESS" && (
            <div className="space-y-4 text-center">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-xs">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>

              <div className="space-y-1">
                <h4 className="text-lg font-black text-slate-900">Streak Saved!</h4>
                <p className="text-xs text-slate-600">Your study streak has been successfully protected.</p>
              </div>

              {/* Status Pill Card */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2 text-xs">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 text-amber-900 border border-amber-500/20 font-bold text-xs">
                  <svg className="w-3.5 h-3.5 text-amber-500 fill-amber-500" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" />
                  </svg>
                  <span>{successResult?.preservedStreak || currentStreak}-Day Streak Preserved</span>
                </div>

                <div className="text-[11px] text-slate-600 pt-1 font-medium">
                  <strong>{successResult?.formattedProtectedDate || formattedDate}</strong>
                  <div className="text-[10px] font-bold text-blue-700 uppercase tracking-wider mt-0.5">
                    Protected by Streak Freeze
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px] text-slate-500">
                  <span>1 Freeze Shield used</span>
                  <span className="font-bold text-slate-800">Remaining: {successResult?.remainingShields ?? (freezesHeld - 1)} / 2</span>
                </div>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                Your streak will continue when you complete your next qualifying study session.
              </p>

              <div className="grid grid-cols-2 gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="py-2.5 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
                >
                  View Wallet
                </button>
                <Link
                  href="/mock-tests"
                  onClick={handleClose}
                  className="inline-flex items-center justify-center py-2.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-all shadow-xs"
                >
                  Continue Studying
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

