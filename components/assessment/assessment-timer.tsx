"use client";

import React, { useEffect, useState } from "react";
import { Clock, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface AssessmentTimerProps {
  initialRemainingSeconds: number;
  onTimeExpired: () => void;
  className?: string;
}

export function AssessmentTimer({
  initialRemainingSeconds,
  onTimeExpired,
  className,
}: AssessmentTimerProps) {
  const [seconds, setSeconds] = useState(initialRemainingSeconds);

  useEffect(() => {
    if (seconds <= 0) {
      onTimeExpired();
      return;
    }

    const interval = setInterval(() => {
      setSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          onTimeExpired();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [seconds, onTimeExpired]);

  const formatTime = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const isLowTime = seconds > 0 && seconds <= 300; // Under 5 minutes

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-mono font-bold transition-colors",
        isLowTime
          ? "bg-red-50 border-red-200 text-red-700 animate-pulse"
          : "bg-slate-50 border-slate-200 text-slate-800",
        className
      )}
    >
      {isLowTime ? <AlertTriangle className="w-4 h-4 text-red-600" /> : <Clock className="w-4 h-4 text-slate-500" />}
      <span>{formatTime(seconds)}</span>
    </div>
  );
}