"use client";

import React, { useEffect, useState, useRef } from "react";
import { Clock, AlertTriangle, Volume2, VolumeX } from "lucide-react";
import { MockAudio } from "@/lib/assessment/audio-alerts";
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
  const [isMuted, setIsMuted] = useState(false);
  const played5mWarning = useRef(false);
  const played1mWarning = useRef(false);

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

        const next = prev - 1;

        // 5-minute audio warning
        if (next === 300 && !played5mWarning.current) {
          played5mWarning.current = true;
          MockAudio.playReminderBeep();
        }

        // 1-minute audio warning
        if (next === 60 && !played1mWarning.current) {
          played1mWarning.current = true;
          MockAudio.playUrgentDoubleBeep();
        }

        return next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [seconds, onTimeExpired]);

  const toggleAudioMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    const muted = MockAudio.toggleMute();
    setIsMuted(muted);
  };

  const formatTime = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const isUnder1Min = seconds > 0 && seconds <= 60;
  const isUnder5Min = seconds > 0 && seconds <= 300;

  return (
    <div
      role="timer"
      aria-label={`Time remaining: ${formatTime(seconds)}`}
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-mono font-bold transition-all select-none",
        isUnder1Min
          ? "bg-red-50 border-red-300 text-red-700 animate-pulse shadow-xs"
          : isUnder5Min
          ? "bg-amber-50 border-amber-300 text-amber-800 shadow-xs"
          : "bg-slate-50 border-slate-200 text-slate-800",
        className
      )}
    >
      {isUnder1Min ? (
        <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
      ) : isUnder5Min ? (
        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
      ) : (
        <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
      )}
      <span className="tabular-nums">{formatTime(seconds)}</span>

      {/* Audio Mute / Unmute Toggle */}
      <button
        type="button"
        onClick={toggleAudioMute}
        title={isMuted ? "Unmute Timer Sound Alerts" : "Mute Timer Sound Alerts"}
        className="p-0.5 rounded text-slate-400 hover:text-slate-700 transition cursor-pointer"
      >
        {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}