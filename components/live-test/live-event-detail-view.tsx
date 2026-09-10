"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */

import React, { useState, useTransition } from "react";
import { type LiveEventCardData } from "@/types/live-test";
import { LiveEventCountdown } from "@/components/live-test/live-event-countdown";
import { registerForLiveTestAction, cancelLiveRegistrationAction } from "@/app/live-tests/actions";
import {
  Calendar,
  Clock,
  CheckCircle2,
  Trophy,
  Users,
  ShieldCheck,
  AlertCircle,
  Sparkles,
  Award,
  BookOpen,
  ArrowLeft,
  Loader2,
  Lock,
} from "lucide-react";
import Link from "next/link";

interface LiveEventDetailViewProps {
  event: LiveEventCardData;
  isLoggedIn: boolean;
}

export function LiveEventDetailView({ event, isLoggedIn }: LiveEventDetailViewProps) {
  const [isPending, startTransition] = useTransition();
  const [isRegistered, setIsRegistered] = useState(event.isRegistered);
  const [registeredCount, setRegisteredCount] = useState(event.registeredCount);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const isRegistrationOpen = event.status === "REGISTRATION_OPEN";
  const isLive = event.status === "LIVE";
  const isCompleted = ["RESULTS_READY", "PUBLISHED", "ARCHIVED"].includes(event.status);

  const handleRegister = () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!isLoggedIn) {
      window.location.href = `/auth/login?redirect=/live-tests/${event.slug}`;
      return;
    }

    startTransition(async () => {
      const res = await registerForLiveTestAction(event.id);
      if (res.success) {
        setIsRegistered(true);
        setRegisteredCount((prev) => prev + 1);
        setSuccessMessage("🎉 Registration Confirmed! You are registered for this All-India Live Mock.");
      } else {
        setErrorMessage(res.error || "Failed to complete registration.");
      }
    });
  };

  const handleCancelRegistration = () => {
    if (!confirm("Are you sure you want to cancel your registration?")) return;
    setErrorMessage(null);
    setSuccessMessage(null);

    startTransition(async () => {
      const res = await cancelLiveRegistrationAction(event.id);
      if (res.success) {
        setIsRegistered(false);
        setRegisteredCount((prev) => Math.max(0, prev - 1));
        setSuccessMessage("Registration has been cancelled.");
      } else {
        setErrorMessage(res.error || "Failed to cancel registration.");
      }
    });
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-16">
      {/* Back Navigation */}
      <div>
        <Link
          href="/live-tests"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Live Tests Directory
        </Link>
      </div>

      {/* Hero Banner Card */}
      <div className="relative overflow-hidden rounded-3xl border border-border/80 bg-gradient-to-br from-card/90 via-card/50 to-primary/5 p-8 shadow-sm">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-primary/10 text-primary border border-primary/20">
              <Award className="w-3.5 h-3.5" />
              {event.examTitle}
            </span>

            {event.isPremiumOnly && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                <Sparkles className="w-3.5 h-3.5" />
                PREMIUM EXCLUSIVE
              </span>
            )}

            {isLive && (
              <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-bold bg-rose-500 text-white animate-pulse">
                <span className="w-2 h-2 rounded-full bg-white" />
                LIVE EXAMINATION IN PROGRESS
              </span>
            )}
          </div>

          <h1 className="text-2xl md:text-4xl font-extrabold text-foreground tracking-tight">
            {event.title}
          </h1>

          {event.description && (
            <p className="text-sm md:text-base text-muted-foreground max-w-3xl leading-relaxed">
              {event.description}
            </p>
          )}

          {/* Key Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-border/60">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground uppercase font-semibold">Duration</p>
                <p className="text-sm font-bold text-foreground">{event.durationMinutes} Minutes</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
                <BookOpen className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground uppercase font-semibold">Questions</p>
                <p className="text-sm font-bold text-foreground">{event.totalQuestions} Questions</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
                <Trophy className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground uppercase font-semibold">Total Marks</p>
                <p className="text-sm font-bold text-foreground">{event.totalMarks} Marks</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground uppercase font-semibold">Candidates</p>
                <p className="text-sm font-bold text-foreground">{registeredCount.toLocaleString()} Registered</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Registration & Countdown Action Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left: Schedule & Rules */}
        <div className="md:col-span-2 space-y-6">
          <div className="rounded-2xl border border-border/60 bg-card/60 backdrop-blur-sm p-6 space-y-4">
            <h2 className="text-base font-bold text-foreground flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" />
              Official Event Schedule (India Standard Time)
            </h2>

            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between py-2 border-b border-border/40">
                <span className="text-muted-foreground">Registration Closes:</span>
                <span className="font-semibold text-foreground">{event.formattedRegEndAt}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-border/40">
                <span className="text-muted-foreground">Live Examination Starts:</span>
                <span className="font-semibold text-foreground">{event.formattedStartAt}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-border/40">
                <span className="text-muted-foreground">Live Examination Concludes:</span>
                <span className="font-semibold text-foreground">{event.formattedEndAt}</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-muted-foreground">All-India Result Publication:</span>
                <span className="font-semibold text-primary">
                  {event.resultPublishAt ? "Published after ranking sweep" : "Same day post-exam"}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border/60 bg-card/60 backdrop-blur-sm p-6 space-y-3">
            <h2 className="text-base font-bold text-foreground flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-primary" />
              All-India Test Rules & Invariants
            </h2>
            <ul className="text-xs text-muted-foreground space-y-2 list-disc list-inside leading-relaxed">
              <li>Strict server-authoritative timer in Asia/Kolkata timezone.</li>
              <li>Single registration per candidate guaranteed.</li>
              <li>Test paper is locked and identical across all candidates.</li>
              <li>National Rank & Percentile computed after all submissions are evaluated.</li>
              <li>Watermarking and full-screen proctoring enabled.</li>
            </ul>
          </div>
        </div>

        {/* Right: Registration / Countdown CTA Box */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm space-y-6 text-center">
            {/* Live Countdown */}
            {!isLive && !isCompleted && (
              <LiveEventCountdown targetDate={event.eventStartAt} label="Event Starts In" variant="hero" />
            )}

            {isLive && (
              <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-center space-y-2">
                <span className="text-xs font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider">
                  Test Window Open
                </span>
                <p className="text-sm font-semibold text-foreground">
                  The examination is currently live.
                </p>
              </div>
            )}

            {/* Notification messages */}
            {successMessage && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300">
                {successMessage}
              </div>
            )}
            {errorMessage && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Primary Action Button */}
            <div className="space-y-2">
              {isRegistered ? (
                <div className="space-y-3">
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800/60 flex items-center justify-center gap-2 text-emerald-700 dark:text-emerald-300 font-semibold text-xs">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Seat Confirmed & Registered
                  </div>

                  {isLive ? (
                    <Link href={`/live-tests/${event.slug}/take`} className="w-full block">
                      <button
                        className="w-full py-3 px-4 rounded-xl text-sm font-bold bg-primary text-primary-foreground shadow-md transition-all hover:bg-primary/90 flex items-center justify-center gap-2"
                      >
                        Enter Live Test Room
                      </button>
                    </Link>
                  ) : (
                    <button
                      onClick={handleCancelRegistration}
                      disabled={isPending}
                      className="w-full py-2 px-3 rounded-lg text-xs font-medium text-muted-foreground hover:text-rose-600 transition-colors"
                    >
                      {isPending ? "Processing..." : "Cancel Registration"}
                    </button>
                  )}
                </div>
              ) : isRegistrationOpen ? (
                <button
                  onClick={handleRegister}
                  disabled={isPending}
                  className="w-full py-3.5 px-4 rounded-xl text-sm font-bold bg-primary text-primary-foreground shadow-md transition-all hover:bg-primary/90 hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Registering...
                    </>
                  ) : event.isPremiumOnly ? (
                    "Register with Premium"
                  ) : (
                    "Register for Free"
                  )}
                </button>
              ) : (
                <button
                  disabled
                  className="w-full py-3.5 px-4 rounded-xl text-sm font-semibold bg-muted text-muted-foreground cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <Lock className="w-4 h-4" />
                  Registration Closed
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
