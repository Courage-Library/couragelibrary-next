"use client";

import React, { useEffect, useState } from "react";

interface LiveEventCountdownProps {
  targetDate: string;
  label?: string;
  onExpire?: () => void;
  variant?: "badge" | "card" | "hero";
}

export function LiveEventCountdown({
  targetDate,
  label = "Starts in",
  onExpire,
  variant = "badge",
}: LiveEventCountdownProps) {
  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    isExpired: boolean;
  }>({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
    isExpired: false,
  });

  useEffect(() => {
    function calculateTime() {
      const difference = new Date(targetDate).getTime() - Date.now();
      if (difference <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: true });
        if (onExpire) onExpire();
        return;
      }

      const days = Math.floor(difference / (1000 * 60 * 60 * 24));
      const hours = Math.floor((difference / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((difference / 1000 / 60) % 60);
      const seconds = Math.floor((difference / 1000) % 60);

      setTimeLeft({ days, hours, minutes, seconds, isExpired: false });
    }

    calculateTime();
    const interval = setInterval(calculateTime, 1000);
    return () => clearInterval(interval);
  }, [targetDate, onExpire]);

  if (timeLeft.isExpired) {
    return (
      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-900">
        <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
        Live Now / Registration Closed
      </div>
    );
  }

  if (variant === "hero") {
    return (
      <div className="flex flex-col items-center gap-2 p-4 bg-primary/5 rounded-2xl border border-primary/20">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
        <div className="flex items-center gap-2 font-mono text-2xl md:text-3xl font-bold text-primary">
          {timeLeft.days > 0 && (
            <div className="flex flex-col items-center">
              <span>{String(timeLeft.days).padStart(2, "0")}</span>
              <span className="text-[10px] font-sans text-muted-foreground">DAYS</span>
            </div>
          )}
          {timeLeft.days > 0 && <span>:</span>}
          <div className="flex flex-col items-center">
            <span>{String(timeLeft.hours).padStart(2, "0")}</span>
            <span className="text-[10px] font-sans text-muted-foreground">HRS</span>
          </div>
          <span>:</span>
          <div className="flex flex-col items-center">
            <span>{String(timeLeft.minutes).padStart(2, "0")}</span>
            <span className="text-[10px] font-sans text-muted-foreground">MIN</span>
          </div>
          <span>:</span>
          <div className="flex flex-col items-center">
            <span>{String(timeLeft.seconds).padStart(2, "0")}</span>
            <span className="text-[10px] font-sans text-muted-foreground">SEC</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono font-medium bg-amber-50 text-amber-900 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800">
      <span className="text-[11px] font-sans text-amber-700 dark:text-amber-400">{label}:</span>
      <span>
        {timeLeft.days > 0 && `${timeLeft.days}d `}
        {String(timeLeft.hours).padStart(2, "0")}:{String(timeLeft.minutes).padStart(2, "0")}:
        {String(timeLeft.seconds).padStart(2, "0")}
      </span>
    </div>
  );
}
