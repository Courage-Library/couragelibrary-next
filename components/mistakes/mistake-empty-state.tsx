import React from "react";
import { Bookmark, BookOpen, CheckCircle2, RotateCcw, Search, Sparkles } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink } from "@/components/ui/button";

export type MistakeEmptyStateType =
  | "NO_MISTAKES_EVER"
  | "ALL_MASTERED"
  | "NO_REPEATED"
  | "NO_IMPROVING"
  | "NO_BOOKMARKED"
  | "NO_FILTER_MATCH";

interface MistakeEmptyStateProps {
  type: MistakeEmptyStateType;
}

// One clear next action per state (DESIGN_SYSTEM Empty state). Copy states only what is true.
const STATES: Record<MistakeEmptyStateType, { icon: React.ReactNode; title: string; description: string; href: string; cta: string; primary?: boolean }> = {
  NO_MISTAKES_EVER: {
    icon: <BookOpen />,
    title: "No mistakes yet",
    description: "Take a mock test. Every question you get wrong is saved here so you can revise it.",
    href: "/mock-tests",
    cta: "Take a mock test",
    primary: true,
  },
  ALL_MASTERED: {
    icon: <CheckCircle2 />,
    title: "You have mastered every mistake",
    description: "Nothing is left to revise. Take another mock test to find new questions to work on.",
    href: "/mock-tests",
    cta: "Take a mock test",
    primary: true,
  },
  NO_REPEATED: {
    icon: <RotateCcw />,
    title: "No repeated mistakes",
    description: "You have not got any question wrong more than once.",
    href: "/mistakes",
    cta: "Show all mistakes",
  },
  NO_IMPROVING: {
    icon: <Sparkles />,
    title: "Nothing in progress yet",
    description: "A mistake moves here after you answer it correctly once in a drill.",
    href: "/mistakes/drill",
    cta: "Start a drill",
    primary: true,
  },
  NO_BOOKMARKED: {
    icon: <Bookmark />,
    title: "No bookmarked mistakes",
    description: "Use the bookmark button on a mistake to keep it here for quick review.",
    href: "/mistakes",
    cta: "Show all mistakes",
  },
  NO_FILTER_MATCH: {
    icon: <Search />,
    title: "No mistakes match these filters",
    description: "Try a different search or clear the filters.",
    href: "/mistakes",
    cta: "Clear filters",
  },
};

export function MistakeEmptyState({ type }: MistakeEmptyStateProps) {
  const s = STATES[type];
  return (
    <EmptyState
      icon={s.icon}
      title={s.title}
      description={s.description}
      headingLevel={3}
      action={
        <ButtonLink href={s.href} variant={s.primary ? "primary" : "secondary"}>
          {s.cta}
        </ButtonLink>
      }
    />
  );
}
