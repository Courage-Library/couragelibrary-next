"use client";

import React, { useState, useTransition } from "react";
import { toggleBookmarkAction } from "@/app/mistakes/actions";
import { Bookmark, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MistakeBookmarkButtonProps {
  questionId: string;
  questionVersionId?: string;
  initialBookmarked?: boolean;
  variant?: "icon" | "button";
  className?: string;
}

export function MistakeBookmarkButton({
  questionId,
  questionVersionId,
  initialBookmarked = false,
  variant = "button",
  className = "",
}: MistakeBookmarkButtonProps) {
  const [isBookmarked, setIsBookmarked] = useState<boolean>(initialBookmarked);
  const [isPending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (isPending) return;

    const previousState = isBookmarked;
    // Optimistic toggle
    setIsBookmarked(!previousState);
    setActionError(null);

    startTransition(async () => {
      try {
        const res = await toggleBookmarkAction(questionId, questionVersionId);
        if (res.success) {
          setIsBookmarked(res.isBookmarked);
        } else {
          // Rollback on failure
          setIsBookmarked(previousState);
          setActionError(res.error || "Failed to update bookmark");
        }
      } catch {
        setIsBookmarked(previousState);
        setActionError("Network error while bookmarking");
      }
    });
  };

  const accessibleLabel = isBookmarked ? "Remove bookmark" : "Bookmark question";

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={handleToggle}
        disabled={isPending}
        title={accessibleLabel}
        aria-label={accessibleLabel}
        className={`p-1.5 rounded-lg border transition-all ${
          isBookmarked
            ? "bg-indigo-50 border-indigo-200 text-indigo-600 hover:bg-indigo-100"
            : "bg-white border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-slate-50"
        } ${isPending ? "opacity-70 cursor-wait" : ""} ${className}`}
      >
        {isPending ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />
        ) : (
          <Bookmark
            className={`w-3.5 h-3.5 ${
              isBookmarked ? "fill-indigo-600 text-indigo-600" : ""
            }`}
          />
        )}
      </button>
    );
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={handleToggle}
      disabled={isPending}
      aria-label={accessibleLabel}
      className={`text-xs h-8 font-semibold transition-all ${
        isBookmarked
          ? "bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100"
          : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900"
      } ${className}`}
    >
      {isPending ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5 text-slate-500" />
      ) : (
        <Bookmark
          className={`w-3.5 h-3.5 mr-1.5 ${
            isBookmarked
              ? "fill-indigo-600 text-indigo-600"
              : "text-slate-500"
          }`}
        />
      )}
      {isBookmarked ? "Bookmarked" : "Bookmark"}
      {actionError && (
        <span className="sr-only">Error: {actionError}</span>
      )}
    </Button>
  );
}
