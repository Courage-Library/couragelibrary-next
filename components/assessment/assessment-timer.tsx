"use client";

import React, { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { formatTimeLeft, monotonicNowMs, remainingSecondsAt, timerAnnouncement, timerPhase, timerTone } from "@/lib/assessment/timer";

interface AssessmentTimerProps {
  /** server-authoritative remaining time when the page was rendered */
  initialRemainingSeconds: number;
  onTimeExpired: () => void;
  className?: string;
}

/**
 * F3 (R7) exam timer — the countdown is UNCHANGED:
 * - The deadline is anchored ONCE from the server's remaining time; every tick recomputes from the clock, so a parent
 *   re-render can never restart or slow the countdown, and a background tab catches up immediately.
 * - onTimeExpired fires exactly ONCE (callback kept in a ref; a fired flag guards repeats).
 * EXAM-UX-1 presentation (owner spec 23 Nov 2026 §1.6; supersedes decision #84 "never red"): label "Time left" + mm:ss
 * (h:mm:ss from 1 h), tabular numbers; normal (cl-blue tint) → amber at ≤ 5:00 → red at ≤ 1:00; no flashing, no sound;
 * colour is never the only signal — the label, plus ONE screen-reader announcement at 5 min and ONE at 1 min.
 */
export function AssessmentTimer({ initialRemainingSeconds, onTimeExpired, className }: AssessmentTimerProps) {
  const deadlineRef = useRef<number | null>(null);
  const firedRef = useRef(false);
  const onExpiredRef = useRef(onTimeExpired);
  onExpiredRef.current = onTimeExpired;
  const [seconds, setSeconds] = useState(Math.max(0, Math.floor(initialRemainingSeconds)));
  const [announce, setAnnounce] = useState("");

  useEffect(() => {
    // anchored once on a MONOTONIC clock: the server's remaining time + elapsed real time; the wall clock is ignored (Q6)
    if (deadlineRef.current === null) deadlineRef.current = monotonicNowMs() + Math.max(0, initialRemainingSeconds) * 1000;
    const tick = () => {
      const left = remainingSecondsAt(deadlineRef.current as number, monotonicNowMs());
      setSeconds(left);
      if (left <= 0 && !firedRef.current) {
        firedRef.current = true;
        onExpiredRef.current();
      }
    };
    tick();
    const interval = setInterval(tick, 500);
    const onVisible = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // anchored once: the server value is read only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const phase = timerPhase(seconds);
  const tone = timerTone(seconds);
  // announced only when the tone CHANGES to amber (5 min) or red (1 min) — never every second
  useEffect(() => {
    const text = timerAnnouncement(tone);
    if (text) setAnnounce(text);
  }, [tone]);

  const time = formatTimeLeft(seconds);
  return (
    <div
      role="timer"
      aria-label={`Time left: ${time}`}
      data-timer-phase={phase}
      data-timer-tone={tone}
      className={cn(
        "flex min-h-11 items-center gap-2 rounded-xl border px-3 select-none",
        tone === "red"
          ? "border-cl-timer-red bg-cl-timer-red-tint text-cl-timer-red-text"
          : tone === "amber"
            ? "border-cl-timer-amber bg-cl-timer-amber-tint text-cl-timer-amber-text"
            : "border-cl-blue-line bg-cl-blue-tint text-cl-blue-text",
        className,
      )}
    >
      {/* the visible label from 640 px; on narrow phones the time alone (the accessible name always says "Time left") */}
      <span aria-hidden="true" className="text-caption font-semibold max-sm:hidden" data-timer-label="">
        Time left
      </span>
      <span aria-hidden="true" className="font-mono text-body-sm font-bold tabular-nums">
        {time}
      </span>
      <span className="sr-only" aria-live="polite" data-timer-announce="">
        {announce}
      </span>
    </div>
  );
}
