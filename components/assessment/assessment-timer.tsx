"use client";

import React, { useEffect, useRef, useState } from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { monotonicNowMs, remainingSecondsAt, timerPhase } from "@/lib/assessment/timer";

interface AssessmentTimerProps {
  /** server-authoritative remaining time when the page was rendered */
  initialRemainingSeconds: number;
  onTimeExpired: () => void;
  className?: string;
}

/**
 * F3 (R7 / R8) exam timer.
 * - The deadline is anchored ONCE from the server's remaining time; every tick recomputes from the clock, so a parent
 *   re-render can never restart or slow the countdown, and a background tab catches up immediately.
 * - onTimeExpired fires exactly ONCE (callback kept in a ref; a fired flag guards repeats).
 * - Calm: no sound, no flashing / pulsing. One quiet final-minutes state (≤ 5 min: amber surface + "5 min left"
 *   text, announced once to screen readers). Colour is never the only signal.
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
  useEffect(() => {
    if (phase === "final") setAnnounce("5 minutes or less left.");
  }, [phase]);

  const formatTime = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    if (hours > 0) return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    return `${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div
      role="timer"
      aria-label={`Time left: ${formatTime(seconds)}`}
      data-timer-phase={phase}
      className={cn(
        "flex min-h-12 items-center gap-2 rounded-xl border px-3 text-sm font-mono font-bold select-none",
        phase === "final" ? "bg-accent-50 border-accent-300 text-fg" : "bg-canvas border-line text-fg",
        className,
      )}
    >
      <Clock aria-hidden="true" className={cn("size-4 shrink-0", phase === "final" ? "text-accent-800" : "text-fg-muted")} />
      <span className="tabular-nums">{formatTime(seconds)}</span>
      {phase === "final" && <span className="font-sans text-caption font-semibold text-fg">5 min left</span>}
      <span className="sr-only" aria-live="polite">
        {announce}
      </span>
    </div>
  );
}
