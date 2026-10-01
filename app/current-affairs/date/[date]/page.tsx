import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Container } from '@/components/ui/container';
import { CurrentAffairsService } from '@/services/current-affairs.service';
import { CurrentAffairsDailyQuizService } from '@/services/current-affairs-daily-quiz.service';
import { CurrentAffairsDailyQuizCard } from '@/components/current-affairs/current-affairs-daily-quiz-card';
import { CurrentAffairsFeedContainer } from '@/components/current-affairs/current-affairs-feed-container';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  Sparkles,
} from 'lucide-react';
import { formatEventDate } from '@/components/current-affairs/current-affairs-card';
import { constructMetadata } from '@/lib/seo/metadata';
import type { Metadata } from 'next';

export const revalidate = 60;

interface DateFeedPageProps {
  params: Promise<{ date: string }>;
}

export async function generateMetadata({ params }: DateFeedPageProps): Promise<Metadata> {
  const { date } = await params;
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(date)) {
    return constructMetadata({ title: 'Invalid Date', noIndex: true });
  }

  const feed = await CurrentAffairsService.getByDate(date);
  const formattedDate = formatEventDate(date);

  // If there are 0 published articles on this historical date, do not index empty pages
  const noIndex = feed.totalArticles === 0;

  return constructMetadata({
    title: `Current Affairs — ${formattedDate}`,
    description: `Read ${feed.totalArticles} exam-oriented current affairs event(s) for ${formattedDate}. Daily 10Q quiz and verified provenance for government competitive exams.`,
    canonicalUrl: `/current-affairs/date/${date}`,
    keywords: [`Current Affairs ${formattedDate}`, `Daily Current Affairs ${date}`, 'Exam Intelligence'],
    noIndex,
    ogType: 'website',
  });
}

export default async function CurrentAffairsDateFeedPage({ params }: DateFeedPageProps) {
  const { date } = await params;

  // Validate YYYY-MM-DD format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(date)) {
    notFound();
  }

  const feed = await CurrentAffairsService.getByDate(date);
  let quizReport;
  try {
    quizReport = await CurrentAffairsDailyQuizService.calculateEligibility(date);
  } catch {
    quizReport = {
      status: 'SHORTAGE_BLOCKED' as const,
      totalEligibleCount: 0,
      requiredCount: 10,
      shortageCount: 10,
      existingMockTestId: feed.dailyQuizMockId || null,
    };
  }

  // Calculate prev and next dates
  const currDateObj = new Date(date);
  const prevDate = new Date(currDateObj.getTime() - 86400000).toISOString().split('T')[0];
  const nextDate = new Date(currDateObj.getTime() + 86400000).toISOString().split('T')[0];
  const todayDate = CurrentAffairsService.getTodayDateStr();
  const hasNextDate = date < todayDate;

  return (
    <div className="min-h-screen bg-slate-50/50 dark:bg-slate-950 py-8 md:py-12">
      <Container className="space-y-8">
        {/* Top Breadcrumb & Navigation */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Link
            href="/current-affairs"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Current Affairs Hub</span>
          </Link>

          {/* Date Pager */}
          <div className="flex items-center gap-2">
            <Link
              href={`/current-affairs/date/${prevDate}`}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>{formatEventDate(prevDate)}</span>
            </Link>

            {hasNextDate && (
              <Link
                href={`/current-affairs/date/${nextDate}`}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 transition-colors"
              >
                <span>{formatEventDate(nextDate)}</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>
        </div>

        {/* Page Header */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-blue-600 dark:text-blue-400">
            <Calendar className="w-4 h-4" />
            <span>DAILY INTELLIGENCE FEED</span>
          </div>

          <h1 className="text-2xl md:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
            Current Affairs — {formatEventDate(date)}
          </h1>

          <p className="text-sm text-slate-600 dark:text-slate-300">
            {feed.totalArticles} published event{feed.totalArticles === 1 ? '' : 's'} recorded on this date.
          </p>
        </div>

        {/* Daily Quiz Card for this Date */}
        <CurrentAffairsDailyQuizCard
          dateStr={date}
          dailyQuiz={{
            status: quizReport.status,
            totalEligibleCount: quizReport.totalEligibleCount,
            requiredCount: 10,
            shortageCount: quizReport.shortageCount,
            mockTestSlug: `ca-daily-${date}`,
            mockTestId: feed.dailyQuizMockId || quizReport.existingMockTestId,
          }}
        />

        {/* Feed List */}
        <section aria-labelledby="date-articles-heading" className="space-y-6 pt-4">
          <h2 id="date-articles-heading" className="sr-only">
            Articles for {formatEventDate(date)}
          </h2>

          <CurrentAffairsFeedContainer
            articles={feed.articles}
            emptyTitle={`No events recorded for ${formatEventDate(date)}`}
            emptyDescription="Events for this historical date may not have been curated or are still in draft review."
          />
        </section>
      </Container>
    </div>
  );
}
