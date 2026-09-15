import React from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MistakeListItem } from "@/services/mistake.service";
import { MistakeBookmarkButton } from "@/components/mistakes/mistake-bookmark-button";
import { RotateCcw, ArrowRight, Zap, CheckCircle2, AlertTriangle, Sparkles, StickyNote, BookOpen } from "lucide-react";

interface MistakeCardProps {
  mistake: MistakeListItem;
  isBookmarked?: boolean;
  learningContent?: {
    hasContent: boolean;
    title?: string;
    canonicalUrl?: string;
    isLocked?: boolean;
  } | null;
}

export function MistakeCard({ mistake, isBookmarked = false, learningContent }: MistakeCardProps) {
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "MASTERED":
        return (
          <Badge variant="success" className="text-[10px] font-bold px-2 py-0.5 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Mastered
          </Badge>
        );
      case "REVISITING":
        return (
          <Badge variant="warning" className="text-[10px] font-bold px-2 py-0.5 flex items-center gap-1">
            <Sparkles className="w-3 h-3" /> Improving
          </Badge>
        );
      default:
        return (
          <Badge variant="destructive" className="text-[10px] font-bold px-2 py-0.5 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Needs Revision
          </Badge>
        );
    }
  };

  const isRepeated = mistake.totalMistakesCount >= 2;
  const formattedDate = mistake.lastMistakeAt
    ? new Date(mistake.lastMistakeAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <div className="p-5 rounded-2xl bg-white border border-slate-200 hover:border-slate-300 hover:shadow-xs transition-all space-y-3.5">
      {/* Top Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          {getStatusBadge(mistake.lifecycleStatus)}

          <span className="font-bold text-slate-700 bg-slate-100 px-2.5 py-0.5 rounded-md text-[11px]">
            {mistake.primaryCognitiveName}
          </span>

          {mistake.subjectName && (
            <span className="text-slate-500 font-medium text-[11px]">
              {mistake.subjectName}
            </span>
          )}

          {mistake.topicName && (
            <span className="text-slate-400 text-[11px]">
              • {mistake.topicName}
            </span>
          )}

          {/* Subtle Note Indicator */}
          {mistake.hasNote && (
            <span
              title="Personal revision note recorded"
              className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-md"
            >
              <StickyNote className="w-3 h-3 text-indigo-600" />
              Note
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {mistake.hasRepeatedForgetting && (
            <Badge variant="outline" className="text-[10px] font-bold text-rose-700 bg-rose-50 border-rose-200 flex items-center gap-1" title="Repeatedly missed after previous revision">
              <RotateCcw className="w-3 h-3 text-rose-600" />
              Repeatedly Missed
            </Badge>
          )}

          {mistake.decayState === "REFRESH_DUE" && (
            <Badge variant="outline" className="text-[10px] font-bold text-blue-700 bg-blue-50 border-blue-200 flex items-center gap-1" title="Mastered concept due for refresher review">
              <Sparkles className="w-3 h-3 text-blue-600" />
              Refresh Due
            </Badge>
          )}

          {isRepeated ? (
            <Badge variant="outline" className="text-[10px] font-bold text-amber-700 bg-amber-50 border-amber-200 flex items-center gap-1">
              <RotateCcw className="w-3 h-3" />
              Wrong {mistake.totalMistakesCount} times
            </Badge>
          ) : (
            <span className="text-[11px] text-slate-400 font-mono">
              1 slip
            </span>
          )}

          {/* Card Bookmark Toggle */}
          <MistakeBookmarkButton
            questionId={mistake.questionId}
            initialBookmarked={isBookmarked}
            variant="icon"
          />
        </div>
      </div>

      {/* Question Prompt Preview */}
      <p className="text-sm font-medium text-slate-900 line-clamp-2 leading-relaxed">
        {mistake.questionText}
      </p>

      {/* Bottom Actions and Progress Row */}
      <div className="flex flex-wrap items-center justify-between pt-3 border-t border-slate-100 text-xs gap-3">
        <div className="flex items-center gap-3 text-[11px] text-slate-500">
          <span>
            Remediation:{" "}
            <strong
              className={
                mistake.consecutiveCorrect >= 2
                  ? "text-emerald-700 font-bold"
                  : mistake.consecutiveCorrect === 1
                  ? "text-amber-700 font-bold"
                  : "text-slate-700 font-bold"
              }
            >
              {mistake.consecutiveCorrect}/2
            </strong>
          </span>
          {formattedDate && (
            <span className="text-slate-400 font-mono">
              • Last slip: {formattedDate}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {learningContent?.hasContent && learningContent.canonicalUrl && (
            <Link href={learningContent.canonicalUrl}>
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-8 font-semibold text-teal-800 hover:text-teal-950 bg-teal-50/60 hover:bg-teal-100/70 border-teal-200/80 flex items-center gap-1.5"
              >
                <BookOpen className="w-3 h-3 text-teal-600" />
                Study Topic
              </Button>
            </Link>
          )}

          <Link href={`/mistakes/${mistake.vaultId}`}>
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-8 font-semibold text-slate-700 hover:text-slate-900 border-slate-200"
            >
              Review Solution <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </Link>

          <Link href="/mistakes/drill">
            <Button
              size="sm"
              className="text-xs h-8 font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs flex items-center gap-1"
            >
              <Zap className="w-3 h-3 text-amber-300 fill-amber-300" />
              Practice
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
