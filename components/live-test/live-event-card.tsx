"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */

import React from "react";
import Link from "next/link";
import { type LiveEventCardData } from "@/types/live-test";
import { LiveEventCountdown } from "@/components/live-test/live-event-countdown";
import { Calendar, Clock, CheckCircle2, Trophy, Users, ShieldAlert, Sparkles, ArrowRight } from "lucide-react";

interface LiveEventCardProps {
  event: LiveEventCardData;
}

export function LiveEventCard({ event }: LiveEventCardProps) {
  const isRegistrationOpen = event.status === "REGISTRATION_OPEN";
  const isLive = event.status === "LIVE";
  const isCompleted = ["RESULTS_READY", "PUBLISHED", "ARCHIVED"].includes(event.status);

  return (
    <div className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm p-6 shadow-sm transition-all duration-300 hover:shadow-md hover:border-primary/40">
      {/* Top Banner & Badges */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
            {event.examTitle}
          </span>

          {event.isPremiumOnly && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              <Sparkles className="w-3 h-3" />
              PREMIUM
            </span>
          )}

          {isLive && (
            <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-bold bg-rose-500 text-white animate-pulse">
              <span className="w-2 h-2 rounded-full bg-white" />
              LIVE NOW
            </span>
          )}
        </div>

        {/* Title & Description */}
        <div>
          <h3 className="font-bold text-lg text-foreground group-hover:text-primary transition-colors line-clamp-1">
            {event.title}
          </h3>
          {event.description && (
            <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
              {event.description}
            </p>
          )}
        </div>

        {/* Schedule & Timing Info */}
        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground pt-2 border-t border-border/40">
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-primary/70 shrink-0" />
            <span className="truncate">{event.formattedStartAt}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-primary/70 shrink-0" />
            <span>{event.durationMinutes} Mins</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Trophy className="w-3.5 h-3.5 text-primary/70 shrink-0" />
            <span>{event.totalQuestions} Qs • {event.totalMarks} Marks</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-primary/70 shrink-0" />
            <span>{event.registeredCount.toLocaleString()} Registered</span>
          </div>
        </div>
      </div>

      {/* Footer & CTA */}
      <div className="mt-5 pt-4 border-t border-border/40 flex items-center justify-between gap-3">
        {/* Countdown */}
        {isRegistrationOpen && !isLive && (
          <LiveEventCountdown targetDate={event.eventStartAt} label="Starts in" />
        )}

        {isLive && (
          <span className="text-xs font-semibold text-rose-600 dark:text-rose-400">
            Window Closing Soon
          </span>
        )}

        {isCompleted && (
          <span className="text-xs font-medium text-muted-foreground">
            Event Concluded
          </span>
        )}

        {/* Action Button */}
        <div className="flex items-center gap-2">
          {event.isRegistered ? (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              Registered
            </div>
          ) : null}

          <Link
            href={`/live-tests/${event.slug}`}
            className="inline-flex items-center gap-1 px-4 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground shadow-sm transition-all hover:bg-primary/90"
          >
            {event.isRegistered ? "View Details" : isRegistrationOpen ? "Register Free" : "Details"}
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
