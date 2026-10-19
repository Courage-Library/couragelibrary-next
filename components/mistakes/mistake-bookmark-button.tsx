"use client";

import React, { useState, useTransition } from "react";
import { Bookmark } from "lucide-react";
import { toggleBookmarkAction } from "@/app/mistakes/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";

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

  // icon toggle: stable name + aria-pressed carries the state; text variant: the visible text carries it
  const isIcon = variant === "icon";
  const icon = <Bookmark aria-hidden="true" className={cn("size-5", isBookmarked && "fill-current")} />;

  return (
    <>
      <Button
        type="button"
        variant={isBookmarked ? "ghost" : "secondary"}
        iconOnly={isIcon}
        onClick={handleToggle}
        loading={isPending}
        aria-pressed={isIcon ? isBookmarked : undefined}
        aria-label={isIcon ? "Bookmark question" : undefined}
        title={isIcon ? (isBookmarked ? "Bookmarked" : "Bookmark question") : undefined}
        leadingIcon={isIcon ? undefined : icon}
        className={cn(isBookmarked && "bg-primary-50 text-primary-700", className)}
      >
        {isIcon ? icon : isBookmarked ? "Bookmarked" : "Bookmark"}
      </Button>
      {actionError && (
        <span role="alert" className="sr-only">
          Error: {actionError}
        </span>
      )}
    </>
  );
}
