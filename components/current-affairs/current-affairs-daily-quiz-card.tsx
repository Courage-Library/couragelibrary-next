'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, ListChecks } from 'lucide-react';
import { DailyQuizEligibilityStatus } from '@/types/current-affairs';
import { formatEventDate } from '@/lib/current-affairs/format-event-date';
import { formatMockShape } from '@/lib/assessment/display-rules';

interface CurrentAffairsDailyQuizCardProps {
  dateStr: string;
  dailyQuiz: {
    status: DailyQuizEligibilityStatus;
    totalEligibleCount: number;
    requiredCount: number;
    shortageCount: number;
    mockTestSlug: string;
    mockTestId?: string | null;
  };
  /** F7 (R12): facts read from the published mock; null → no figures are shown */
  shape?: { totalQuestions: number; durationMinutes: number; totalMarks: number } | null;
}

/**
 * F7 Daily 10Q card in the design system: light surface, ONE primary action ("Start today's quiz"), only true facts
 * (from the mock itself), no glow / gradient / pulse (R4, R8, R10, R12). The quiz runs in the standard mock player and
 * its result page; wrong answers reach the Mistake Vault through the one submit path.
 */
export const CurrentAffairsDailyQuizCard: React.FC<CurrentAffairsDailyQuizCardProps> = ({ dateStr, dailyQuiz, shape = null }) => {
  // UX-2b.H (H-5): render only a PUBLISHED quiz mock. READY means no mock exists yet (the link would be dead) and
  // DRAFT_EXISTS still carries the draft mock's id, so neither may show a "Start" link or a "being curated" claim.
  const isAvailable = dailyQuiz.status === 'ALREADY_PUBLISHED' && Boolean(dailyQuiz.mockTestId);
  if (!isAvailable) return null;

  const formattedDate = formatEventDate(dateStr);
  const quizTargetHref = `/mock-tests/${dailyQuiz.mockTestId || dailyQuiz.mockTestSlug}`;
  const facts = shape ? `${formatMockShape(shape)} · ${shape.totalMarks} marks` : null;

  return (
    <div className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6" data-daily-quiz-card="">
      <div className="flex gap-3">
        <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
          <ListChecks className="size-6" />
        </span>
        <div className="flex flex-col gap-1">
          <p className="text-body-sm font-medium text-fg-secondary">{formattedDate}</p>
          <h2 id="daily-quiz-heading" className="text-h3 font-bold text-fg">
            Daily current affairs quiz
          </h2>
          {facts && <p className="text-body-sm text-fg-secondary" data-daily-quiz-facts="">{facts}</p>}
          <p className="text-body-sm text-fg-secondary">
            Questions on today&apos;s published events. Wrong answers go to your Mistake drills.
          </p>
        </div>
      </div>
      <Link
        href={quizTargetHref}
        className="focus-ring inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-control bg-primary-700 px-5 text-body font-semibold text-fg-inverse hover:bg-primary-800"
      >
        Start today&apos;s quiz
        <ArrowRight aria-hidden="true" className="size-4" />
      </Link>
    </div>
  );
};
